# QuestFlow

AI-powered RPG questline builder. Generate quests, characters, and pixel-art sprites from a web UI backed by ComfyUI, AWS Bedrock, BullMQ, and MongoDB.

## Repo structure

```
QuestFlow/
  frontend/          # React 18 + Vite + Tailwind 4
  backend/           # Express 5 + TypeScript + BullMQ
    src/
    vendor/
      pixel-snapper/ # git submodule — Rust WASM sprite post-processor
    Dockerfile
  docker-compose.yml # Redis + MongoDB + backend + worker
```

---

## Prerequisites

| Tool | Purpose |
|---|---|
| Node 22 | Backend + frontend |
| pnpm | Frontend package manager |
| npm | Backend package manager |
| Rust (stable) | Build pixel-snapper WASM (one-time) |
| wasm-pack | Build pixel-snapper WASM (one-time) |
| Redis 7 | BullMQ job queues |
| MongoDB 7 | Primary database |
| ComfyUI | Local image generation (optional for non-sprite work) |

**Install wasm-pack** (needed once to build the WASM module):
```powershell
# Windows
cargo install wasm-pack

# Mac / Linux
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

---

## First-time setup

### 1. Clone with submodules

```bash
git clone --recurse-submodules <repo-url>
# or if you already cloned:
git submodule update --init --recursive
```

### 2. Build the WASM pixel-snapper

```bash
cd backend
npm run build:pixel-snapper
```

This compiles the Rust crate in `vendor/pixel-snapper/` to WASM and writes output to `vendor/pixel-snapper/pkg/`. Takes ~30-60s on first run. See [backend/PIXEL_SNAPPER.md](backend/PIXEL_SNAPPER.md) for details.

### 3. Backend env

```bash
cd backend
cp .env.example .env
```

Fill in `.env`:

```env
PORT=3000
DATABASE_URL=mongodb://localhost:27017/questflow
JWT_SECRET=<any long random string>
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_EXPIRES_IN=30d

# Image generation
COMFYUI_ENDPOINT=http://127.0.0.1:8188

# Job queues
REDIS_URL=redis://localhost:6379

# AWS (S3 for sprite storage, Bedrock for quest generation)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=
AWS_BEDROCK_REGION=us-east-1

# Google OAuth (optional — skip for local dev without OAuth)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
FRONTEND_URL=http://localhost:5173

# Gemini (used for quest generation fallback when Bedrock agents not configured)
GEMINI_API_KEY=

# MinIO (optional — alternative to AWS S3 for local dev)
MINIO_ENDPOINT=
```

### 4. Frontend env

```bash
cd frontend
cp .env.example .env
```

`.env` just needs:
```env
VITE_API_URL=http://localhost:3000
```

### 5. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && pnpm install
```

---

## Running locally

You need four things running: **Redis**, **MongoDB**, **the API**, and **the worker**.

### Option A — services via Docker, code via npm/pnpm (recommended for dev)

Start Redis and MongoDB in Docker, run the Node processes directly so you get hot-reload:

```bash
# Terminal 1 — infrastructure
docker compose up redis mongo

# Terminal 2 — API server (hot reload)
cd backend && npm run dev

# Terminal 3 — BullMQ worker (hot reload)
cd backend && npm run worker

# Terminal 4 — Frontend (hot reload)
cd frontend && pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

### Option B — everything in Docker

Builds and runs the full stack including the WASM build step inside the container:

```bash
docker compose up --build
```

Frontend is not in the compose file — run it separately:
```bash
cd frontend && pnpm dev
```

> The Docker build compiles the WASM in a Rust stage so you don't need Rust on the host. The first build takes a few minutes; subsequent builds are cached.

---

## ComfyUI (sprite generation)

Sprite generation requires a running ComfyUI instance with specific models installed. Without it the API and frontend work fine — sprite jobs will be enqueued but fail when they try to reach ComfyUI.

**Required models** — drop these into ComfyUI's `models/` folders:

```
models/checkpoints/
  sd_xl_base_1.0.safetensors
  pixelArtDiffusionXL.safetensors
  animagineXL_v3.safetensors
  juggernautXL_v9.safetensors

models/loras/
  cb-000006.safetensors
  dmd2_sdxl_4step_lora.safetensors
```

**Required custom nodes** — install via ComfyUI Manager:
- `ComfyUI-Easy-Use` — provides the `easy imageRemBg` background-removal node
- `rgthree-comfy` — provides `Power Lora Loader (rgthree)` for multi-LoRA stacking

Set `COMFYUI_ENDPOINT=http://127.0.0.1:8188` in `backend/.env`.

---

## Key URLs (local dev)

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| API docs (Swagger) | http://localhost:3000/api-docs |
| Redis | localhost:6379 |
| MongoDB | localhost:27017 |
| ComfyUI | http://localhost:8188 |
