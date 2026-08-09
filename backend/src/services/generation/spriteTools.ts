import { removeBackground } from './backgroundRemover';
import { thresholdAlpha } from './alphaUtils';
import { snapAndResize } from './pixelSnapper';
import { smartResize } from './spriteResize';

// ---------------------------------------------------------------------------
// Sprite image tools shared by the design studio (characters and items):
// resize / remove background / pixel snap. All local — no PixelLab generations
// and, since the move to RunPod, no GPU round-trip either.
// ---------------------------------------------------------------------------

export type SpriteTool = 'resize' | 'remove-bg' | 'pixel-snap';

export function isSpriteTool(value: unknown): value is SpriteTool {
  return value === 'resize' || value === 'remove-bg' || value === 'pixel-snap';
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
      const result = await removeBackground(source);
      return thresholdAlpha(result);
    }
    case 'pixel-snap': {
      const target = Math.min(256, Math.max(8, Math.round(params.targetSize ?? 64)));
      return snapAndResize(source, target);
    }
  }
}
