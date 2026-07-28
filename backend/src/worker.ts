import mongoose from 'mongoose';
import { config } from './config/config';
import './workers/spriteWorker';
import './workers/kbWorker';
import './workers/animationWorker';
import { kbQueue, KB_RECONCILE_JOB } from './queues/kbQueue';

// Repeatable reconciler: sweeps stuck 'pending' KB docs and purges orphaned
// chunks of 'failed' ones (see workers/kbWorker.ts). upsertJobScheduler is
// idempotent across restarts.
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

mongoose.connect(config.DATABASE_URL).then(async () => {
  console.log('[Worker] MongoDB connected');
  await kbQueue.upsertJobScheduler(
    KB_RECONCILE_JOB,
    { every: RECONCILE_INTERVAL_MS },
    { name: KB_RECONCILE_JOB },
  ).catch((err) => console.error('[Worker] failed to register KB reconciler:', err));
  console.log('[Worker] All workers started');
}).catch((err) => {
  console.error('[Worker] MongoDB connection failed:', err);
  process.exit(1);
});
