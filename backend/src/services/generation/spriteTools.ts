import sharp from 'sharp';
import { removeBackgroundWithComfy } from './generationService';
import { snapAndResize } from './pixelSnapper';
import { smartResize } from './spriteResize';

// ---------------------------------------------------------------------------
// Sprite image tools shared by the design studio (characters and items):
// resize / remove background / pixel snap. All local — no PixelLab generations.
// ---------------------------------------------------------------------------

export type SpriteTool = 'resize' | 'remove-bg' | 'pixel-snap';

export function isSpriteTool(value: unknown): value is SpriteTool {
  return value === 'resize' || value === 'remove-bg' || value === 'pixel-snap';
}

/**
 * Alpha thresholding keeps pixel edges hard after matting models produce soft
 * (anti-aliased) alpha — every pixel becomes fully opaque or fully transparent.
 */
async function thresholdAlpha(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] >= 128 ? 255 : 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function applySpriteTool(
  source: Buffer,
  tool: SpriteTool,
  params: { targetSize?: number },
): Promise<Buffer> {
  switch (tool) {
    case 'resize': {
      const target = Math.min(1024, Math.max(8, Math.round(params.targetSize ?? 64)));
      // Integer-scale + pad when growing, dominant-color snap when shrinking —
      // pixels stay square at any target size, no PixelLab generations spent.
      return smartResize(source, target);
    }
    case 'remove-bg': {
      const result = await removeBackgroundWithComfy(source);
      return thresholdAlpha(result);
    }
    case 'pixel-snap': {
      const target = Math.min(256, Math.max(8, Math.round(params.targetSize ?? 64)));
      return snapAndResize(source, target);
    }
  }
}
