import sharp from 'sharp';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import AnimationModel, { IAnimation } from '../models/animationModel';
import SpriteModel from '../models/spriteModel';
import { animationQueue, AnimationJobData } from '../queues/animationQueue';
import {
  uploadBufferToS3,
  downloadBufferFromS3,
  deleteFileFromS3,
  getPresignedUrl,
} from '../utils/s3Helper';
import { normalizeFrameCount } from './generation/pixellabService';

// ---------------------------------------------------------------------------
// Animation service — everything the animation endpoints need: CRUD over the
// Animation collection, PixelLab job enqueueing, and on-demand exports
// (horizontal spritesheet + frame JSON, animated GIF). Frames live in S3 as
// individual PNGs; docs store keys only, presigned URLs are minted on read.
// ---------------------------------------------------------------------------

export interface AnimationSummary {
  _id: string;
  name: string;
  action: string;
  status: IAnimation['status'];
  statusError: string;
  fps: number;
  loop: boolean;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  spriteId: string;
  characterId: string;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnimationDetail extends AnimationSummary {
  frameKeys: string[];
  frameUrls: string[];
  sourceImageKey: string;
  sourceImageUrl: string;
}

async function toSummary(doc: IAnimation): Promise<AnimationSummary> {
  const previewKey = doc.frameKeys[0] || doc.sourceImageKey;
  return {
    _id: doc._id.toString(),
    name: doc.name,
    action: doc.action,
    status: doc.status,
    statusError: doc.statusError,
    fps: doc.fps,
    loop: doc.loop,
    frameCount: doc.frameKeys.length,
    frameWidth: doc.frameWidth,
    frameHeight: doc.frameHeight,
    spriteId: doc.spriteId,
    characterId: doc.characterId,
    previewUrl: previewKey ? await getPresignedUrl(previewKey) : '',
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function toDetail(doc: IAnimation): Promise<AnimationDetail> {
  const summary = await toSummary(doc);
  return {
    ...summary,
    frameKeys: doc.frameKeys,
    frameUrls: await Promise.all(doc.frameKeys.map((key) => getPresignedUrl(key))),
    sourceImageKey: doc.sourceImageKey,
    sourceImageUrl: doc.sourceImageKey ? await getPresignedUrl(doc.sourceImageKey) : '',
  };
}

async function findOwned(ownerId: string, animationId: string): Promise<IAnimation> {
  const doc = await AnimationModel.findOne({ _id: animationId, ownerId });
  if (!doc) {
    const err = new Error('Animation not found');
    err.name = 'NotFoundError';
    throw err;
  }
  return doc;
}

// --- list / get -------------------------------------------------------------

export async function listAnimations(filter: {
  ownerId: string;
  projectId?: string;
  characterId?: string;
  spriteId?: string;
}): Promise<AnimationSummary[]> {
  const query: Record<string, unknown> = { ownerId: filter.ownerId };
  if (filter.projectId) query.projectId = filter.projectId;
  if (filter.characterId) query.characterId = filter.characterId;
  if (filter.spriteId) query.spriteId = filter.spriteId;

  const docs = await AnimationModel.find(query).sort({ updatedAt: -1 }).limit(100);
  return Promise.all(docs.map(toSummary));
}

export async function getAnimation(ownerId: string, animationId: string): Promise<AnimationDetail> {
  return toDetail(await findOwned(ownerId, animationId));
}

// --- generation --------------------------------------------------------------

export async function createAndGenerate(input: {
  ownerId: string;
  projectId: string;
  name: string;
  action: string;
  frameCount?: number;
  spriteId?: string;
  sourceImageKey?: string;
  characterId?: string;
}): Promise<{ animationId: string; jobId: string }> {
  let sourceImageKey = input.sourceImageKey ?? '';
  if (!sourceImageKey && input.spriteId) {
    const sprite = await SpriteModel.findOne({ _id: input.spriteId, ownerId: input.ownerId }).lean();
    if (!sprite) throw new Error('Source sprite not found');
    sourceImageKey = sprite.imageUrl; // Sprite.imageUrl stores the raw S3 key
  }
  if (!sourceImageKey) throw new Error('A source image is required (spriteId or sourceImageKey)');

  const frameCount = normalizeFrameCount(input.frameCount);

  const doc = await AnimationModel.create({
    ownerId: input.ownerId,
    projectId: input.projectId,
    name: input.name,
    action: input.action,
    spriteId: input.spriteId ?? '',
    characterId: input.characterId ?? '',
    sourceImageKey,
    status: 'generating',
  });

  const job = await animationQueue.add('generate', {
    kind: 'generate',
    animationId: doc._id.toString(),
    sourceImageKey,
    action: input.action,
    frameCount,
  } satisfies AnimationJobData);

  return { animationId: doc._id.toString(), jobId: String(job.id) };
}

export async function regenerate(
  ownerId: string,
  animationId: string,
  input: { action: string; frameCount?: number },
): Promise<{ jobId: string }> {
  const doc = await findOwned(ownerId, animationId);
  doc.status = 'generating';
  doc.statusError = '';
  await doc.save();

  const job = await animationQueue.add('generate', {
    kind: 'generate',
    animationId: doc._id.toString(),
    sourceImageKey: doc.sourceImageKey,
    action: input.action,
    frameCount: normalizeFrameCount(input.frameCount ?? doc.frameKeys.length),
  } satisfies AnimationJobData);

  return { jobId: String(job.id) };
}

export async function editWithText(
  ownerId: string,
  animationId: string,
  instruction: string,
): Promise<{ jobId: string }> {
  const doc = await findOwned(ownerId, animationId);
  if (doc.status !== 'ready' || doc.frameKeys.length < 2) {
    throw new Error('Animation must be ready with at least 2 frames to edit');
  }
  doc.status = 'generating';
  doc.statusError = '';
  await doc.save();

  const job = await animationQueue.add('edit', {
    kind: 'edit',
    animationId: doc._id.toString(),
    instruction,
  } satisfies AnimationJobData);

  return { jobId: String(job.id) };
}

// --- update / delete ----------------------------------------------------------

export async function updateAnimation(
  ownerId: string,
  animationId: string,
  patch: { name?: string; fps?: number; loop?: boolean; frameKeys?: string[]; characterId?: string },
): Promise<AnimationDetail> {
  const doc = await findOwned(ownerId, animationId);

  if (patch.name !== undefined) doc.name = patch.name.trim() || doc.name;
  if (patch.fps !== undefined) doc.fps = Math.min(30, Math.max(1, Math.round(patch.fps)));
  if (patch.loop !== undefined) doc.loop = patch.loop;
  if (patch.characterId !== undefined) doc.characterId = patch.characterId;

  if (patch.frameKeys !== undefined) {
    // Reorder/delete: the client sends the surviving keys in the new order.
    // Every key must already belong to this animation; dropped keys are
    // deleted from S3.
    const existing = new Set(doc.frameKeys);
    const unknown = patch.frameKeys.find((key) => !existing.has(key));
    if (unknown) throw new Error('frameKeys contains a key that does not belong to this animation');
    if (new Set(patch.frameKeys).size !== patch.frameKeys.length) {
      throw new Error('frameKeys contains duplicates');
    }
    if (patch.frameKeys.length === 0) throw new Error('An animation must keep at least one frame');

    const kept = new Set(patch.frameKeys);
    const dropped = doc.frameKeys.filter((key) => !kept.has(key));
    doc.frameKeys = patch.frameKeys;
    if (dropped.length > 0) {
      await Promise.allSettled(dropped.map((key) => deleteFileFromS3(key)));
      // Frame changes invalidate cached exports.
      await invalidateExports(doc);
    }
  }

  await doc.save();
  return toDetail(doc);
}

async function invalidateExports(doc: IAnimation): Promise<void> {
  const stale = [doc.spritesheetKey, doc.spritesheetJsonKey, doc.gifKey].filter(Boolean);
  doc.spritesheetKey = '';
  doc.spritesheetJsonKey = '';
  doc.gifKey = '';
  if (stale.length > 0) {
    await Promise.allSettled(stale.map((key) => deleteFileFromS3(key)));
  }
}

export async function deleteAnimation(ownerId: string, animationId: string): Promise<void> {
  const doc = await findOwned(ownerId, animationId);
  const keys = [
    ...doc.frameKeys,
    doc.spritesheetKey,
    doc.spritesheetJsonKey,
    doc.gifKey,
  ].filter(Boolean);
  await doc.deleteOne();
  await Promise.allSettled(keys.map((key) => deleteFileFromS3(key)));
}

// --- exports ------------------------------------------------------------------

export interface ExportResult {
  spritesheetUrl?: string;
  spritesheetJsonUrl?: string;
  gifUrl?: string;
}

export async function exportAnimation(
  ownerId: string,
  animationId: string,
  formats: ('spritesheet' | 'gif')[],
): Promise<ExportResult> {
  const doc = await findOwned(ownerId, animationId);
  if (doc.status !== 'ready' || doc.frameKeys.length === 0) {
    throw new Error('Animation has no frames to export');
  }

  const frames = await Promise.all(doc.frameKeys.map((key) => downloadBufferFromS3(key)));
  const result: ExportResult = {};

  if (formats.includes('spritesheet')) {
    if (!doc.spritesheetKey || !doc.spritesheetJsonKey) {
      const { sheet, json } = await buildSpritesheet(doc, frames);
      doc.spritesheetKey = await uploadBufferToS3(sheet, 'image/png', 'animation-exports');
      doc.spritesheetJsonKey = await uploadBufferToS3(json, 'application/json', 'animation-exports');
      await doc.save();
    }
    result.spritesheetUrl = await getPresignedUrl(doc.spritesheetKey);
    result.spritesheetJsonUrl = await getPresignedUrl(doc.spritesheetJsonKey);
  }

  if (formats.includes('gif')) {
    if (!doc.gifKey) {
      const gif = await buildGif(doc, frames);
      doc.gifKey = await uploadBufferToS3(gif, 'image/gif', 'animation-exports');
      await doc.save();
    }
    result.gifUrl = await getPresignedUrl(doc.gifKey);
  }

  return result;
}

async function buildSpritesheet(
  doc: IAnimation,
  frames: Buffer[],
): Promise<{ sheet: Buffer; json: Buffer }> {
  const { frameWidth: w, frameHeight: h } = doc;
  const sheet = await sharp({
    create: {
      width: w * frames.length,
      height: h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frames.map((input, i) => ({ input, left: i * w, top: 0 })))
    .png()
    .toBuffer();

  const metadata = {
    name: doc.name,
    frameSize: { width: w, height: h },
    frameCount: frames.length,
    fps: doc.fps,
    loop: doc.loop,
    frames: frames.map((_, i) => ({ index: i, x: i * w, y: 0, width: w, height: h })),
  };

  return { sheet, json: Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8') };
}

async function buildGif(doc: IAnimation, frames: Buffer[]): Promise<Buffer> {
  const gif = GIFEncoder();
  const delay = Math.round(1000 / doc.fps);

  for (const frame of frames) {
    const { data, info } = await sharp(frame)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const palette = quantize(rgba, 256, { format: 'rgba4444' });
    const index = applyPalette(rgba, palette, 'rgba4444');
    gif.writeFrame(index, info.width, info.height, {
      palette,
      delay,
      transparent: true,
      repeat: doc.loop ? 0 : -1,
    });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}
