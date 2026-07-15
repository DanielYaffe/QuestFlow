// ---------------------------------------------------------------------------
// Structured KB file parsing — explode one collection file (mobs.json,
// npcs.json, items.json, maps.json, …) into per-entity records, and infer a
// progression signal from the stats found in the data (§4 of the Part 2 plan).
//
// The parser is deliberately lenient: a recognized shape is a convenience, not
// a gate. Anything that does not parse into named entities returns null and
// the caller falls back to Part 1's freeform text ingestion.
// ---------------------------------------------------------------------------

export type DifficultyBucket = 'early' | 'mid' | 'late';

export interface ParsedEntity {
  name: string;
  /** Raw role/kind hint from the data (e.g. "quest_giver"), if present. */
  role?: string;
  /** All source fields except the name key — stored as point metadata. */
  fields: Record<string, unknown>;
  /** Text representation used for embedding. */
  text: string;
  /** Inferred 0–1 progression score (normalized within the file). */
  difficulty?: number;
  difficultyBucket?: DifficultyBucket;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

// --- entity extraction ------------------------------------------------------

const NAME_KEYS = ['name', 'title', 'id'];
const ROLE_KEYS = ['role', 'kind'];

function readName(entry: Record<string, unknown>): string | undefined {
  for (const key of NAME_KEYS) {
    const v = entry[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function readRole(entry: Record<string, unknown>): string | undefined {
  for (const key of ROLE_KEYS) {
    const v = entry[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

interface RawEntity {
  name: string;
  entry: Record<string, unknown>;
}

/**
 * Locate the entity collection in parsed JSON. Accepted shapes:
 *  - a top-level array of objects,
 *  - a wrapper object whose (largest) array value holds the objects,
 *  - a name-keyed map: `{ "Cave Troll": { ... }, ... }` — also when wrapped
 *    one level deep (`{ "characters": { "Tribal Leader": { ... } } }`),
 *  - a single entity object: `{ "name": "Tribal Leader", ... }`.
 */
function extractRawEntities(parsed: unknown): RawEntity[] | null {
  if (Array.isArray(parsed)) return fromArray(parsed);

  if (isObject(parsed)) {
    // Wrapper object — pick the largest array-of-objects value.
    const arrays = Object.values(parsed)
      .filter((v): v is unknown[] => Array.isArray(v))
      .sort((a, b) => b.length - a.length);
    if (arrays.length > 0) return fromArray(arrays[0]);

    const entries = Object.entries(parsed);

    // Single-key wrapper around a name-keyed map.
    if (entries.length === 1 && isObject(entries[0][1])) {
      const inner = Object.entries(entries[0][1] as Record<string, unknown>);
      if (inner.length > 0 && inner.every(([, v]) => isObject(v))) {
        return inner.map(([key, v]) => ({ name: key, entry: v as Record<string, unknown> }));
      }
    }

    // Name-keyed map — every value an object, key is the name.
    if (entries.length > 0 && entries.every(([, v]) => isObject(v))) {
      return entries.map(([key, v]) => ({ name: key, entry: v as Record<string, unknown> }));
    }

    // A single entity written as one object.
    const name = readName(parsed);
    if (name) return [{ name, entry: parsed }];
  }
  return null;
}

function fromArray(arr: unknown[]): RawEntity[] | null {
  const entities: RawEntity[] = [];
  for (const item of arr) {
    if (!isObject(item)) return null;
    const name = readName(item);
    if (!name) return null; // unnamed entries → not an entity collection
    entities.push({ name, entry: item });
  }
  return entities.length > 0 ? entities : null;
}

// --- markdown extraction ------------------------------------------------------
// The other accepted shape — and the one the in-app format templates teach:
// one `## Heading` per entity, `Key: value` lines underneath, free prose kept
// as the description.

const HEADING_RE = /^#{1,6}\s+(.+?)\s*$/;
const KV_RE = /^([A-Za-z][A-Za-z0-9 _/-]{0,40}):\s*(.+)$/;

/**
 * "HP 450, ATK 38, DEF 22" → { hp: 450, atk: 38, def: 22 } so stat extraction
 * can read it; "14" → 14; anything else stays the raw string.
 */
function parseFieldValue(value: string): unknown {
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const pairs: Record<string, number> = {};
  for (const part of parts) {
    const m = part.match(/^([A-Za-z][A-Za-z _-]*?)\s*:?\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return value;
    pairs[m[1].trim().toLowerCase().replace(/\s+/g, '_')] = Number(m[2]);
  }
  return Object.keys(pairs).length > 0 ? pairs : value;
}

function extractMarkdownEntities(text: string): RawEntity[] | null {
  const sections: { name: string; lines: string[] }[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(HEADING_RE);
    if (heading) {
      current = { name: heading[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (sections.length === 0) return null;

  return sections.map(({ name, lines }) => {
    const entry: Record<string, unknown> = {};
    const prose: string[] = [];
    for (const line of lines) {
      const kv = line.match(KV_RE);
      if (kv) {
        const key = kv[1].trim().toLowerCase().replace(/\s+/g, '_');
        entry[key] = parseFieldValue(kv[2].trim());
      } else if (line.trim()) {
        prose.push(line.trim());
      }
    }
    if (prose.length > 0) entry.description = prose.join(' ');
    return { name, entry };
  });
}

// --- stat heuristics & progression ------------------------------------------

const STAT_GROUPS: { group: string; pattern: RegExp; weight: number }[] = [
  { group: 'level',   pattern: /^(base_?)?(level|lvl|tier)$/i,                          weight: 1.5 },
  { group: 'hp',      pattern: /^(base_?|max_?)?(hp|health|hitpoints)$/i,               weight: 1 },
  { group: 'attack',  pattern: /^(base_?)?(attack|atk|damage|dmg|strength|str)$/i,      weight: 1 },
  { group: 'defense', pattern: /^(base_?)?(defen[cs]e|def|armou?r)$/i,                  weight: 1 },
];

/**
 * Pull recognized stat values from an entity — direct numeric fields plus one
 * level of nesting (e.g. `stats: { hp, attack }`).
 */
export function extractStats(entry: Record<string, unknown>): Record<string, number> {
  const stats: Record<string, number> = {};
  const scan = (obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const match = STAT_GROUPS.find((g) => g.pattern.test(key));
      if (match && !(match.group in stats)) stats[match.group] = value;
    }
  };
  scan(entry);
  for (const value of Object.values(entry)) {
    if (isObject(value)) scan(value);
  }
  return stats;
}

export function bucketOf(difficulty: number): DifficultyBucket {
  if (difficulty < 1 / 3) return 'early';
  if (difficulty < 2 / 3) return 'mid';
  return 'late';
}

/**
 * Inferred progression (§4): min–max normalize each stat group across the
 * file's entities, then take the weighted mean of the groups each entity has.
 * Entities without any recognized stat get no score (soft signal, not a rank
 * for everything). A group that is constant across the file contributes 0.5.
 */
export function scoreDifficulty(allStats: Record<string, number>[]): (number | undefined)[] {
  const range = new Map<string, { min: number; max: number }>();
  for (const stats of allStats) {
    for (const [group, value] of Object.entries(stats)) {
      const r = range.get(group);
      if (!r) range.set(group, { min: value, max: value });
      else { r.min = Math.min(r.min, value); r.max = Math.max(r.max, value); }
    }
  }

  return allStats.map((stats) => {
    let weighted = 0;
    let totalWeight = 0;
    for (const { group, weight } of STAT_GROUPS) {
      if (!(group in stats)) continue;
      const r = range.get(group);
      if (!r) continue;
      const normalized = r.max === r.min ? 0.5 : (stats[group] - r.min) / (r.max - r.min);
      weighted += normalized * weight;
      totalWeight += weight;
    }
    return totalWeight > 0 ? weighted / totalWeight : undefined;
  });
}

// --- text representation -----------------------------------------------------

const MAX_ENTITY_TEXT = 1500;

function formatValue(value: unknown): string {
  if (isScalar(value)) return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => formatValue(v)).filter(Boolean).join(', ');
  }
  if (isObject(value)) {
    return Object.entries(value)
      .filter(([, v]) => isScalar(v))
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ');
  }
  return '';
}

/** One embeddable line-oriented description per entity. */
export function entityText(name: string, role: string | undefined, entry: Record<string, unknown>): string {
  const lines: string[] = [role ? `${name} (${role})` : name];
  for (const [key, value] of Object.entries(entry)) {
    if (NAME_KEYS.includes(key) || ROLE_KEYS.includes(key)) continue;
    const formatted = formatValue(value);
    if (formatted) lines.push(`${key}: ${formatted}`);
  }
  return lines.join('\n').slice(0, MAX_ENTITY_TEXT);
}

// --- entry point --------------------------------------------------------------

/**
 * Parse a collection document into per-entity records, or null when the
 * content is not a recognizable entity collection (caller falls back to
 * freeform). Accepts JSON collections and the markdown `## Name` + `Key:
 * value` shape the in-app format templates recommend.
 */
export function parseCollectionFile(text: string): ParsedEntity[] | null {
  let raw: RawEntity[] | null = null;
  try {
    raw = extractRawEntities(JSON.parse(text));
  } catch {
    raw = extractMarkdownEntities(text);
  }
  if (!raw) return null;

  const allStats = raw.map(({ entry }) => extractStats(entry));
  const difficulties = scoreDifficulty(allStats);

  return raw.map(({ name, entry }, i) => {
    const role = readRole(entry);
    const fields = Object.fromEntries(
      Object.entries(entry).filter(([key]) => !NAME_KEYS.includes(key)),
    );
    const difficulty = difficulties[i];
    return {
      name,
      role,
      fields,
      text: entityText(name, role, entry),
      difficulty,
      difficultyBucket: difficulty === undefined ? undefined : bucketOf(difficulty),
    };
  });
}
