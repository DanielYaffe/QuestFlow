import sharp from 'sharp';
import { config } from '../../config/config';

// ---------------------------------------------------------------------------
// PixelLab API client (https://api.pixellab.ai/v2) — sprite animation and
// 8-direction rotations. All heavy endpoints are async: submit returns a
// background_job_id which is polled until completed/failed. Images travel as
// base64 PNG both ways.
//
// Billing: v3 endpoints charge subscription "generations"; Pro endpoints
// (edit-animation-v2, interpolation-v2, …) charge USD credits. A trial account
// with $0 credits can use the v3 endpoints but Pro calls will be refused —
// PixelLabError.isBillingError flags that case for a friendly UI message.
// ---------------------------------------------------------------------------

export const PIXELLAB_MAX_DIMENSION = 256;
// animate-with-text-v3 budget: width × height × frame_count ≤ 524,288
export const PIXELLAB_PIXEL_BUDGET = 524_288;

export const MIN_FRAMES = 4;
export const MAX_FRAMES = 16;

/** Clamp to the animate-with-text-v3 constraint: 4-16 frames, even count. */
export function normalizeFrameCount(requested: number | undefined): number {
  const n = Math.round(requested ?? 8);
  const clamped = Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, n));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

export class PixelLabError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly isBillingError: boolean = false,
  ) {
    super(message);
    this.name = 'PixelLabError';
  }
}

interface Base64ImagePayload {
  type: 'base64';
  base64: string;
  format: 'png';
}

function toBase64Image(buffer: Buffer): Base64ImagePayload {
  return { type: 'base64', base64: buffer.toString('base64'), format: 'png' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function base64ToBuffer(value: string): Buffer {
  // Responses may or may not carry a data-URL prefix.
  const raw = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
  return Buffer.from(raw, 'base64');
}

async function pixellabFetch(path: string, init?: RequestInit): Promise<unknown> {
  if (!config.PIXELLAB_API_KEY) {
    throw new PixelLabError('PIXELLAB_API_KEY is not configured');
  }
  const res = await fetch(`${config.PIXELLAB_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.PIXELLAB_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    let detail = `PixelLab request failed (${res.status})`;
    if (isRecord(body) && typeof body.detail === 'string') detail = body.detail;
    const isBilling = res.status === 402 || /credit|balance|generation.?s? (left|remaining)|insufficient/i.test(detail);
    throw new PixelLabError(detail, res.status, isBilling);
  }
  return body;
}

function extractJobId(body: unknown): string {
  if (isRecord(body) && typeof body.background_job_id === 'string') {
    return body.background_job_id;
  }
  throw new PixelLabError('PixelLab response missing background_job_id');
}

// --- balance -----------------------------------------------------------------

export interface PixelLabBalance {
  usd: number;
  generationsLeft: number | null;
  generationsTotal: number | null;
  plan: string | null;
}

export async function getBalance(): Promise<PixelLabBalance> {
  const body = await pixellabFetch('/balance');
  if (!isRecord(body)) throw new PixelLabError('Unexpected balance response');

  const credits = isRecord(body.credits) ? body.credits : {};
  const subscription = isRecord(body.subscription) ? body.subscription : {};

  return {
    usd: typeof credits.usd === 'number' ? credits.usd : 0,
    generationsLeft: typeof subscription.generations === 'number' ? subscription.generations : null,
    generationsTotal: typeof subscription.total === 'number' ? subscription.total : null,
    plan: typeof subscription.plan === 'string' ? subscription.plan
      : typeof subscription.status === 'string' ? subscription.status : null,
  };
}

// --- submissions ---------------------------------------------------------------

export async function submitAnimateWithText(params: {
  firstFrame: Buffer;
  action: string;
  frameCount: number; // 4-16, must be even (validated upstream)
  seed?: number;
  noBackground?: boolean;
}): Promise<string> {
  const body = await pixellabFetch('/animate-with-text-v3', {
    method: 'POST',
    body: JSON.stringify({
      first_frame: toBase64Image(params.firstFrame),
      action: params.action,
      frame_count: params.frameCount,
      seed: params.seed ?? 0,
      no_background: params.noBackground ?? true,
    }),
  });
  return extractJobId(body);
}

export async function submitGenerate8Rotations(params: {
  firstFrame: Buffer;
  seed?: number;
  noBackground?: boolean;
}): Promise<string> {
  const body = await pixellabFetch('/generate-8-rotations-v3', {
    method: 'POST',
    body: JSON.stringify({
      first_frame: toBase64Image(params.firstFrame),
      seed: params.seed ?? 0,
      no_background: params.noBackground ?? true,
    }),
  });
  return extractJobId(body);
}

export async function submitEditAnimation(params: {
  frames: Buffer[];
  description: string;
  width: number;
  height: number;
  seed?: number;
  noBackground?: boolean;
}): Promise<string> {
  const size = { width: params.width, height: params.height };
  const body = await pixellabFetch('/edit-animation-v2', {
    method: 'POST',
    body: JSON.stringify({
      description: params.description,
      frames: params.frames.map((frame) => ({ image: toBase64Image(frame), size })),
      image_size: size,
      seed: params.seed ?? 0,
      no_background: params.noBackground ?? false,
    }),
  });
  return extractJobId(body);
}

// --- polling -------------------------------------------------------------------

/**
 * Poll a background job until it settles; returns the result frames decoded to
 * PNG buffers (completed jobs expose them at last_response.images).
 */
export async function waitForBackgroundJob(
  jobId: string,
  opts: { timeoutMs?: number; intervalMs?: number; onPoll?: (status: string) => void } = {},
): Promise<Buffer[]> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const body = await pixellabFetch(`/background-jobs/${jobId}`);
    if (!isRecord(body) || typeof body.status !== 'string') {
      throw new PixelLabError('Unexpected background-job response');
    }
    opts.onPoll?.(body.status);

    if (body.status === 'completed') {
      const last = isRecord(body.last_response) ? body.last_response : {};
      const images = Array.isArray(last.images) ? last.images : [];
      const buffers = images
        .map((img: unknown) => {
          if (isRecord(img) && typeof img.base64 === 'string') return base64ToBuffer(img.base64);
          if (typeof img === 'string') return base64ToBuffer(img);
          return null;
        })
        .filter((b): b is Buffer => b !== null);
      if (buffers.length === 0) {
        throw new PixelLabError('PixelLab job completed but returned no images');
      }
      return buffers;
    }

    if (body.status === 'failed') {
      const last = isRecord(body.last_response) ? body.last_response : {};
      const detail = typeof last.detail === 'string' ? last.detail : 'PixelLab generation failed';
      throw new PixelLabError(detail);
    }

    if (Date.now() > deadline) {
      throw new PixelLabError(`PixelLab job timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// --- input preparation -----------------------------------------------------------

export interface PreparedFrame {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Normalize a source image for PixelLab: PNG-encoded, max dimension 256, and
 * (for animation) small enough that width × height × frameCount fits the pixel
 * budget. Downscales with nearest-neighbor to keep pixel art crisp; never
 * upscales. Dimensions are kept even (API requirement for animation frames).
 */
export async function prepareFrameForPixelLab(
  source: Buffer,
  frameCount = 1,
): Promise<PreparedFrame> {
  const meta = await sharp(source).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) throw new PixelLabError('Source image has no dimensions');

  let scale = 1;
  const maxDim = Math.max(srcW, srcH);
  if (maxDim > PIXELLAB_MAX_DIMENSION) scale = PIXELLAB_MAX_DIMENSION / maxDim;

  const budget = PIXELLAB_PIXEL_BUDGET / Math.max(1, frameCount);
  if (srcW * scale * srcH * scale > budget) {
    scale = Math.min(scale, Math.sqrt(budget / (srcW * srcH)));
  }

  const even = (n: number) => Math.max(2, 2 * Math.floor(n / 2));
  const width = even(srcW * scale);
  const height = even(srcH * scale);

  if (width === even(srcW) && height === even(srcH) && meta.format === 'png' && width === srcW && height === srcH) {
    return { buffer: source, width: srcW, height: srcH };
  }

  const buffer = await sharp(source)
    .resize(width, height, { kernel: 'nearest', fit: 'fill' })
    .png()
    .toBuffer();
  return { buffer, width, height };
}
