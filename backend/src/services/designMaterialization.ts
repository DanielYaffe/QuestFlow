import mongoose from 'mongoose';
import CharacterModel, { CharacterKind } from '../models/characterModel';
import ItemModel, { ItemRarity } from '../models/itemModel';
import { createItem } from './itemService';
import { loadExactKbEntity } from './templateEntityMappingService';
import { canonicalEntityId, ENTITY_ID_KEYS } from './structuredParse';
import { allocateId } from './idAllocationService';
import { KbType } from './qdrant';

// ---------------------------------------------------------------------------
// Design materialization — turning a *proposed design* (a name the AI returned,
// with no document behind it) into a real project-scoped Character or Item.
//
// This is the only path by which a KB entity becomes something an author can
// edit, sprite, or pin to a node. Shared by the quest-generation wizard and the
// quest editor's AI edits so both dedupe identically.
// ---------------------------------------------------------------------------

export type DesignKind = CharacterKind | 'item';

export interface ProposedDesign {
  tempId: string;
  kind: DesignKind;
  name: string;
  // Characters
  appearance?: string;
  lore?: string;
  // Items
  description?: string;
  rarity?: ItemRarity;
  /** Exact KB entity name this proposal reuses. Caller must have validated it. */
  kbRef?: string;
  /** Existing project design this proposal reuses, if the model named one. */
  existingId?: string;
}

export interface MaterializedDesign {
  tempId: string;
  id: string;
  kind: DesignKind;
  name: string;
  /** Persisted "{gameId}:{entityName}" tag, or '' when not KB-linked. */
  kbRef: string;
  /** False when an existing design was linked rather than a new one written. */
  created: boolean;
}

export interface MaterializeResult {
  /** tempId → real design id, for remapping node references. */
  ids: Record<string, string>;
  designs: MaterializedDesign[];
  /** Why some designs were created without an id (e.g. no configured range). */
  allocationWarnings: string[];
}

/** The provenance tag persisted on a design. Mirrors characterModel's kbRef. */
export function kbRefTag(gameId: string, entityName: string): string {
  return `${gameId}:${entityName.trim()}`;
}

/**
 * Coerce any AI-emitted role to the CharacterModel enum. Any hostile descriptor
 * maps to 'monster'; everything else defaults to 'npc'.
 */
export function normalizeCharacterKind(role: unknown): CharacterKind {
  if (typeof role === 'string') {
    const normalized = role.toLowerCase().trim();
    if (normalized === 'monster') return 'monster';
    if (normalized === 'npc') return 'npc';
    if (/enemy|boss|antagonist|evil|foe|villain|creature|beast|mob|hostile/.test(normalized)) return 'monster';
  }
  return 'npc';
}

const norm = (s: string): string => s.trim().toLowerCase();

// Minimal view of an existing design — keeps Mongoose's lean document types out
// of the lookup caches, which we also write synthesized rows into.
interface DesignRow {
  id: string;
  name: string;
  kbRef: string;
  customFields: Record<string, unknown>;
  mapleId: number;
}

interface Lookup {
  byId: Map<string, DesignRow>;
  byKbRef: Map<string, string>;
  /** Characters are keyed "{kind}:{name}"; items by name alone. */
  byName: Map<string, string>;
}

function emptyLookup(): Lookup {
  return { byId: new Map(), byKbRef: new Map(), byName: new Map() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeMissingFields(
  current: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, sourceValue] of Object.entries(source)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = sourceValue;
      continue;
    }
    const currentValue = merged[key];
    if (isRecord(currentValue) && isRecord(sourceValue)) {
      merged[key] = mergeMissingFields(currentValue, sourceValue);
    }
  }
  return merged;
}

/** Replace the id aliases in `fields` with whatever the KB currently states. */
function withCanonicalId(
  fields: Record<string, unknown>,
  kbFields: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...fields };
  for (const key of ENTITY_ID_KEYS) {
    if (key in kbFields) next[key] = kbFields[key];
  }
  return next;
}

function kbTypeFor(kind: DesignKind): KbType {
  if (kind === 'item') return 'items';
  return kind === 'monster' ? 'monsters' : 'characters';
}

function entityNameFromProposal(gameId: string, kbRef: string | undefined): string {
  const ref = kbRef?.trim() ?? '';
  return ref.startsWith(`${gameId}:`) ? ref.slice(gameId.length + 1).trim() : ref;
}

function index<T extends DesignRow>(rows: T[], nameKey: (row: T) => string): Lookup {
  const lookup = emptyLookup();
  for (const row of rows) {
    lookup.byId.set(row.id, row);
    if (row.kbRef) lookup.byKbRef.set(row.kbRef, row.id);
    lookup.byName.set(nameKey(row), row.id);
  }
  return lookup;
}

interface ResolveArgs {
  ownerId: string;
  projectId: string;
  /** '' when the questline has no linked game — proposals are then never grounded. */
  gameId: string;
  proposals: ProposedDesign[];
}

/**
 * Resolve every proposal to a design id, creating documents only where nothing
 * suitable already exists.
 *
 * Resolution order, per proposal:
 *   1. `existingId` naming a design in this project    → link
 *   2. matching kbRef tag                              → link
 *   3. case-insensitive name match                     → link, and backfill
 *      kbRef when the doc has none and this proposal is KB-backed
 *   4. otherwise                                       → create
 *
 * Name matching is scoped to the same kind. A monster and an NPC that share a
 * name stay separate designs: node references are kind-slotted (npcIds vs
 * monsterIds) and the editor's pickers filter by kind, so linking across kinds
 * would produce a reference the author cannot see or remove.
 */
export async function materializeDesigns(args: ResolveArgs): Promise<MaterializeResult> {
  const { ownerId, projectId, gameId, proposals } = args;
  if (proposals.length === 0) return { ids: {}, designs: [], allocationWarnings: [] };

  const [characterDocs, itemDocs] = await Promise.all([
    CharacterModel.find({ projectId }).select('name kind kbRef customFields maple.mapleId').lean(),
    ItemModel.find({ projectId }).select('name kbRef customFields maple.mapleId').lean(),
  ]);

  const characters = index(
    characterDocs.map((c) => ({
      id: String(c._id),
      name: c.name,
      kbRef: c.kbRef ?? '',
      kind: c.kind,
      customFields: isRecord(c.customFields) ? c.customFields : {},
      mapleId: c.maple?.mapleId ?? 0,
    })),
    (row) => `${row.kind}:${norm(row.name)}`,
  );
  const items = index(
    itemDocs.map((i) => ({
      id: String(i._id),
      name: i.name,
      kbRef: i.kbRef ?? '',
      customFields: isRecord(i.customFields) ? i.customFields : {},
      mapleId: i.maple?.mapleId ?? 0,
    })),
    (row) => norm(row.name),
  );

  const ids: Record<string, string> = {};
  const designs: MaterializedDesign[] = [];
  const kbEntityCache = new Map<string, ReturnType<typeof loadExactKbEntity>>();
  // Ids handed out during this call. A freshly created design is not yet in the
  // query the allocator runs, so without this a batch would reuse one id.
  const allocatedThisBatch = new Set<number>(
    [...characterDocs, ...itemDocs].flatMap((doc) => (doc.maple?.mapleId ? [doc.maple.mapleId] : [])),
  );
  const allocationWarnings = new Set<string>();

  for (const proposal of proposals) {
    const name = proposal.name?.trim();
    if (!name) continue;

    const isItem = proposal.kind === 'item';
    const lookup = isItem ? items : characters;
    const nameKey = isItem ? norm(name) : `${proposal.kind}:${norm(name)}`;
    const kbEntityName = gameId ? entityNameFromProposal(gameId, proposal.kbRef) : '';
    const tag = gameId && kbEntityName ? kbRefTag(gameId, kbEntityName) : '';
    const kbType = kbTypeFor(proposal.kind);
    const kbCacheKey = `${kbType}:${kbEntityName}`;
    let kbEntityPromise = kbEntityCache.get(kbCacheKey);
    if (tag && !kbEntityPromise) {
      kbEntityPromise = loadExactKbEntity(gameId, kbType, kbEntityName);
      kbEntityCache.set(kbCacheKey, kbEntityPromise);
    }
    const kbEntity = kbEntityPromise ? await kbEntityPromise : undefined;
    const kbFields = kbEntity?.fields ?? {};
    const kbEntityId = canonicalEntityId(kbEntity?.fields);

    // 1. Explicit reuse of a project design. A character proposal must not
    //    resolve to an item id, so we only consult its own lookup.
    let resolvedId = '';
    if (proposal.existingId
      && mongoose.isValidObjectId(proposal.existingId)
      && lookup.byId.has(proposal.existingId)) {
      resolvedId = proposal.existingId;
    }

    // 2. Same KB entity already materialized here.
    if (!resolvedId && tag) resolvedId = lookup.byKbRef.get(tag) ?? '';

    // 3. Same name — link rather than mint a near-duplicate.
    if (!resolvedId) resolvedId = lookup.byName.get(nameKey) ?? '';

    if (resolvedId) {
      const row = lookup.byId.get(resolvedId);
      let kbRef = row?.kbRef ?? '';
      // Backfill provenance onto a design that predates the KB link, so it
      // reads as grounded from now on and later proposals take the fast path.
      if (tag && !kbRef) {
        const filter = { _id: resolvedId, projectId };
        const patch = { $set: { kbRef: tag } };
        if (isItem) await ItemModel.updateOne(filter, patch);
        else await CharacterModel.updateOne(filter, patch);
        kbRef = tag;
        if (row) row.kbRef = tag;
        lookup.byKbRef.set(tag, resolvedId);
      }
      if (row && kbEntity) {
        // Descriptive fields merge (an author edit wins), but identity is the
        // KB's to state: a design linked before the KB file was re-uploaded
        // otherwise keeps an id the game no longer uses, and nothing else in the
        // app would ever correct it.
        const mergedFields = withCanonicalId(mergeMissingFields(row.customFields, kbFields), kbFields);
        const set: Record<string, unknown> = {};
        if (JSON.stringify(mergedFields) !== JSON.stringify(row.customFields)) {
          set.customFields = mergedFields;
          row.customFields = mergedFields;
        }
        if (kbEntityId && kbEntityId !== row.mapleId) {
          set['maple.mapleId'] = kbEntityId;
          row.mapleId = kbEntityId;
        }
        if (Object.keys(set).length) {
          const filter = { _id: resolvedId, projectId };
          if (isItem) await ItemModel.updateOne(filter, { $set: set });
          else await CharacterModel.updateOne(filter, { $set: set });
        }
      }
      // A design that predates automatic allocation carries no id at all, so
      // every mapped field referencing it resolves to nothing and the node
      // silently falls back to another character. Casting it into a quest is
      // the moment to give it one. customFields is checked too — an id may
      // live only there — so this never mints a second id for a design that
      // already has one.
      const currentId = row ? (canonicalEntityId(row.customFields) || row.mapleId) : 0;
      if (row && !currentId) {
        const allocation = await allocateId({
          projectId,
          type: isItem ? 'item' : 'npc',
          excludeRecordId: resolvedId,
          taken: allocatedThisBatch,
        });
        if (allocation.id) {
          row.mapleId = allocation.id;
          allocatedThisBatch.add(allocation.id);
          const filter = { _id: resolvedId, projectId };
          const patch = { $set: { 'maple.mapleId': allocation.id } };
          if (isItem) await ItemModel.updateOne(filter, patch);
          else await CharacterModel.updateOne(filter, patch);
        } else if (allocation.error) {
          allocationWarnings.add(allocation.error);
        }
      } else if (currentId) {
        allocatedThisBatch.add(currentId);
      }

      ids[proposal.tempId] = resolvedId;
      designs.push({ tempId: proposal.tempId, id: resolvedId, kind: proposal.kind, name, kbRef, created: false });
      continue;
    }

    // 4. Nothing matched — write the design.
    //
    // A KB-grounded design keeps the game's own id. Anything invented needs one
    // allocated now, or it is written with id 0 and every invented design in the
    // project shares that id until somebody presses Allocate by hand.
    // `allocatedThisBatch` covers ids handed out but not yet visible to a query.
    let mapleId = kbEntityId;
    if (!mapleId) {
      const allocation = await allocateId({
        projectId,
        type: isItem ? 'item' : 'npc',
        taken: allocatedThisBatch,
      });
      if (allocation.id) {
        mapleId = allocation.id;
        allocatedThisBatch.add(allocation.id);
      } else if (allocation.error) {
        // No pool configured is a project setup gap, not a reason to refuse the
        // design — it is created unided, exactly as before.
        allocationWarnings.add(allocation.error);
      }
    } else {
      allocatedThisBatch.add(mapleId);
    }

    let newId: string;
    if (isItem) {
      const doc = await createItem({
        ownerId,
        projectId,
        name,
        description: proposal.description ?? '',
        rarity: proposal.rarity,
        kbRef: tag,
        customFields: kbFields,
        ...(mapleId ? { maple: { mapleId } as Parameters<typeof createItem>[0]['maple'] } : {}),
      });
      newId = String(doc._id);
    } else {
      const doc = await CharacterModel.create({
        ownerId,
        projectId,
        kind: proposal.kind,
        name,
        appearance: proposal.appearance ?? '',
        lore: proposal.lore ?? '',
        kbRef: tag,
        customFields: kbFields,
        ...(mapleId ? { maple: { mapleId } } : {}),
      });
      newId = String(doc._id);
    }

    // Index the new design so a later proposal naming it again links instead
    // of creating a second copy within this same batch.
    const row: DesignRow = {
      id: newId,
      name,
      kbRef: tag,
      customFields: kbFields,
      mapleId,
    };
    lookup.byId.set(newId, row);
    lookup.byName.set(nameKey, newId);
    if (tag) lookup.byKbRef.set(tag, newId);

    ids[proposal.tempId] = newId;
    designs.push({ tempId: proposal.tempId, id: newId, kind: proposal.kind, name, kbRef: tag, created: true });
  }

  return { ids, designs, allocationWarnings: [...allocationWarnings] };
}
