# ─── Stage 1: Build WASM ────────────────────────────────────────────────────
FROM rust:1.85-slim AS wasm-builder

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

WORKDIR /build
COPY vendor/pixel-snapper ./vendor/pixel-snapper

RUN cd vendor/pixel-snapper && \
    wasm-pack build --target nodejs --out-dir pkg --release

# ─── Stage 2: Node app ──────────────────────────────────────────────────────
FROM node:22-slim AS runner

# sharp needs these native libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=wasm-builder /build/vendor/pixel-snapper/pkg ./vendor/pixel-snapper/pkg

COPY src ./src
COPY tsconfig.json ./

RUN npm install -g tsx

EXPOSE 3000

CMD ["tsx", "src/app.ts"]
