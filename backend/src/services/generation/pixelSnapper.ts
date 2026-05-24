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

export async function snapAndResize(
  png: Buffer,
  targetSize: number,
  kColors = 16,
): Promise<Buffer> {
  const wasm = await getWasm();

  const input = new Uint8Array(png);
  const snapped = wasm.process_image(input, kColors, undefined);

  const snappedBuf = Buffer.from(snapped);
  const { width, height } = await sharp(snappedBuf).metadata();
  if (!width || !height) throw new Error('Pixel snapper returned image with no dimensions');

  // Crop the +1 walker-overshoot artifact only when the image is larger than targetSize
  const cropSize = Math.min(width, height, targetSize);
  const cropped = await sharp(snappedBuf)
    .extract({ left: 0, top: 0, width: cropSize, height: cropSize })
    .toBuffer();

  if (cropSize === targetSize) return cropped;

  return sharp(cropped)
    .resize(targetSize, targetSize, { kernel: 'nearest' })
    .toBuffer();
}
