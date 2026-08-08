import { isItemRarity } from './itemService';
import { ReferenceEntity } from './generationContext';
import { normalizeCharacterKind, DesignKind, ProposedDesign } from './designMaterialization';

// ---------------------------------------------------------------------------
// Parsing and validation of the model's /ai-edit response. Everything here is
// defensive: the model is free-form text, so each field is proven before use
// and anything unrecognized is dropped rather than trusted.
// ---------------------------------------------------------------------------

export interface RefLists {
  npcIds: string[];
  monsterIds: string[];
  rewardIds: string[];
}

export interface RefsChange {
  before: RefLists;
  after: RefLists;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

function readRefLists(v: unknown): RefLists | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  return {
    npcIds: asStringArray(r.npcIds),
    monsterIds: asStringArray(r.monsterIds),
    rewardIds: asStringArray(r.rewardIds),
  };
}

/**
 * Validate a refs block structurally, dropping it whole if any id is one we
 * never offered. Per docs/adr/0002 we deliberately do NOT check `before`
 * against the live graph — the review diff is the guard against a bad detach.
 */
export function readRefs(v: unknown, allowedIds: Set<string>): RefsChange | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const raw = v as Record<string, unknown>;
  const before = readRefLists(raw.before);
  const after = readRefLists(raw.after);
  if (!before || !after) return undefined;

  const every = [
    ...before.npcIds, ...before.monsterIds, ...before.rewardIds,
    ...after.npcIds, ...after.monsterIds, ...after.rewardIds,
  ];
  if (every.some((id) => !allowedIds.has(id))) return undefined;
  return { before, after };
}

export function isValidChange(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const ch = c as Record<string, unknown>;
  if (typeof ch.type !== 'string') return false;
  if (typeof ch.summary !== 'string' || !ch.summary.trim()) return false;

  switch (ch.type) {
    case 'updateNode':
      return (
        typeof ch.nodeId === 'string' &&
        ch.before != null && typeof ch.before === 'object' &&
        ch.after  != null && typeof ch.after  === 'object'
      );
    case 'addNode':
      return ch.node != null && typeof ch.node === 'object';
    case 'deleteNode':
      return typeof ch.nodeId === 'string';
    case 'addEdge':
    case 'deleteEdge':
      return typeof ch.source === 'string' && typeof ch.target === 'string';
    default:
      return false;
  }
}

/**
 * Read the entity registry, keeping only well-formed proposals. `kbRef` is
 * trusted only when it names material we actually offered; an exact name match
 * grounds the proposal even when the model forgot the field, so the badge never
 * depends on the model remembering to set it.
 */
export function readProposedDesigns(raw: unknown, reference: ReferenceEntity[]): ProposedDesign[] {
  if (!Array.isArray(raw)) return [];

  const canonicalNames = new Map(reference.map((e) => [e.name.toLowerCase(), e.name]));
  const kbTypeByName = new Map(reference.map((e) => [e.name.toLowerCase(), e.type]));

  const seen = new Set<string>();
  const designs: ProposedDesign[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const tempId = typeof e.tempId === 'string' ? e.tempId.trim() : '';
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (!tempId || !name || seen.has(tempId)) continue;
    seen.add(tempId);

    const kbRef = (typeof e.kbRef === 'string'
      ? canonicalNames.get(e.kbRef.trim().toLowerCase())
      : undefined) ?? canonicalNames.get(name.toLowerCase());

    // A KB entity filed under monsters is hostile whatever the model called it.
    const fromMonsterSheet = kbRef !== undefined && kbTypeByName.get(kbRef.toLowerCase()) === 'monsters';
    const kind: DesignKind = e.kind === 'item'
      ? 'item'
      : fromMonsterSheet ? 'monster' : normalizeCharacterKind(e.kind);

    designs.push({
      tempId,
      kind,
      name,
      appearance: typeof e.appearance === 'string' ? e.appearance : '',
      lore: typeof e.lore === 'string' ? e.lore : '',
      description: typeof e.description === 'string' ? e.description : '',
      rarity: isItemRarity(e.rarity) ? e.rarity : undefined,
      kbRef,
      existingId: typeof e.existingId === 'string' ? e.existingId.trim() : undefined,
    });
  }

  return designs;
}
