import { Queue } from 'bullmq';
import { redis } from './connection';

export const ANIMATION_QUEUE = 'animation-generation';

// One queue, three job kinds — all backed by PixelLab background jobs:
//   generate  → animate-with-text-v3 (new frames for an Animation doc)
//   edit      → edit-animation-v2 (text edit over existing frames; Pro/credits)
//   rotations → generate-8-rotations-v3 (writes character.assets.rotations)
export type AnimationJobData =
  | { kind: 'generate'; animationId: string; sourceImageKey: string; action: string; frameCount: number }
  | { kind: 'edit'; animationId: string; instruction: string }
  | { kind: 'rotations'; characterId: string; sourceImageKey: string };

export interface AnimationJobResult {
  kind: AnimationJobData['kind'];
  animationId?: string;
  characterId?: string;
  frameCount?: number;
}

export const animationQueue = new Queue<AnimationJobData, AnimationJobResult>(ANIMATION_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    // No automatic retries: every attempt spends PixelLab generations/credits.
    // Failures land on the Animation doc (status/statusError) with a manual
    // retry in the UI instead.
    attempts: 1,
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  },
});
