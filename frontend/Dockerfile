# ─── Stage 1: Build the SPA ─────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Vite substitutes its build-time variables into the source, so this value is
# frozen into the emitted bundle and a running container cannot change it.
# "/api" is what keeps the image portable: the browser calls its own origin and
# the edge proxy (see ../Caddyfile) routes /api to the backend. Override the
# build arg only if you serve the API from a different origin, and accept that
# the image is then pinned to that host.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Copied path by path rather than `COPY . .`: Vite inlines every VITE_* variable
# it can see at build time, so the context is kept to exactly the build inputs.
COPY tsconfig.json vite.config.ts postcss.config.mjs index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

# ─── Stage 2: Serve ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Unprivileged port, so the container has no reason to run with NET_BIND_SERVICE.
EXPOSE 8080

# The base image's entrypoint already launches nginx in the foreground.
