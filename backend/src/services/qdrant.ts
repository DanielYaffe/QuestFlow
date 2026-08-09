import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/config';
import { embedProvider } from '../config/ai';

// The client defaults to port 6333 when the URL carries no explicit port,
// which breaks URLs behind a standard reverse proxy (https://... → 443).
// Derive the real port from the URL instead.
const qdrantUrl = new URL(config.QDRANT_URL);
const qdrantPort = qdrantUrl.port
  ? Number(qdrantUrl.port)
  : qdrantUrl.protocol === 'https:' ? 443 : 6333;

const qdrant = new QdrantClient({
  url: config.QDRANT_URL,
  port: qdrantPort,
  apiKey: config.QDRANT_API_KEY || undefined,
});

export type KbType = 'monsters' | 'characters' | 'maps' | 'items' | 'quests' | 'lore' | 'general';
export const KB_TYPES: KbType[] = ['monsters', 'characters', 'maps', 'items', 'quests', 'lore', 'general'];

export function isKbType(v: unknown): v is KbType {
  return typeof v === 'string' && (KB_TYPES as string[]).includes(v);
}

// Namespace helper — single source of truth for per-Game isolation.
export function collectionName(gameId: string, type: KbType): string {
  return `kb_${gameId}_${type}`;
}

// Indexed payload fields: docId (delete/re-embed by document, Part 1),
// entity + difficultyBucket (exact-by-name lookup and progression bias, Part 2).
const PAYLOAD_INDEXES: { field: string; schema: 'keyword' }[] = [
  { field: 'docId', schema: 'keyword' },
  { field: 'entity', schema: 'keyword' },
  { field: 'difficultyBucket', schema: 'keyword' },
];

/** Declared vector size of an existing collection, or null when absent/named-vector. */
async function vectorSize(name: string): Promise<number | null> {
  const info = await qdrant.getCollection(name).catch(() => null);
  const vectors: unknown = info?.config?.params?.vectors;
  if (vectors !== null && typeof vectors === 'object') {
    const size = (vectors as { size?: unknown }).size;
    if (typeof size === 'number') return size;
  }
  return null;
}

export async function ensureCollection(gameId: string, type: KbType): Promise<string> {
  const name = collectionName(gameId, type);
  const { collections } = await qdrant.getCollections();
  if (!collections.some((c) => c.name === name)) {
    await qdrant.createCollection(name, {
      vectors: { size: embedProvider.dimensions, distance: 'Cosine' },
    });
  } else {
    // A collection's dimensionality is fixed at creation. If EMBED_DIMENSIONS
    // changed underneath an existing collection, every upsert would fail with
    // Qdrant's opaque 400 "Bad Request" — fail loudly here instead, naming the
    // remedy, rather than letting each document die a silent death.
    const size = await vectorSize(name);
    if (size !== null && size !== embedProvider.dimensions) {
      throw new Error(
        `Collection ${name} was created with ${size}-dim vectors but EMBED_DIMENSIONS is ` +
        `${embedProvider.dimensions} (${embedProvider.model}). Qdrant cannot resize in place — ` +
        'run `npx tsx src/scripts/reembed-kb.ts` to rebuild the KB at the new dimensions.',
      );
    }
  }
  // Ensured on every call so collections created before Part 2 pick up the new
  // indexes with no re-ingest; re-creating an existing index is a no-op error.
  for (const { field, schema } of PAYLOAD_INDEXES) {
    await qdrant
      .createPayloadIndex(name, { field_name: field, field_schema: schema })
      .catch(() => { /* index already exists */ });
  }
  return name;
}

export interface KbPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

// Qdrant rejects any request body over 32 MB. A 3072-dim vector serializes to
// roughly 60 KB of JSON, so a few hundred points is already megabytes and a
// full entity collection (~1,800 mobs) is ~109 MB in one call. Size the batch
// from the live dimensionality so this stays correct if EMBED_DIMENSIONS moves.
const UPSERT_TARGET_BYTES = 16 * 1024 * 1024; // half the cap — headroom for payload text
const PAYLOAD_BYTES_ALLOWANCE = 4 * 1024;     // entity sheets cap at 1500 chars; chunks run longer
const JSON_BYTES_PER_FLOAT = 20;

function upsertBatchSize(): number {
  const perPoint = embedProvider.dimensions * JSON_BYTES_PER_FLOAT + PAYLOAD_BYTES_ALLOWANCE;
  return Math.max(1, Math.floor(UPSERT_TARGET_BYTES / perPoint));
}

/**
 * Upsert points in body-size-safe batches. Callers must not call qdrant.upsert
 * directly with a whole document's points — that is what produced the opaque
 * "Bad Request" on every large collection file.
 */
export async function upsertPoints(collection: string, points: KbPoint[]): Promise<void> {
  const size = upsertBatchSize();
  for (let i = 0; i < points.length; i += size) {
    await qdrant.upsert(collection, { points: points.slice(i, i + size), wait: true });
  }
}

/** Delete every point belonging to a document. Safe when the collection does not exist. */
export async function deleteDocumentPoints(gameId: string, type: KbType, docId: string): Promise<void> {
  await qdrant
    .delete(collectionName(gameId, type), {
      filter: { must: [{ key: 'docId', match: { value: docId } }] },
      wait: true,
    })
    .catch(() => { /* collection may not exist yet */ });
}

// Delete an entire Game's KB (complete isolation cleanup).
export async function deleteGameKb(gameId: string): Promise<void> {
  for (const type of KB_TYPES) {
    await qdrant.deleteCollection(collectionName(gameId, type)).catch(() => { /* may not exist */ });
  }
}

export { qdrant };
