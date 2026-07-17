import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import sharp from 'sharp';
import { smartResize, clampResizeTarget } from '../spriteResize';
import { snapAndResize } from '../pixelSnapper';

// The shrink path delegates to the pixel-snapper WASM — mock it so tests stay
// pure sharp.
jest.mock('../pixelSnapper', () => ({
  snapAndResize: jest.fn(async () => Buffer.from('snapped-sentinel')),
}));

const mockedSnap = snapAndResize as jest.Mock<typeof snapAndResize>;

/** Build a PNG from an RGBA pixel grid (one entry per pixel, row-major). */
async function pngFromPixels(width: number, height: number, pixels: number[][]): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  pixels.forEach((rgba, i) => {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  });
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function rawPixels(png: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function pixelAt(raw: { data: Buffer; width: number }, x: number, y: number): number[] {
  const i = (y * raw.width + x) * 4;
  return [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3]];
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const CLEAR = [0, 0, 0, 0];

describe('clampResizeTarget', () => {
  it('clamps into [8, 1024] and rounds', () => {
    expect(clampResizeTarget(4)).toBe(8);
    expect(clampResizeTarget(2000)).toBe(1024);
    expect(clampResizeTarget(63.6)).toBe(64);
    expect(clampResizeTarget(undefined)).toBe(64);
  });
});

describe('smartResize', () => {
  beforeEach(() => { mockedSnap.mockClear(); });

  it('upscales by a whole multiple, keeping pixels as exact blocks', async () => {
    // 2×2 checker: red/blue over blue/red → 8×8 means each pixel becomes 4×4.
    const source = await pngFromPixels(2, 2, [RED, BLUE, BLUE, RED]);
    const result = await smartResize(source, 8);

    const raw = await rawPixels(result);
    expect(raw.width).toBe(8);
    expect(raw.height).toBe(8);
    expect(pixelAt(raw, 0, 0)).toEqual(RED);
    expect(pixelAt(raw, 3, 3)).toEqual(RED); // still inside the first block
    expect(pixelAt(raw, 4, 0)).toEqual(BLUE); // block boundary is exact
    expect(pixelAt(raw, 7, 7)).toEqual(RED);
    expect(mockedSnap).not.toHaveBeenCalled();
  });

  it('pads with transparency to hit a non-multiple target, content centered', async () => {
    // 4×2 red bar → target 9: k=2 → 8×4, then pad to 9×9.
    const source = await pngFromPixels(4, 2, Array.from({ length: 8 }, () => RED));
    const result = await smartResize(source, 9);

    const raw = await rawPixels(result);
    expect(raw.width).toBe(9);
    expect(raw.height).toBe(9);
    expect(pixelAt(raw, 0, 0)).toEqual(CLEAR); // corner is padding
    expect(pixelAt(raw, 4, 4)).toEqual(RED); // center is content
    expect(pixelAt(raw, 0, 4)).toEqual(RED); // bar spans full padded width start
    expect(pixelAt(raw, 8, 8)).toEqual(CLEAR);
  });

  it('returns the same dimensions when target equals the source size', async () => {
    const source = await pngFromPixels(2, 2, [RED, BLUE, BLUE, RED]);
    const result = await smartResize(source, 8);
    const again = await smartResize(result, 8);

    const raw = await rawPixels(again);
    expect(raw.width).toBe(8);
    expect(raw.height).toBe(8);
    expect(pixelAt(raw, 0, 0)).toEqual(RED);
    expect(mockedSnap).not.toHaveBeenCalled();
  });

  it('delegates shrinking to the dominant-color pixel snapper', async () => {
    const source = await sharp({
      create: { width: 128, height: 128, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();

    const result = await smartResize(source, 32);

    expect(mockedSnap).toHaveBeenCalledTimes(1);
    expect(mockedSnap).toHaveBeenCalledWith(source, 32);
    expect(result.toString()).toBe('snapped-sentinel');
  });
});
