import path from 'path';
import sharp from 'sharp';

type PixelSnapperWasm = {
  process_image: (bytes: Uint8Array, kColors?: number, pixelSizeOverride?: number) => Uint8Array;
};

let _wasm: PixelSnapperWasm | null = null;

async function getWasm(): Promise<PixelSnapperWasm> {
  if (_wasm) return _wasm;
  const pkgPath = path.join(__dirname, '../../../vendor/pixel-snapper/pkg/spritefusion_pixel_snapper.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(pkgPath) as PixelSnapperWasm;
  _wasm = mod;
  return mod;
}

// Hard-threshold alpha: pixels with alpha < 128 → fully transparent (0),
// alpha ≥ 128 → fully opaque (255). Eliminates the RMBG-1.4 semi-transparent
// halo that wastes k-means centroid slots and causes fringe in snapped output.
async function thresholdAlpha(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] < 128 ? 0 : 255;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function snapAndResize(
  png: Buffer,
  targetSize: number,
  kColors = 16,
): Promise<Buffer> {
  const wasm = await getWasm();

  const thresholded = await thresholdAlpha(png);

  // Tell the WASM how many source pixels equal one sprite pixel so it outputs
  // at ~targetSize × targetSize with the subject centred. Without this, the WASM
  // receives the full 1024px rmbg output with no downscale hint and returns the
  // same large image — the subsequent crop then shows only the top-left corner.
  const { width: srcW, height: srcH } = await sharp(thresholded).metadata();
  if (!srcW || !srcH) throw new Error('Could not read input image dimensions');
  const pixelSize = Math.max(1, Math.round(Math.min(srcW, srcH) / targetSize));

  const input = new Uint8Array(thresholded);
  const snapped = wasm.process_image(input, kColors, pixelSize);

  const snappedBuf = Buffer.from(snapped);
  const { width, height } = await sharp(snappedBuf).metadata();
  if (!width || !height) throw new Error('Pixel snapper returned image with no dimensions');

  // Trim the +1 walker-overshoot artifact, then scale up if still short
  const cropSize = Math.min(width, height, targetSize);
  const cropped = await sharp(snappedBuf)
    .extract({ left: 0, top: 0, width: cropSize, height: cropSize })
    .toBuffer();

  if (cropSize === targetSize) return cropped;

  return sharp(cropped)
    .resize(targetSize, targetSize, { kernel: 'nearest' })
    .toBuffer();
}
