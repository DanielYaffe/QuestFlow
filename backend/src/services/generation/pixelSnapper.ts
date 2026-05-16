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

  // Crop off the +1 walker-overshoot edge artifact (129→128)
  const BASE_SIZE = 128;
  const cropped = await sharp(Buffer.from(snapped))
    .extract({ left: 0, top: 0, width: BASE_SIZE, height: BASE_SIZE })
    .toBuffer();

  if (targetSize === BASE_SIZE) return cropped;

  return sharp(cropped)
    .resize(targetSize, targetSize, { kernel: 'nearest' })
    .toBuffer();
}
