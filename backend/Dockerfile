# ─── Stage 1: Build WASM ────────────────────────────────────────────────────
FROM rust:1.85-slim AS wasm-builder

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

WORKDIR /build
COPY vendor/pixel-snapper ./vendor/pixel-snapper

RUN cd vendor/pixel-snapper && \
    wasm-pack build --target nodejs --out-dir pkg --release

# ─── Stage 2: Compile TypeScript + fetch model weights ──────────────────────
# Dev dependencies live only here, so tsc type-checks the whole app at build
# time and neither it nor tsx ends up in the shipped image.
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Background-removal weights, baked in rather than fetched on first use. The
# worker is what cuts backgrounds, and a container that pulls 168 MB from
# HuggingFace the first time someone generates a sprite is a hard dependency on
# HuggingFace being up at exactly the wrong moment. Same rule as the ComfyUI
# images. Placed before the source copy so the download layer stays cached.
COPY scripts ./scripts
RUN npm run fetch:rmbg

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ─── Stage 3: Runtime ───────────────────────────────────────────────────────
FROM node:22-slim AS runner

# sharp needs these native libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/vendor/rmbg ./vendor/rmbg
COPY --from=wasm-builder /build/vendor/pixel-snapper/pkg ./vendor/pixel-snapper/pkg

# RunPod model manifest. The bundled file is the fallback for when
# RUNPOD_MANIFEST_URL is unreachable; without it a bucket outage stops the
# backend from booting at all.
COPY config ./config

EXPOSE 3000

CMD ["node", "dist/app.js"]
