import { Worker, Job } from 'bullmq';
import { redis } from '../queues/connection';
import { SpriteJobData, SpriteJobResult } from '../queues/spriteQueue';
import { composeImagePrompt } from '../services/generation/imagePromptComposer';
import { generateWithStyle } from '../services/generation/generationService';
import { snapAndResize } from '../services/generation/pixelSnapper';
import { uploadBufferToS3, getPresignedUrl } from '../utils/s3Helper';
import SpriteModel from '../models/spriteModel';
import SpriteStyleModel from '../models/spriteStyleModel';

async function resolveStyle(styleId: string) {
  const style = await SpriteStyleModel.findOne({ styleId, isActive: true }).lean();
  if (style) return style;
  const fallback = await SpriteStyleModel.findOne({ isDefault: true, isActive: true }).lean();
  if (fallback) return fallback;
  throw new Error('No active sprite styles found in database — run seedThemes first');
}

async function processSpriteJob(job: Job<SpriteJobData, SpriteJobResult>): Promise<SpriteJobResult> {
  const { userId, userPrompt, styleId, negativePrompt } = job.data;

  const style = await resolveStyle(styleId);

  const composed = composeImagePrompt({
    style,
    userSubject: userPrompt,
    extraNegative: negativePrompt || undefined,
  });

  const rawBuffer = await generateWithStyle(
    composed,
    style.workflowTemplate,
    style.workflowPatchMap,
  );

  // Only pixel-snap styles that opt in via targetSize (e.g. cb_pixel → 64px).
  // Other styles (anime, realistic, raw) store the full-res ComfyUI output.
  const imageBuffer = style.targetSize
    ? await snapAndResize(rawBuffer, style.targetSize)
    : rawBuffer;

  const imageKey = await uploadBufferToS3(imageBuffer, 'image/png', 'sprites');

  const sprite = await SpriteModel.create({
    ownerId:        userId,
    userPrompt,
    positivePrompt: composed.positive,
    negativePrompt: composed.negative,
    styleId:        styleId ?? '',
    imageUrl:       imageKey,
  });

  const presignedUrl = await getPresignedUrl(imageKey);

  return {
    _id:            sprite._id.toString(),
    imageUrl:       presignedUrl,
    imageKey,
    userPrompt:     sprite.userPrompt,
    positivePrompt: sprite.positivePrompt,
    negativePrompt: sprite.negativePrompt,
    styleId:        sprite.styleId,
    createdAt:      sprite.createdAt.toISOString(),
  };
}

export const spriteWorker = new Worker<SpriteJobData, SpriteJobResult>(
  'sprite-generation',
  processSpriteJob,
  {
    connection: redis,
    concurrency: 3,
  },
);

spriteWorker.on('completed', (job) => {
  console.log(`[spriteWorker] job ${job.id} completed`);
});

spriteWorker.on('failed', (job, err) => {
  console.error(`[spriteWorker] job ${job?.id} failed:`, err.message);
});
