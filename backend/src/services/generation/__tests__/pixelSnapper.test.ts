import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import sharp from 'sharp';

// The snapper WASM is a vendored native module; stub it so these tests cover
// the geometry we wrap around it (how its output is fitted to the target size)
// rather than the k-means itself. `nextSnapped` is what the fake WASM returns.
let nextSnapped: Buffer = Buffer.alloc(0);
const processImage = jest.fn((_bytes: Uint8Array, _k?: number, _pixelSize?: number) => new Uint8Array(nextSnapped));

jest.mock(
  '../../../../vendor/pixel-snapper/pkg/spritefusion_pixel_snapper.js',
  () => ({ process_image: (b: Uint8Array, k?: number, p?: number) => processImage(b, k, p) }),
  { virtual: true },
);

import { snapAndResize } from '../pixelSnapper';

const HEAD = [0, 255, 0, 255];
const FEET = [255, 0, 0, 255];
const BODY = [80, 120, 200, 255];
const ARTIFACT = [255, 0, 255, 255];

function paint(data: Buffer, width: number, x: number, y: number, rgba: number[]): void {
  const i = (y * width + x) * 4;
  data[i] = rgba[0];
  data[i + 1] = rgba[1];
  data[i + 2] = rgba[2];
  data[i + 3] = rgba[3];
}

/**
 * A stand-in character: green head across the top, red feet across the bottom,
 * body between — so a test can tell whether either end of the subject survived.
 */
async function figure(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const band = y < 2 ? HEAD : y >= height - 2 ? FEET : BODY;
    for (let x = 0; x < width; x++) paint(data, width, x, y, band);
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/**
 * What the snapper actually returns: the snapped figure plus the one-pixel
 * walker overshoot along the right and bottom edges, in a colour of its own so
 * a test can tell "trimmed the artifact" apart from "cropped the character".
 */
async function snapWithOvershoot(contentW: number, contentH: number): Promise<Buffer> {
  const width = contentW + 1;
  const height = contentH + 1;
  const content = await sharp(await figure(contentW, contentH)).ensureAlpha().raw().toBuffer();
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < contentW && y < contentH) {
        const j = (y * contentW + x) * 4;
        paint(data, width, x, y, [content[j], content[j + 1], content[j + 2], content[j + 3]]);
      } else {
        paint(data, width, x, y, ARTIFACT);
      }
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function rawOf(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function pixelAt(raw: { data: Buffer; width: number }, x: number, y: number): number[] {
  const i = (y * raw.width + x) * 4;
  return [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3]];
}

/** Is an opaque pixel of this colour anywhere in the image? */
async function hasColour(png: Buffer, rgb: number[]): Promise<boolean> {
  const { data } = await rawOf(png);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    if (Math.abs(data[i] - rgb[0]) < 40 && Math.abs(data[i + 1] - rgb[1]) < 40 && Math.abs(data[i + 2] - rgb[2]) < 40) {
      return true;
    }
  }
  return false;
}

describe('snapAndResize', () => {
  beforeEach(() => { processImage.mockClear(); });

  it('keeps the whole subject when the source is taller than it is wide', async () => {
    // 512×1024 source at target 64 → one sprite pixel per 16 source pixels,
    // so the snap is a portrait 32×64.
    const source = await figure(512, 1024);
    nextSnapped = await snapWithOvershoot(32, 64);

    const result = await snapAndResize(source, 64);
    const raw = await rawOf(result);

    expect([raw.width, raw.height]).toEqual([64, 64]);
    // Neither end of the character may be cut off.
    expect(await hasColour(result, HEAD)).toBe(true);
    expect(await hasColour(result, FEET)).toBe(true);
    // A portrait subject is letterboxed into the square, not stretched.
    expect(pixelAt(raw, 0, 32)[3]).toBe(0);
    expect(pixelAt(raw, 63, 32)[3]).toBe(0);
  });

  it('sizes the snap off the long edge so the subject fits the target', async () => {
    const source = await figure(512, 1024);
    nextSnapped = await snapWithOvershoot(32, 64);

    await snapAndResize(source, 64);

    // 1024 / 64, not 512 / 64 — otherwise the snap comes back twice as tall as
    // the target and has to be squeezed down a second time.
    expect(processImage.mock.calls[0][2]).toBe(16);
  });

  it('keeps the whole subject when the source is wider than it is tall', async () => {
    const source = await figure(1024, 512);
    nextSnapped = await snapWithOvershoot(64, 32);

    const result = await snapAndResize(source, 64);
    const raw = await rawOf(result);

    expect([raw.width, raw.height]).toEqual([64, 64]);
    expect(await hasColour(result, HEAD)).toBe(true);
    expect(await hasColour(result, FEET)).toBe(true);
    expect(pixelAt(raw, 32, 0)[3]).toBe(0);
    expect(pixelAt(raw, 32, 63)[3]).toBe(0);
  });

  it('scales down rather than shaving when the snap overshoots the target', async () => {
    // 1024 at target 100 → 10 source pixels per sprite pixel → a 102×102 snap
    // that has to be fitted into 100×100.
    const source = await figure(1024, 1024);
    nextSnapped = await snapWithOvershoot(102, 102);

    const result = await snapAndResize(source, 100);
    const raw = await rawOf(result);

    expect([raw.width, raw.height]).toEqual([100, 100]);
    expect(await hasColour(result, HEAD)).toBe(true);
    expect(await hasColour(result, FEET)).toBe(true);
  });

  it('trims the walker overshoot on the exact-multiple happy path', async () => {
    const source = await figure(1024, 1024);
    nextSnapped = await snapWithOvershoot(64, 64);

    const result = await snapAndResize(source, 64);
    const raw = await rawOf(result);

    expect([raw.width, raw.height]).toEqual([64, 64]);
    expect(await hasColour(result, HEAD)).toBe(true);
    expect(await hasColour(result, FEET)).toBe(true);
    expect(await hasColour(result, ARTIFACT)).toBe(false);
  });
});
