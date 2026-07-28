import { Queue } from 'bullmq';
import { redis } from './connection';
import { KbType } from '../services/qdrant';

export interface KbIngestJobData {
  docId: string; // KbDocument._id
  gameId: string;
  type: KbType;
  mode: 'ingest' | 'reembed';
}

export const KB_QUEUE_NAME = 'kb-ingest';
export const KB_RECONCILE_JOB = 'kb-reconcile';

// The reconciler repeatable job carries no payload; ingest/re-embed jobs do.
export type KbJobData = KbIngestJobData | Record<string, never>;

export const kbQueue = new Queue<KbJobData>(KB_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  },
});
