import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

// ---------------------------------------------------------------------------
// Background removal on CPU, in-process.
//
// This used to be a ComfyUI node (`easy imageRemBg`) spliced into the workflow.
// On RunPod that would mean a GPU cold start plus billed GPU seconds for a
// task that runs in about a second on CPU — and it would have forced
// ComfyUI-Easy-Use plus its lazily-downloaded weights into all three images.
//
// The model is RMBG-1.4, the same one the ComfyUI node used, so output stays
// close to what the existing styles produce. Weights are vendored rather than
// fetched at runtime; see vendor/rmbg/README.md for the licence, which is
// NOT permissive for commercial use.
// ---------------------------------------------------------------------------

const MODEL_PATH = path.join(__dirname, '../../../vendor/rmbg/rmbg-1.4.onnx');

// RMBG-1.4 (ISNet) expects 1024×1024 RGB, normalised to roughly [-1, 1]
const INPUT_SIZE = 1024;
const MEAN = 0.5;
const STD = 1.0;

let session: ort.InferenceSession | null = null;

async function getSession(): Promise<ort.InferenceSession> {
  if (session) return session;

  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error(
      `RMBG weights missing at ${MODEL_PATH}. Run \`npm run fetch:rmbg\` (see vendor/rmbg/README.md).`,
    );
  }

  session = await ort.InferenceSession.create(MODEL_PATH);
  return session;
}

/** RGB planar float32, normalised — the layout ISNet wants (1, 3, H, W). */
async function toInputTensor(png: Buffer): Promise<ort.Tensor> {
  const { data } = await sharp(png)
    .removeAlpha()
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = INPUT_SIZE * INPUT_SIZE;
  const chw = new Float32Array(pixels * 3);

  for (let i = 0; i < pixels; i++) {
    chw[i] = (data[i * 3] / 255 - MEAN) / STD;
    chw[pixels + i] = (data[i * 3 + 1] / 255 - MEAN) / STD;
    chw[pixels * 2 + i] = (data[i * 3 + 2] / 255 - MEAN) / STD;
  }

  return new ort.Tensor('float32', chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

/**
 * The network's first output is the finest-resolution saliency map. Values are
 * unbounded, so min-max normalise before treating them as an alpha channel —
 * without it, low-contrast subjects come back almost fully transparent.
 *
 * Exported for testing: this is the part that is easy to get subtly wrong and
 * does not need the 176 MB weights to exercise.
 */
export function normaliseMask(values: Float32Array): Buffer {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  const mask = Buffer.allocUnsafe(values.length);
  for (let i = 0; i < values.length; i++) {
    mask[i] = Math.round(((values[i] - min) / range) * 255);
  }
  return mask;
}

/**
 * Cuts the background out of a PNG and returns it with the matte as its alpha
 * channel. Alpha is left soft here; callers that need hard pixel edges run it
 * through `thresholdAlpha` (see alphaUtils.ts).
 */
export async function removeBackground(png: Buffer): Promise<Buffer> {
  const started = Date.now();
  const model = await getSession();

  const { width, height } = await sharp(png).metadata();
  if (!width || !height) throw new Error('Could not read input image dimensions');

  const feeds: Record<string, ort.Tensor> = { [model.inputNames[0]]: await toInputTensor(png) };
  const results = await model.run(feeds);
  const output = results[model.outputNames[0]];

  // Mask comes back at the model's input size; stretch it back over the source.
  // toColourspace('b-w') is load-bearing: without it sharp promotes the
  // single-channel mask to sRGB and hands back an interleaved 3-channel buffer,
  // so every read lands on the wrong pixel.
  const { data: alpha, info: alphaInfo } = await sharp(normaliseMask(output.data as Float32Array), {
    raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 },
  })
    .resize(width, height, { fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (alphaInfo.channels !== 1) {
    throw new Error(`Expected a single-channel matte, got ${alphaInfo.channels} channels`);
  }

  // Interleave RGB + mask by hand rather than via joinChannel: sharp will
  // happily produce a fourth band that PNG encoding then discards as an unnamed
  // extra channel, silently writing an opaque RGB image. Building the RGBA
  // buffer directly leaves no room for that.
  const rgb = await sharp(png).removeAlpha().raw().toBuffer();
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }

  const result = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  console.log(`[backgroundRemover] cut ${width}×${height} in ${Date.now() - started}ms`);
  return result;
}
