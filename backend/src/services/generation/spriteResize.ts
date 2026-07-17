import sharp from 'sharp';
import { snapAndResize } from './pixelSnapper';

// ---------------------------------------------------------------------------
// Pixel-art-safe resize to any target size, entirely local (sharp + the
// pixel-snapper WASM — no PixelLab generations):
// - growing: scale by a whole multiple so every source pixel stays a crisp
//   k×k block, then pad with transparency to hit the exact requested size
// - shrinking: dominant-color grid snapping — naive nearest-neighbor drops
//   and doubles pixels unevenly at non-integer ratios
// ---------------------------------------------------------------------------

export const MIN_RESIZE_TARGET = 8;
export const MAX_RESIZE_TARGET = 1024;

export function clampResizeTarget(target: number | undefined, fallback = 64): number {
  const n = Math.round(target ?? fallback);
  return Math.min(MAX_RESIZE_TARGET, Math.max(MIN_RESIZE_TARGET, n));
}

export async function smartResize(source: Buffer, targetSize: number): Promise<Buffer> {
  const target = clampResizeTarget(targetSize);
  const meta = await sharp(source).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) throw new Error('Source image has no dimensions');

  const maxDim = Math.max(srcW, srcH);
  if (target < maxDim) {
    return snapAndResize(source, target);
  }

  const k = Math.max(1, Math.floor(target / maxDim));
  const scaledW = srcW * k;
  const scaledH = srcH * k;
  const scaled = k === 1
    ? await sharp(source).png().toBuffer()
    : await sharp(source).resize(scaledW, scaledH, { kernel: 'nearest' }).png().toBuffer();

  if (scaledW === target && scaledH === target) return scaled;

  const padX = target - scaledW;
  const padY = target - scaledH;
  return sharp(scaled)
    .extend({
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}
