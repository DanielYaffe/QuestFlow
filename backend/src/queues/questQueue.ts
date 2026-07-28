import { Queue } from 'bullmq';
import { redis } from './connection';

export interface QuestJobData {
  userId: string;
  themeId: string;
  story: string;
  genre: string;
}

export const questQueue = new Queue<QuestJobData>('quest-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  },
});
