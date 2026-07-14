import { qdrant, collectionName, KbType } from './qdrant';
import { embed } from './ai';
import KbDocumentModel from '../models/kbDocumentModel';

export interface RetrievedChunk {
  text: string;
  score: number;
  docId: string;
  title: string;
}

export interface RetrieveOptions {
  gameId: string;
  type: KbType;
  query: string;
  topK?: number;
  scoreThreshold?: number;
}

// Type guards — payloads come back as unknown (no `any`, CLAUDE.md).
function field<T>(payload: unknown, key: string, is: (v: unknown) => v is T): T | undefined {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    return is(v) ? v : undefined;
  }
  return undefined;
}
const isStr = (v: unknown): v is string => typeof v === 'string';

export async function retrieve(opts: RetrieveOptions): Promise<RetrievedChunk[]> {
  const { gameId, type, query, topK = 5, scoreThreshold = 0.5 } = opts;
  const queryVector = await embed(query);

  // Over-fetch so the status-gate filter still leaves enough results. A Game
  // with no documents of this type has no collection yet — that's an empty
  // result, not an error.
  let results: Awaited<ReturnType<typeof qdrant.search>>;
  try {
    results = await qdrant.search(collectionName(gameId, type), {
      vector: queryVector,
      limit: topK * 2,
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

  return results
    .flatMap((r) => {
      const docId = field(r.payload, 'docId', isStr);
      if (docId === undefined || !readyTitles.has(docId)) return [];
      return [{
        text: field(r.payload, 'text', isStr) ?? '',
        score: r.score,
        docId,
        title: readyTitles.get(docId) ?? '',
      }];
    })
    .slice(0, topK);
}
