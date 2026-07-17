import { Worker, Job } from 'bullmq';
import sharp from 'sharp';
import { redis } from '../queues/connection';
import { ANIMATION_QUEUE, AnimationJobData, AnimationJobResult } from '../queues/animationQueue';
import {
  prepareFrameForPixelLab,
  submitAnimateWithText,
  submitEditAnimation,
  submitGenerate8Rotations,
  waitForBackgroundJob,
} from '../services/generation/pixellabService';
import { uploadBufferToS3, downloadBufferFromS3, deleteFileFromS3 } from '../utils/s3Helper';
import AnimationModel from '../models/animationModel';
import CharacterModel, { ROTATION_DIRECTIONS, ICharacterRotations } from '../models/characterModel';

async function uploadFrames(buffers: Buffer[]): Promise<{ keys: string[]; width: number; height: number }> {
  const keys: string[] = [];
  for (const buffer of buffers) {
    keys.push(await uploadBufferToS3(buffer, 'image/png', 'animations'));
  }
  const meta = await sharp(buffers[0]).metadata();
  return { keys, width: meta.width ?? 0, height: meta.height ?? 0 };
}

async function deleteKeysQuietly(keys: string[]): Promise<void> {
  await Promise.allSettled(keys.map((key) => deleteFileFromS3(key)));
}

async function processGenerate(
  data: Extract<AnimationJobData, { kind: 'generate' }>,
): Promise<AnimationJobResult> {
  const animation = await AnimationModel.findById(data.animationId);
  if (!animation) throw new Error(`Animation ${data.animationId} not found`);

  try {
    const source = await downloadBufferFromS3(data.sourceImageKey);
    const prepared = await prepareFrameForPixelLab(source, data.frameCount);

    const jobId = await submitAnimateWithText({
      firstFrame: prepared.buffer,
      action: data.action,
      frameCount: data.frameCount,
    });
    const frames = await waitForBackgroundJob(jobId);

    const oldKeys = animation.frameKeys;
    const { keys, width, height } = await uploadFrames(frames);

    animation.frameKeys = keys;
    animation.frameWidth = width;
    animation.frameHeight = height;
    animation.action = data.action;
    animation.status = 'ready';
    animation.statusError = '';
    // Exports are stale once frames change.
    const staleExports = [animation.spritesheetKey, animation.spritesheetJsonKey, animation.gifKey].filter(Boolean);
    animation.spritesheetKey = '';
    animation.spritesheetJsonKey = '';
    animation.gifKey = '';
    await animation.save();
    await deleteKeysQuietly([...oldKeys, ...staleExports]);

    return { kind: 'generate', animationId: animation._id.toString(), frameCount: keys.length };
  } catch (err) {
    animation.status = animation.frameKeys.length > 0 ? 'ready' : 'failed';
    animation.statusError = err instanceof Error ? err.message : 'Generation failed';
    await animation.save();
    throw err;
  }
}

async function processEdit(
  data: Extract<AnimationJobData, { kind: 'edit' }>,
): Promise<AnimationJobResult> {
  const animation = await AnimationModel.findById(data.animationId);
  if (!animation) throw new Error(`Animation ${data.animationId} not found`);
  if (animation.frameKeys.length < 2) throw new Error('Animation needs at least 2 frames to edit');

  try {
    const frames = await Promise.all(animation.frameKeys.map((key) => downloadBufferFromS3(key)));

    const jobId = await submitEditAnimation({
      frames,
      description: data.instruction,
      width: animation.frameWidth,
      height: animation.frameHeight,
    });
    const edited = await waitForBackgroundJob(jobId);

    const oldKeys = animation.frameKeys;
    const { keys, width, height } = await uploadFrames(edited);

    animation.frameKeys = keys;
    animation.frameWidth = width;
    animation.frameHeight = height;
    animation.action = data.instruction;
    animation.status = 'ready';
    animation.statusError = '';
    const staleExports = [animation.spritesheetKey, animation.spritesheetJsonKey, animation.gifKey].filter(Boolean);
    animation.spritesheetKey = '';
    animation.spritesheetJsonKey = '';
    animation.gifKey = '';
    await animation.save();
    await deleteKeysQuietly([...oldKeys, ...staleExports]);

    return { kind: 'edit', animationId: animation._id.toString(), frameCount: keys.length };
  } catch (err) {
    // Original frames are untouched on failure — surface the error but stay usable.
    animation.status = 'ready';
    animation.statusError = err instanceof Error ? err.message : 'Edit failed';
    await animation.save();
    throw err;
  }
}

async function processRotations(
  data: Extract<AnimationJobData, { kind: 'rotations' }>,
): Promise<AnimationJobResult> {
  const character = await CharacterModel.findById(data.characterId);
  if (!character) throw new Error(`Character ${data.characterId} not found`);

  const source = await downloadBufferFromS3(data.sourceImageKey);
  const prepared = await prepareFrameForPixelLab(source);

  const jobId = await submitGenerate8Rotations({ firstFrame: prepared.buffer });
  const images = await waitForBackgroundJob(jobId);
  if (images.length !== ROTATION_DIRECTIONS.length) {
    throw new Error(`Expected 8 rotation images, got ${images.length}`);
  }

  const oldRotations = character.assets.rotations;
  const rotations = {} as ICharacterRotations;
  for (let i = 0; i < ROTATION_DIRECTIONS.length; i++) {
    rotations[ROTATION_DIRECTIONS[i]] = await uploadBufferToS3(images[i], 'image/png', 'rotations');
  }

  character.assets.rotations = rotations;
  character.markModified('assets');
  await character.save();
  if (oldRotations) {
    await deleteKeysQuietly(Object.values(oldRotations).filter(Boolean));
  }

  return { kind: 'rotations', characterId: character._id.toString() };
}

async function processAnimationJob(
  job: Job<AnimationJobData, AnimationJobResult>,
): Promise<AnimationJobResult> {
  switch (job.data.kind) {
    case 'generate':  return processGenerate(job.data);
    case 'edit':      return processEdit(job.data);
    case 'rotations': return processRotations(job.data);
  }
}

export const animationWorker = new Worker<AnimationJobData, AnimationJobResult>(
  ANIMATION_QUEUE,
  processAnimationJob,
  {
    connection: redis,
    concurrency: 2,
  },
);

animationWorker.on('completed', (job) => {
  console.log(`[animationWorker] job ${job.id} (${job.data.kind}) completed`);
});

animationWorker.on('failed', (job, err) => {
  console.error(`[animationWorker] job ${job?.id} (${job?.data.kind}) failed:`, err.message);
});
