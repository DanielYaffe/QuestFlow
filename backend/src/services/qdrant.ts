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

export async function ensureCollection(gameId: string, type: KbType): Promise<string> {
  const name = collectionName(gameId, type);
  const { collections } = await qdrant.getCollections();
  if (!collections.some((c) => c.name === name)) {
    await qdrant.createCollection(name, {
      vectors: { size: embedProvider.dimensions, distance: 'Cosine' },
    });
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
