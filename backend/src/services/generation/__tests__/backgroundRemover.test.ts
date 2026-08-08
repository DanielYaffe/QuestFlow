import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import { normaliseMask, removeBackground } from '../backgroundRemover';
import { thresholdAlpha } from '../alphaUtils';

describe('normaliseMask', () => {
  it('stretches the value range onto 0-255', () => {
    const mask = normaliseMask(new Float32Array([-2, 0, 2]));
    expect([...mask]).toEqual([0, 128, 255]);
  });

  // Saliency values are unbounded; a low-contrast subject can come back with a
  // narrow range that would be almost fully transparent without normalising.
  it('rescales a narrow range rather than flattening it', () => {
    const mask = normaliseMask(new Float32Array([0.40, 0.45, 0.50]));
    expect(mask[0]).toBe(0);
    expect(mask[2]).toBe(255);
  });

  it('does not divide by zero on a uniform mask', () => {
    const mask = normaliseMask(new Float32Array([0.5, 0.5, 0.5]));
    expect([...mask]).toEqual([0, 0, 0]);
  });
});

describe('thresholdAlpha', () => {
  it('drives every pixel to fully opaque or fully transparent', async () => {
    // Four pixels with alpha 0, 127, 128, 255 — straddling the threshold
    const raw = Buffer.from([
      255, 0, 0, 0,
      255, 0, 0, 127,
      255, 0, 0, 128,
      255, 0, 0, 255,
    ]);
    const png = await sharp(raw, { raw: { width: 4, height: 1, channels: 4 } }).png().toBuffer();

    const out = await thresholdAlpha(png);
    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    expect([data[3], data[7], data[11], data[15]]).toEqual([0, 0, 255, 255]);
  });
});

// Always skipped, and not because of the weights: onnxruntime's Tensor checks
// `data instanceof Float32Array` against its own realm, and a Float32Array
// built inside Jest's VM context fails that check with "a float32 tensor's data
// must be type of Float32Array". That is an environment artifact, not a defect
// — the same code runs fine under tsx.
//
// Run `npm run check:rmbg` instead. It asserts the matte actually separates
// subject from background, which is what this test wanted to prove.
// eslint-disable-next-line jest/no-disabled-tests
describe.skip('removeBackground (integration — see npm run check:rmbg)', () => {
  it('returns a PNG with an alpha channel at the source dimensions', async () => {
    const source = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 0, g: 0, b: 255 } },
    }).png().toBuffer();

    const out = await removeBackground(source);
    const meta = await sharp(out).metadata();

    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
    expect(meta.channels).toBe(4);
    expect(meta.hasAlpha).toBe(true);
  }, 60_000);
});
