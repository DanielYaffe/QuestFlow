import { qdrant, collectionName, KbType } from './qdrant';
import { embed } from './ai';
import KbDocumentModel from '../models/kbDocumentModel';
import { DifficultyBucket } from './structuredParse';

export interface RetrievedChunk {
  text: string;
  score: number;
  docId: string;
  title: string;
  // Present only on points written by the structured (per-entity) ingest path.
  entity?: string;
  entityRole?: string;
  difficulty?: number;
  difficultyBucket?: DifficultyBucket;
}

export interface RetrieveOptions {
  gameId: string;
  type: KbType;
  query: string;
  topK?: number;
  scoreThreshold?: number;
  /**
   * Soft progression bias (§4): chunks whose inferred bucket matches get a
   * score bonus during re-ranking. Never a filter — off-bucket and unscored
   * chunks still compete.
   */
  progression?: DifficultyBucket;
}

// Cosine scores live roughly in [0.5, 0.9]; a bonus this size nudges the
// ordering without drowning out semantic relevance.
const PROGRESSION_BIAS = 0.08;

// Type guards — payloads come back as unknown (no `any`, CLAUDE.md).
function field<T>(payload: unknown, key: string, is: (v: unknown) => v is T): T | undefined {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    return is(v) ? v : undefined;
  }
  return undefined;
}
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBucket = (v: unknown): v is DifficultyBucket =>
  v === 'early' || v === 'mid' || v === 'late';

export async function retrieve(opts: RetrieveOptions): Promise<RetrievedChunk[]> {
  const { gameId, type, query, topK = 5, scoreThreshold = 0.5, progression } = opts;
  const queryVector = await embed(query);

  // Over-fetch so the status-gate filter (and progression re-rank) still
  // leaves enough results. A Game with no documents of this type has no
  // collection yet — that's an empty result, not an error.
  let results: Awaited<ReturnType<typeof qdrant.search>>;
  try {
    results = await qdrant.search(collectionName(gameId, type), {
      vector: queryVector,
      limit: topK * (progression ? 3 : 2),
      with_payload: true,
      score_threshold: scoreThreshold,
    });
  } catch {
    return [];
  }

  // Status gate (the linchpin): only chunks whose doc is 'ready' may be used —
  // pending/failed/half-written documents never reach generation.
  const docIds = [...new Set(results.map((r) => field(r.payload, 'docId', isStr)).filter(isStr))];
  if (docIds.length === 0) return [];
  const readyDocs = await KbDocumentModel.find(
    { _id: { $in: docIds }, status: 'ready' },
    { _id: 1, title: 1 },
  ).lean();
  const readyTitles = new Map(readyDocs.map((d) => [String(d._id), d.title]));

  const chunks = results.flatMap((r) => {
    const docId = field(r.payload, 'docId', isStr);
    if (docId === undefined || !readyTitles.has(docId)) return [];
    return [{
      text: field(r.payload, 'text', isStr) ?? '',
      score: r.score,
      docId,
      title: readyTitles.get(docId) ?? '',
      entity: field(r.payload, 'entity', isStr),
      entityRole: field(r.payload, 'entityRole', isStr),
      difficulty: field(r.payload, 'difficulty', isNum),
      difficultyBucket: field(r.payload, 'difficultyBucket', isBucket),
    }];
  });

  if (progression) {
    chunks.sort(
      (a, b) =>
        (b.score + (b.difficultyBucket === progression ? PROGRESSION_BIAS : 0))
        - (a.score + (a.difficultyBucket === progression ? PROGRESSION_BIAS : 0)),
    );
  }
  return chunks.slice(0, topK);
}
