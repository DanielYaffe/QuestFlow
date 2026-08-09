# RMBG-1.4 weights

ONNX weights for background removal, used by
`src/services/generation/backgroundRemover.ts`.

## Why they are not committed

The model is ~176 MB. Fetch it instead:

```sh
npm run fetch:rmbg
```

That writes `rmbg-1.4.onnx` into this folder (gitignored). `backgroundRemover.ts` throws a clear
error pointing here if the file is missing, rather than failing deep inside onnxruntime.

If the backend runs in a container, run the fetch during the image build — the same
lazily-downloads-weights-at-runtime problem that made us drop `easy imageRemBg` from the ComfyUI
images applies here.

## Licence — read this before shipping commercially

RMBG-1.4 is Bria AI's, released under a **non-commercial** licence
(<https://huggingface.co/briaai/RMBG-1.4>). This is the same model the ComfyUI `easy imageRemBg`
node was already using, so the migration does not change our exposure — but it is now visible in
the repo rather than buried in a custom node.

If QuestFlow ever charges money, swap to permissively licensed weights. The ONNX plumbing in
`backgroundRemover.ts` is model-agnostic; a swap is this file, the fetch URL, and possibly the
`MEAN`/`STD`/`INPUT_SIZE` constants. Candidates:

- **u2netp** — ~4 MB, Apache-2.0, noticeably rougher edges.
- **BiRefNet** — MIT, better quality than RMBG-1.4, larger and slower.

Verify the licence text at the source before committing to either; do not take this file's word
for it.
