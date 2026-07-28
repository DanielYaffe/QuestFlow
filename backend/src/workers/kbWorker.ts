import { Worker, Job } from 'bullmq';
import { redis } from '../queues/connection';
import { KbIngestJobData, KbJobData, KB_QUEUE_NAME, KB_RECONCILE_JOB } from '../queues/kbQueue';
import { qdrant, ensureCollection, deleteDocumentPoints } from '../services/qdrant';
import { buildPoints } from '../services/kbService';
import KbDocumentModel from '../models/kbDocumentModel';

// ---------------------------------------------------------------------------
// kb-ingest worker — chunk + embed + upsert off the request path, then flip
// status to 'ready'. Mirrors the sprite worker pattern. The status gate in
// ragService means nothing this worker half-writes can reach generation.
// ---------------------------------------------------------------------------

async function processKbJob(job: Job<KbIngestJobData>): Promise<void> {
  const { docId, gameId, type, mode } = job.data;
  const doc = await KbDocumentModel.findById(docId);
  if (!doc) return; // deleted before processing — drop silently

  const collection = await ensureCollection(gameId, type);
  if (mode === 'reembed') {
    // Old chunks must go before new ones are written, or stale chunks pollute
    // retrieval. The doc is 'pending' throughout, so retrieval never sees the gap.
    await deleteDocumentPoints(gameId, type, docId);
  }

  const { points, chunkCount, entityCount } = await buildPoints(doc.originalText, gameId, docId, type);
  await qdrant.upsert(collection, { points, wait: true });

  // The doc may have been deleted (user action or reconciler) while we were
  // embedding — in that case remove the points we just wrote instead of
  // leaving unreferenced vectors behind.
  const updated = await KbDocumentModel.updateOne(
    { _id: docId },
    {
      $set: {
        status: 'ready',
        statusError: '',
        chunkCount,
        pointIds: points.map((p) => String(p.id)),
        // Dot paths: informational, must not clobber user-set metadata keys.
        'metadata.structured': entityCount > 0,
        'metadata.entityCount': entityCount,
      },
    },
  );
  if (updated.matchedCount === 0) {
    await deleteDocumentPoints(gameId, type, docId);
  }
}

export const kbWorker = new Worker<KbJobData>(
  KB_QUEUE_NAME,
  async (job) => {
    if (job.name === KB_RECONCILE_JOB) {
      await reconcileKb();
      return;
    }
    const ingestJob = job as Job<KbIngestJobData>;
    try {
      await processKbJob(ingestJob);
    } catch (err) {
      // Final attempt failed → mark 'failed' so the UI can surface a retry.
      // The reconciler purges its chunks but keeps the row (originalText is
      // the source of truth and must survive for retry).
      if (ingestJob.attemptsMade + 1 >= (ingestJob.opts.attempts ?? 1)) {
        const message = err instanceof Error ? err.message : 'KB ingestion failed';
        await KbDocumentModel.updateOne(
          { _id: ingestJob.data.docId },
          { $set: { status: 'failed', statusError: message.slice(0, 500) } },
        ).catch(() => {});
      }
      throw err;
    }
  },
  { connection: redis },
);

// ---------------------------------------------------------------------------
// Reconciler — sweeps rare cross-store survivors (worker crashed mid-ingest,
// delete half-applied). Runs as the repeatable job registered in worker.ts.
//
// - stuck 'pending' (no progress for PENDING_TTL): purge chunks + drop the row
//   (its job is dead; nothing references it).
// - 'failed': purge any half-written chunks but KEEP the row so the user can
//   see the failure and retry (originalText re-embeds from Mongo).
// ---------------------------------------------------------------------------

const PENDING_TTL_MS = 15 * 60 * 1000; // generous — queue backlog is not a crash

export async function reconcileKb(): Promise<{ cleaned: number; purged: number }> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MS);

  const stuckPending = await KbDocumentModel.find({
    status: 'pending',
    updatedAt: { $lt: cutoff },
  }).lean();
  for (const doc of stuckPending) {
    await deleteDocumentPoints(doc.gameId, doc.type, String(doc._id));
    await KbDocumentModel.deleteOne({ _id: doc._id }).catch(() => {});
  }

  // Failed docs keep their registry row; only their orphaned vectors go.
  const failed = await KbDocumentModel.find({
    status: 'failed',
    chunkCount: { $gt: 0 },
  }).lean();
  for (const doc of failed) {
    await deleteDocumentPoints(doc.gameId, doc.type, String(doc._id));
    await KbDocumentModel.updateOne({ _id: doc._id }, { $set: { chunkCount: 0, pointIds: [] } }).catch(() => {});
  }

  if (stuckPending.length > 0 || failed.length > 0) {
    console.log(`[kbReconciler] removed ${stuckPending.length} stuck pending doc(s), purged chunks for ${failed.length} failed doc(s)`);
  }
  return { cleaned: stuckPending.length, purged: failed.length };
}
