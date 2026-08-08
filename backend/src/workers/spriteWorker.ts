import { Worker, Job } from 'bullmq';
import { redis } from '../queues/connection';
import { SpriteJobData, SpriteJobResult } from '../queues/spriteQueue';
import { composeImagePrompt } from '../services/generation/imagePromptComposer';
import { generateWithStyle } from '../services/generation/generationService';
import { removeBackground } from '../services/generation/backgroundRemover';
import { styleUnavailability, isStyleRunnable } from '../services/generation/styleAvailability';
import { snapAndResize } from '../services/generation/pixelSnapper';
import { uploadBufferToS3, getPresignedUrl } from '../utils/s3Helper';
import SpriteModel from '../models/spriteModel';
import SpriteStyleModel from '../models/spriteStyleModel';

async function resolveStyle(styleId: string) {
  const style = await SpriteStyleModel.findOne({ styleId, isActive: true }).lean();
  if (style) {
    // The controller already checked this, but a manifest can be reloaded
    // between enqueue and execution — better a clear failure than a paid-for
    // job that dies inside ComfyUI.
    const problems = styleUnavailability(style);
    if (problems.length > 0) {
      throw new Error(`Style "${styleId}" cannot run on the current manifest: ${problems.join('; ')}`);
    }
    return style;
  }

  const fallback = await SpriteStyleModel.findOne({ isDefault: true, isActive: true }).lean();
  if (fallback && isStyleRunnable(fallback)) return fallback;
  throw new Error(`No runnable sprite style for "${styleId}" and no runnable default configured`);
}

async function processSpriteJob(job: Job<SpriteJobData, SpriteJobResult>): Promise<SpriteJobResult> {
  const { userId, projectId, userPrompt, styleId, negativePrompt } = job.data;

  const style = await resolveStyle(styleId);

  const composed = composeImagePrompt({
    style,
    userSubject: userPrompt,
    extraNegative: negativePrompt || undefined,
  });

  // Tagged with the style so per-endpoint behaviour (cold starts, queue depth,
  // failures) is attributable — endpoints scale independently.
  console.log(`[spriteWorker] job ${job.id} generating style="${style.styleId}" endpoint="${style.endpointKey}"`);

  const rawBuffer = await generateWithStyle(
    composed,
    style.workflowTemplate,
    style.workflowPatchMap,
    style.endpointKey,
  );

  // Post-processing, all CPU-side. Background removal used to be a ComfyUI node
  // spliced into the workflow; on serverless that meant billed GPU seconds for
  // a task that runs in about a second here.
  const cutBuffer = style.removeBackground ? await removeBackground(rawBuffer) : rawBuffer;

  // Only pixel-snap styles that opt in via targetSize (e.g. cb_pixel → 64px).
  // Other styles (anime, realistic, raw) store the full-res output.
  // snapAndResize hard-thresholds alpha itself, so no extra pass when both run.
  const imageBuffer = style.targetSize
    ? await snapAndResize(cutBuffer, style.targetSize)
    : cutBuffer;

  const imageKey = await uploadBufferToS3(imageBuffer, 'image/png', 'sprites');

  const sprite = await SpriteModel.create({
    ownerId:        userId,
    projectId:      projectId ?? '',
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
    // Jobs are almost entirely spent waiting on RunPod, not on local CPU, and
    // the endpoints queue independently — so a higher concurrency mostly costs
    // open sockets. The CPU post-processing steps are the only real local work.
    concurrency: 8,
  },
);

spriteWorker.on('completed', (job) => {
  console.log(`[spriteWorker] job ${job.id} completed`);
});

spriteWorker.on('failed', (job, err) => {
  console.error(`[spriteWorker] job ${job?.id} failed:`, err.message);
});
