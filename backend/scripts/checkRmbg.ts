import sharp from 'sharp';
import { removeBackground } from '../src/services/generation/backgroundRemover';

// Manual smoke check for the CPU background remover.
//
// The equivalent Jest test is skipped: onnxruntime's Tensor rejects a
// Float32Array created inside Jest's VM realm ("a float32 tensor's data must be
// type of Float32Array"), which is a test-environment artifact rather than a
// defect in the code. Run this instead:
//
//   npm run check:rmbg

async function main() {
  // A red disc on a blue field — the disc should survive, the field should not
  const size = 256;
  const svg = `<svg width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#1e40af"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 3}" fill="#dc2626"/>
  </svg>`;
  const source = await sharp(Buffer.from(svg)).png().toBuffer();

  const out = await removeBackground(source);
  const meta = await sharp(out).metadata();
  console.log(`output: ${meta.width}x${meta.height}, channels=${meta.channels}, alpha=${meta.hasAlpha}`);

  const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];

  const subject = alphaAt(size / 2, size / 2);
  const background = alphaAt(2, 2);
  console.log(`alpha at centre (subject, want ~255): ${subject}`);
  console.log(`alpha at corner (background, want ~0): ${background}`);

  if (subject < 200 || background > 60) {
    console.error('FAILED: the matte did not separate subject from background');
    process.exit(1);
  }
  console.log('OK');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
