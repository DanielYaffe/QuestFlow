/**
 * Re-embed the knowledge base with the currently configured embedding provider.
 *
 * Embeddings are pinned for a reason: vectors from two different models are not
 * comparable, so changing EMBED_MODEL/EMBED_DIMENSIONS invalidates everything
 * already in Qdrant. This script is the supported way to make that change — it
 * replays every KbDocument's `originalText` (the source of truth in Mongo)
 * through the same `buildPoints` path the worker uses.
 *
 * Collections whose stored vector size no longer matches EMBED_DIMENSIONS are
 * dropped and recreated; Qdrant cannot change a collection's dimensionality in
 * place. Every document in such a collection is re-embedded in the same run, so
 * nothing is left without vectors.
 *
 * Idempotent and resumable: re-running processes the same documents again from
 * `originalText`. A document that fails is marked 'failed' (its row and text
 * survive) and is picked up by the next run.
 *
 * PRECAUTION: stop the worker process (`npm run worker`) before running. Its
 * reconciler deletes documents stuck in 'pending' for more than 15 minutes,
 * which on a large KB could race this script.
 *
 * Run with:
 *   npx tsx src/scripts/reembed-kb.ts --dry-run
 *   npx tsx src/scripts/reembed-kb.ts
 *   npx tsx src/scripts/reembed-kb.ts --game=<gameId> --type=monsters
 *   npx tsx src/scripts/reembed-kb.ts --recreate        # force-drop collections
 */
import mongoose from 'mongoose';
import { config } from '../config/config';
import { embedProvider } from '../config/ai';
import { buildPoints } from '../services/kbService';
import {
  qdrant,
  ensureCollection,
  collectionName,
  deleteDocumentPoints,
  upsertPoints,
  isKbType,
  KbType,
} from '../services/qdrant';
import KbDocumentModel from '../models/kbDocumentModel';

// --- CLI -------------------------------------------------------------------

interface Options {
  gameId?: string;
  type?: KbType;
  dryRun: boolean;
  recreate: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, recreate: false };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--recreate') {
      options.recreate = true;
    } else if (arg.startsWith('--game=')) {
      options.gameId = arg.slice('--game='.length);
    } else if (arg.startsWith('--type=')) {
      const value = arg.slice('--type='.length);
      if (!isKbType(value)) throw new Error(`Unknown --type: ${value}`);
      options.type = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

// --- Qdrant introspection --------------------------------------------------

/**
 * Stored vector size for a collection, or null when it does not exist yet.
 * Named-vector collections are not used by this codebase; treat one as a
 * mismatch so it gets recreated in the current single-vector shape.
 */
async function storedVectorSize(name: string): Promise<number | null> {
  const info = await qdrant.getCollection(name).catch(() => null);
  if (!info) return null;
  const vectors: unknown = info.config?.params?.vectors;
  if (vectors !== null && typeof vectors === 'object') {
    const size = (vectors as { size?: unknown }).size;
    if (typeof size === 'number') return size;
  }
  return -1; // exists, but not a shape we can reuse
}

// --- Reporting -------------------------------------------------------------

// Published rates per 1M input tokens. Unlisted models just skip the estimate.
const PRICE_PER_MTOK: Record<string, number> = {
  'gemini-embedding-001': 0.15,
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
};

// JSON is denser than prose (braces, quotes and colons all cost tokens), so ~3.5
// chars/token is a closer rule of thumb here than the usual 4.
const CHARS_PER_TOKEN = 3.5;

function formatCost(chars: number): string {
  const tokens = Math.round(chars / CHARS_PER_TOKEN);
  const rate = PRICE_PER_MTOK[embedProvider.model];
  const tokenText = `~${tokens.toLocaleString()} tokens`;
  if (rate === undefined) return `${tokenText} (no published rate for ${embedProvider.model})`;
  return `${tokenText} ≈ $${((tokens / 1_000_000) * rate).toFixed(4)}`;
}

// --- Main ------------------------------------------------------------------

async function reembed(options: Options): Promise<void> {
  await mongoose.connect(config.DATABASE_URL);
  // Credentials live in this URL — print host/db only, never the raw string.
  const mongoHost = (() => {
    try {
      const u = new URL(config.DATABASE_URL);
      return `${u.host}${u.pathname}`;
    } catch {
      return '(unparseable)';
    }
  })();
  console.log('[reembed] mongo    :', mongoHost);
  console.log('[reembed] qdrant   :', config.QDRANT_URL);
  console.log('[reembed] model    :', embedProvider.model, `@ ${embedProvider.dimensions} dims`);
  console.log('[reembed] endpoint :', embedProvider.baseURL);

  if (!embedProvider.apiKey) throw new Error('No embedding API key — set EMBED_API_KEY (or GEMINI_API_KEY).');

  const filter: Record<string, string> = {};
  if (options.gameId) filter.gameId = options.gameId;
  if (options.type) filter.type = options.type;

  const docs = await KbDocumentModel.find(filter).sort({ gameId: 1, type: 1 }).lean();
  if (docs.length === 0) {
    console.log('[reembed] no documents matched — nothing to do');
    return;
  }

  // Group by target collection. A collection is exactly (gameId, type), and both
  // filters select whole collections, so a recreate never drops out-of-scope docs.
  const byCollection = new Map<string, typeof docs>();
  for (const doc of docs) {
    const key = `${doc.gameId}::${doc.type}`;
    const bucket = byCollection.get(key);
    if (bucket) bucket.push(doc);
    else byCollection.set(key, [doc]);
  }

  const totalChars = docs.reduce((sum, d) => sum + d.originalText.length, 0);
  console.log(
    `[reembed] ${docs.length} document(s) across ${byCollection.size} collection(s) — ${formatCost(totalChars)}`,
  );

  if (options.dryRun) {
    for (const [key, group] of byCollection) {
      const [gameId, type] = key.split('::');
      const name = collectionName(gameId, type as KbType);
      const size = await storedVectorSize(name);
      const action =
        size === null ? 'will be created'
        : size !== embedProvider.dimensions || options.recreate ? `WILL BE RECREATED (stored ${size} dims)`
        : 'reused in place';
      console.log(`  ${name}: ${group.length} doc(s), ${action}`);
    }
    console.log('[reembed] dry run — nothing written');
    return;
  }

  // Documents we set to 'pending'; on interrupt they must not be left that way
  // or the worker's reconciler will delete their rows (and their originalText).
  const inFlight = new Set<string>();
  let interrupted = false;

  const rescue = async (): Promise<void> => {
    if (inFlight.size === 0) return;
    console.warn(`\n[reembed] interrupted — marking ${inFlight.size} unfinished doc(s) 'failed' so their rows survive`);
    await KbDocumentModel.updateMany(
      { _id: { $in: [...inFlight] } },
      { $set: { status: 'failed', statusError: 'reembed-kb interrupted', chunkCount: 0, pointIds: [] } },
    ).catch(() => {});
  };

  process.on('SIGINT', () => {
    interrupted = true;
    void rescue().finally(() => process.exit(130));
  });

  const startedAt = Date.now();
  let succeeded = 0;
  let failed = 0;
  let pointsWritten = 0;

  for (const [key, group] of byCollection) {
    if (interrupted) break;
    const [gameId, rawType] = key.split('::');
    const type = rawType as KbType;
    const name = collectionName(gameId, type);
    const size = await storedVectorSize(name);
    const mustRecreate = size !== null && (size !== embedProvider.dimensions || options.recreate);

    // Hide the whole group before dropping its vectors — a 'ready' document with
    // no points would silently return nothing from retrieval.
    const groupIds = group.map((d) => String(d._id));
    await KbDocumentModel.updateMany({ _id: { $in: groupIds } }, { $set: { status: 'pending', statusError: '' } });
    groupIds.forEach((id) => inFlight.add(id));

    if (mustRecreate) {
      console.log(`[reembed] ${name}: dropping (stored ${size} dims → ${embedProvider.dimensions})`);
      await qdrant.deleteCollection(name).catch(() => {});
    }
    await ensureCollection(gameId, type);

    for (const doc of group) {
      if (interrupted) break;
      const docId = String(doc._id);
      const label = `${name}/${doc.title}`;
      try {
        // Already wiped by the recreate; otherwise clear this doc's old vectors
        // so a shrinking chunk count cannot leave stale points behind.
        if (!mustRecreate) await deleteDocumentPoints(gameId, type, docId);

        const { points, chunkCount, entityCount } = await buildPoints(doc.originalText, gameId, docId, type);
        if (points.length > 0) await upsertPoints(name, points);

        await KbDocumentModel.updateOne(
          { _id: docId },
          {
            $set: {
              status: 'ready',
              statusError: '',
              chunkCount,
              pointIds: points.map((p) => String(p.id)),
              'metadata.structured': entityCount > 0,
              'metadata.entityCount': entityCount,
            },
          },
        );
        inFlight.delete(docId);
        succeeded++;
        pointsWritten += points.length;
        console.log(`  ok   ${label} — ${chunkCount} point(s)${entityCount > 0 ? ' (entities)' : ''}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await KbDocumentModel.updateOne(
          { _id: docId },
          { $set: { status: 'failed', statusError: message.slice(0, 500), chunkCount: 0, pointIds: [] } },
        ).catch(() => {});
        inFlight.delete(docId);
        failed++;
        console.error(`  FAIL ${label} — ${message}`);
      }
    }
  }

  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('---');
  console.log(`[reembed] ready   : ${succeeded}`);
  console.log(`[reembed] failed  : ${failed}`);
  console.log(`[reembed] points  : ${pointsWritten}`);
  console.log(`[reembed] elapsed : ${elapsedS}s`);
  if (failed > 0) console.log('[reembed] re-run to retry failed documents (their originalText is intact)');
}

const options = parseArgs(process.argv.slice(2));

reembed(options)
  .then(async () => {
    await mongoose.disconnect();
    console.log('[reembed] done');
  })
  .catch(async (err) => {
    console.error('[reembed] failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });