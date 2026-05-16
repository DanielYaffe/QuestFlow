import { Queue } from 'bullmq';
import { redis } from './connection';

export interface SpriteJobData {
  userId: string;
  userPrompt: string;
  positivePrompt: string;
  negativePrompt: string;
  styleId: string;
  loraName: string;      // '' when no style selected
  triggerWord: string;   // '' when no style selected
}

export interface SpriteJobResult {
  _id: string;
  imageUrl: string;
  imageKey: string;
  userPrompt: string;
  positivePrompt: string;
  negativePrompt: string;
  styleId: string;
  createdAt: string;
}

export const spriteQueue = new Queue<SpriteJobData, SpriteJobResult>('sprite-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 4_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  },
});
