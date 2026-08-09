import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';

// Fetches the RMBG-1.4 ONNX weights used by backgroundRemover.ts.
// See vendor/rmbg/README.md — the licence is non-commercial.

const URL = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx?download=true';
const TARGET = path.join(__dirname, '../vendor/rmbg/rmbg-1.4.onnx');

async function main(): Promise<void> {
  if (fs.existsSync(TARGET)) {
    const mb = (fs.statSync(TARGET).size / 1024 / 1024).toFixed(1);
    console.log(`[fetch:rmbg] already present (${mb} MB) at ${TARGET}`);
    return;
  }

  fs.mkdirSync(path.dirname(TARGET), { recursive: true });

  console.log(`[fetch:rmbg] downloading ${URL}`);
  const response = await fetch(URL);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status} ${response.statusText})`);
  }

  // Write to a temp file first so an interrupted download cannot leave a
  // truncated .onnx that onnxruntime will fail on confusingly later.
  const temp = `${TARGET}.partial`;
  // fetch() hands back the global (undici) ReadableStream; Readable.fromWeb is
  // declared against stream/web's. Same object at runtime, separate declarations.
  const body = response.body as NodeReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(body), fs.createWriteStream(temp));
  fs.renameSync(temp, TARGET);

  const mb = (fs.statSync(TARGET).size / 1024 / 1024).toFixed(1);
  console.log(`[fetch:rmbg] wrote ${mb} MB to ${TARGET}`);
}

main().catch((err) => {
  console.error('[fetch:rmbg]', err instanceof Error ? err.message : err);
  process.exit(1);
});
