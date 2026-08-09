import mongoose from 'mongoose';
import CharacterModel, { CharacterKind } from '../models/characterModel';
import ItemModel, { ItemRarity } from '../models/itemModel';
import { createItem } from './itemService';

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
  if (proposals.length === 0) return { ids: {}, designs: [] };

  const [characterDocs, itemDocs] = await Promise.all([
    CharacterModel.find({ projectId }).select('name kind kbRef').lean(),
    ItemModel.find({ projectId }).select('name kbRef').lean(),
  ]);

  const characters = index(
    characterDocs.map((c) => ({
      id: String(c._id),
      name: c.name,
      kbRef: c.kbRef ?? '',
      kind: c.kind,
    })),
    (row) => `${row.kind}:${norm(row.name)}`,
  );
  const items = index(
    itemDocs.map((i) => ({ id: String(i._id), name: i.name, kbRef: i.kbRef ?? '' })),
    (row) => norm(row.name),
  );

  const ids: Record<string, string> = {};
  const designs: MaterializedDesign[] = [];

  for (const proposal of proposals) {
    const name = proposal.name?.trim();
    if (!name) continue;

    const isItem = proposal.kind === 'item';
    const lookup = isItem ? items : characters;
    const nameKey = isItem ? norm(name) : `${proposal.kind}:${norm(name)}`;
    const tag = gameId && proposal.kbRef?.trim() ? kbRefTag(gameId, proposal.kbRef) : '';

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
      ids[proposal.tempId] = resolvedId;
      designs.push({ tempId: proposal.tempId, id: resolvedId, kind: proposal.kind, name, kbRef, created: false });
      continue;
    }

    // 4. Nothing matched — write the design.
    let newId: string;
    if (isItem) {
      const doc = await createItem({
        ownerId,
        projectId,
        name,
        description: proposal.description ?? '',
        rarity: proposal.rarity,
        kbRef: tag,
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
      });
      newId = String(doc._id);
    }

    // Index the new design so a later proposal naming it again links instead
    // of creating a second copy within this same batch.
    const row: DesignRow = { id: newId, name, kbRef: tag };
    lookup.byId.set(newId, row);
    lookup.byName.set(nameKey, newId);
    if (tag) lookup.byKbRef.set(tag, newId);

    ids[proposal.tempId] = newId;
    designs.push({ tempId: proposal.tempId, id: newId, kind: proposal.kind, name, kbRef: tag, created: true });
  }

  return { ids, designs };
}
