import { Worker, Job } from 'bullmq';
import { redis } from '../queues/connection';
import { SpriteJobData, SpriteJobResult } from '../queues/spriteQueue';
import { generateWithLora, generateBase } from '../services/generation/loraService';
import { uploadBufferToS3, getPresignedUrl } from '../utils/s3Helper';
import SpriteModel from '../models/spriteModel';

async function processSpriteJob(job: Job<SpriteJobData, SpriteJobResult>): Promise<SpriteJobResult> {
  const { userId, userPrompt, positivePrompt, negativePrompt, styleId, loraName, triggerWord } = job.data;

  let imageBuffer: Buffer;

  if (loraName) {
    imageBuffer = await generateWithLora({
      positivePrompt,
      negativePrompt: negativePrompt || undefined,
      loraName,
      triggerWord,
    });
  } else {
    imageBuffer = await generateBase({
      positivePrompt,
      negativePrompt: negativePrompt || undefined,
    });
  }

  const imageKey = await uploadBufferToS3(imageBuffer, 'image/png', 'sprites');

  const sprite = await SpriteModel.create({
    ownerId:        userId,
    userPrompt,
    positivePrompt,
    negativePrompt: negativePrompt ?? '',
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
