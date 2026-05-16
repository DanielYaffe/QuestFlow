import { Queue } from 'bullmq';
import { redis } from './connection';

export interface MonsterJobData {
  userId: string;
  name: string;
  description: string;
  themeId: string;
  agentId: string;
  knowledgeBaseId: string;
}

export interface MonsterJobProgress {
  step: 'queued' | 'generating_stats' | 'generating_sprite' | 'animating' | 'tagging' | 'exporting' | 'uploading' | 'done';
  percent: number;
  message: string;
}

export const monsterQueue = new Queue<MonsterJobData>('monster-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  },
});
