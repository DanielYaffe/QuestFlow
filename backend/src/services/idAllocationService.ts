import mongoose from 'mongoose';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import QuestlineModel from '../models/questlineModel';
import ProjectModel, { IMapleIdRange, IProject } from '../models/projectModel';
import { ENTITY_ID_KEYS } from './structuredParse';

// ---------------------------------------------------------------------------
// Project id allocation.
//
// Every exported asset needs an id the target game will accept: inside one of
// the project's configured ranges, and used by nothing else in the project.
// Before this, ids were only ever assigned by a manual button, so anything
// created by the wizard or an AI edit stayed at 0 — and quest ids were derived
// from the node's position, so every questline in a project exported quests
// 1..N and collided with every other.
//
// Ids are drawn at random rather than lowest-first. Two designs created moments
// apart would otherwise both read the same "lowest free" value before either was
// written; random draws over a large pool make that unlikely, and callers
// creating a batch pass the ids they have already handed out via `taken`.
// ---------------------------------------------------------------------------

export type AllocatableIdType = 'npc' | 'item' | 'quest';

export interface IdAllocation {
  id: number;
  /** Why nothing could be allocated. '' when `id` is usable. */
  error: string;
}

const NO_POOL = (type: AllocatableIdType): string =>
  `No ${type} ID range is configured for this project — add one in the project's Maple settings.`;

const EXHAUSTED = (type: AllocatableIdType): string =>
  `Every ${type} ID in the configured ranges is already in use.`;

/** How many random draws before falling back to an ordered scan of the pool. */
const RANDOM_ATTEMPTS = 40;

export function rangesFor(project: IProject, type: AllocatableIdType): IMapleIdRange[] {
  const settings = project.mapleSettings;
  const ranges = type === 'npc' ? settings?.npcIdRanges
    : type === 'item' ? settings?.itemIdRanges
      : settings?.questIdRanges;
  return (ranges ?? [])
    .map((range) => ({ min: Math.max(1, Math.min(range.min, range.max)), max: Math.max(range.min, range.max) }))
    .filter((range) => range.max >= range.min);
}

function poolSize(ranges: IMapleIdRange[]): number {
  return ranges.reduce((total, range) => total + (range.max - range.min + 1), 0);
}

/** The nth id across the ranges, treating them as one contiguous sequence. */
function idAtOffset(ranges: IMapleIdRange[], offset: number): number {
  let remaining = offset;
  for (const range of ranges) {
    const size = range.max - range.min + 1;
    if (remaining < size) return range.min + remaining;
    remaining -= size;
  }
  return 0;
}

function numericId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Every id already spoken for in this project.
 *
 * customFields is read as well as maple.mapleId: a design materialized from the
 * knowledge base carries the game's own id there, and handing that number to a
 * second design would collide on export while both documents looked free.
 */
export async function usedIds(
  projectId: string,
  type: AllocatableIdType,
  excludeRecordId?: string,
): Promise<Set<number>> {
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const id = numericId(value);
    if (id) ids.add(id);
  };
  const addCustomFields = (fields: unknown) => {
    if (!isRecord(fields)) return;
    for (const key of ENTITY_ID_KEYS) add(fields[key]);
  };

  if (type === 'quest') {
    const questlines = await QuestlineModel.find({ projectId }).select('nodes.exportFields.questId').lean();
    for (const questline of questlines) {
      for (const node of questline.nodes ?? []) add(node.exportFields?.questId);
    }
    return ids;
  }

  const scope = excludeRecordId ? { projectId, _id: { $ne: excludeRecordId } } : { projectId };
  // Both kinds of character are scanned, not just NPCs: a monster's id lives in
  // the same documents and the same customFields, so treating it as free would
  // hand the same number out twice.
  const [characters, items] = await Promise.all([
    CharacterModel.find(scope).select('maple.mapleId customFields').lean(),
    ItemModel.find(scope).select('maple.mapleId customFields').lean(),
  ]);
  const rows = type === 'npc' ? characters : items;
  for (const row of rows) {
    add(row.maple?.mapleId);
    addCustomFields(row.customFields);
  }
  return ids;
}

/**
 * The project's settings, or null when the id cannot name one. A caller with a
 * malformed project id gets "no pool configured" rather than a thrown CastError
 * — allocation is an enrichment and must never fail a design's creation.
 */
async function loadProject(projectId: string): Promise<IProject | null> {
  if (!mongoose.isValidObjectId(projectId)) return null;
  return ProjectModel.findById(projectId).select('mapleSettings').lean() as Promise<IProject | null>;
}

/**
 * A free id from the project's pool for this type, or an error explaining why
 * there is none. `taken` lets a caller allocating several ids in one pass
 * exclude the ones it has already handed out but not yet written.
 */
export async function allocateId(args: {
  projectId: string;
  type: AllocatableIdType;
  excludeRecordId?: string;
  taken?: Iterable<number>;
}): Promise<IdAllocation> {
  const project = await loadProject(args.projectId);
  if (!project) return { id: 0, error: NO_POOL(args.type) };

  const ranges = rangesFor(project, args.type);
  if (!ranges.length) return { id: 0, error: NO_POOL(args.type) };

  const used = await usedIds(args.projectId, args.type, args.excludeRecordId);
  for (const id of args.taken ?? []) used.add(id);

  const size = poolSize(ranges);
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
    const candidate = idAtOffset(ranges, Math.floor(Math.random() * size));
    if (candidate && !used.has(candidate)) return { id: candidate, error: '' };
  }

  // A pool this full is worth scanning rather than guessing at.
  for (let offset = 0; offset < size; offset += 1) {
    const candidate = idAtOffset(ranges, offset);
    if (candidate && !used.has(candidate)) return { id: candidate, error: '' };
  }
  return { id: 0, error: EXHAUSTED(args.type) };
}

/**
 * Allocate several ids of one type in a single pass, without re-reading the
 * project's used set per id.
 */
export async function allocateIds(args: {
  projectId: string;
  type: AllocatableIdType;
  count: number;
  taken?: Iterable<number>;
}): Promise<{ ids: number[]; error: string }> {
  if (args.count <= 0) return { ids: [], error: '' };
  const project = await loadProject(args.projectId);
  if (!project) return { ids: [], error: NO_POOL(args.type) };

  const ranges = rangesFor(project, args.type);
  if (!ranges.length) return { ids: [], error: NO_POOL(args.type) };

  const used = await usedIds(args.projectId, args.type);
  for (const id of args.taken ?? []) used.add(id);

  const size = poolSize(ranges);
  const ids: number[] = [];
  for (let index = 0; index < args.count; index += 1) {
    let allocated = 0;
    for (let attempt = 0; attempt < RANDOM_ATTEMPTS && !allocated; attempt += 1) {
      const candidate = idAtOffset(ranges, Math.floor(Math.random() * size));
      if (candidate && !used.has(candidate)) allocated = candidate;
    }
    if (!allocated) {
      for (let offset = 0; offset < size && !allocated; offset += 1) {
        const candidate = idAtOffset(ranges, offset);
        if (candidate && !used.has(candidate)) allocated = candidate;
      }
    }
    if (!allocated) return { ids, error: EXHAUSTED(args.type) };
    used.add(allocated);
    ids.push(allocated);
  }
  return { ids, error: '' };
}
