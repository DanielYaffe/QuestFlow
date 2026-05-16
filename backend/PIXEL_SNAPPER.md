# Pixel Snapper — Setup Guide

The Pixel Snapper is a Rust crate ([Hugo-Dz/spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper)) that grid-snaps pixel art sprites. It runs as a WASM module inside the Node worker process — no shell-out, no temp files, ~0.5-1.5s per image.

The source lives in `backend/vendor/pixel-snapper/` as a **git submodule**. The compiled WASM output (`vendor/pixel-snapper/pkg/`) is **not** committed — each developer and the Docker image build it locally.

---

## First-time clone

When cloning the repo, init the submodule:

```bash
git clone --recurse-submodules <repo-url>
# or, if you already cloned without submodules:
git submodule update --init --recursive
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | stable (≥ 1.75) | https://rustup.rs |
| wasm-pack | latest | see below |

Install wasm-pack (one command):

```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

On Windows (PowerShell):

```powershell
irm https://rustwasm.github.io/wasm-pack/installer/init.ps1 | iex
```

---

## Build the WASM module

From the `backend/` directory:

```bash
npm run build:pixel-snapper
```

This runs `wasm-pack build --target nodejs --out-dir pkg --release` inside `vendor/pixel-snapper/` and produces `vendor/pixel-snapper/pkg/` with:

```
pkg/
  spritefusion_pixel_snapper.js     ← loaded by pixelSnapper.ts
  spritefusion_pixel_snapper_bg.wasm
  spritefusion_pixel_snapper.d.ts
  package.json
```

Build time: ~30-60s on first run (compiles Rust + WASM), ~5s on subsequent runs (incremental).

---

## Upgrading the snapper

The submodule is pinned to a specific upstream commit. To pull a newer version:

```bash
cd backend/vendor/pixel-snapper
git fetch origin
git checkout <new-tag-or-commit>
cd ../..
git add vendor/pixel-snapper
git commit -m "chore: bump pixel-snapper to <version>"
```

Then rebuild:

```bash
npm run build:pixel-snapper
```

---

## Docker / Production

The `Dockerfile` handles everything in a two-stage build:

1. **Stage 1** (`rust:1.85-slim`) — installs wasm-pack, builds the WASM.
2. **Stage 2** (`node:22-slim`) — copies the compiled `pkg/` output, installs Node deps, runs the app.

No Rust toolchain is needed on the production host. The WASM binary is baked into the image.

To build and run the full stack locally with Docker:

```bash
docker compose up --build
```

This starts: backend API (port 3000), worker process, Redis (6379), MongoDB (27017).

---

## How it works in the pipeline

```
ComfyUI → 1024×1024 RGBA PNG (background already removed by easy imageRemBg)
  ↓
snapAndResize(buffer, targetSize)          # pixelSnapper.ts
  ↓ WASM process_image(bytes, k=16, auto)  # ~0.5-1.5s
  ↓ sharp.extract 128×128                  # crop +1 walker-overshoot artifact
  ↓ sharp.resize(targetSize, nearest)      # only if targetSize ≠ 128
  ↓
Upload to S3
```

`targetSize` resolution order (in `spriteWorker.ts`):
1. `character.assets.targetSizeOverride` (Plan 4, not yet wired)
2. `style.targetSize` from `config/styles.ts` (e.g. `cb_pixel` → 64)
3. Global default: `128`
