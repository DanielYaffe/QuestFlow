# RAG Foundation (Part 1) — Implementation Summary & Runbook

Implemented July 2026 on the `RAG` branch. This is the delivered counterpart of
`quest-gen-rag-plan.md` (Part 1). Generation does **not** consume the KB yet — that is
Part 2 (`quest-gen-rag-part2-integration.md`).

**Verified end-to-end** against the production Qdrant (`https://qdrant.bobber.dev`):
register → create Game → ingest lore → worker embeds → status `ready` → semantic
search returns the right chunk (score ≈ 0.62) → empty types return `[]` (no error) →
deleting the Game wipes its Qdrant collections and registry rows.

---

## What was built

### 1. Provider-swappable AI layer (replaces `@google/genai` for text)

| File | Purpose |
|------|---------|
| `backend/src/config/ai.ts` | Provider table (gemini / openai / anthropic / groq / ollama) + pinned embedding config |
| `backend/src/services/ai.ts` | `complete()` (drop-in for the old `callGemini`), `embed()`, `embedBatch()` (auto-splits into batches of 100) |

- All **five** former Gemini text call sites now route through `complete()`:
  `questGenerationController` (objectives / characters / questline graph),
  `questAiEditController`, and `templateAnalysisService`. The duplicate helpers
  (`services/generation/agents/geminiClient.ts`, `utils/gemini.ts`) are deleted.
- Default is `AI_PROVIDER=gemini` via Gemini's OpenAI-compatible endpoint with the
  existing `GEMINI_API_KEY` — behavior-preserving; switching provider is config-only.
- `@google/genai` **stays** for one thing: quest-style thumbnail image generation
  (`questStyleModel.ts`, `gemini-2.5-flash-image`) — image output isn't covered by the
  OpenAI-compat endpoint.
- **Embeddings are pinned**: `gemini-embedding-001` @ 1536 dims. Changing
  `EMBED_MODEL`/`EMBED_DIMENSIONS` after ingesting invalidates every stored vector.

### 2. Vector store + KB pipeline

| File | Purpose |
|------|---------|
| `backend/src/services/qdrant.ts` | Qdrant client (URL-derived port — works behind an https proxy), per-Game collection naming `kb_{gameId}_{type}`, create/delete helpers |
| `backend/src/services/chunk.ts` | Word chunking (400 words, 60 overlap) — unit-tested |
| `backend/src/services/kbService.ts` | Document lifecycle: ingest (enqueue), edit routing (text change → re-embed job; title/metadata → instant), retry, delete |
| `backend/src/services/ragService.ts` | `retrieve()` — status-gated semantic search; missing collection ⇒ `[]` |
| `backend/src/services/gameService.ts` | Game CRUD + full KB wipe + link cleanup |
| `backend/src/queues/kbQueue.ts` | `kb-ingest` BullMQ queue |
| `backend/src/workers/kbWorker.ts` | Chunk → embed → upsert → flip `ready`; reconciler (repeatable, every 5 min) |

**Consistency model** (Mongo is source of truth, Qdrant is the retrieval copy):
- Docs are created `pending`, flipped `ready` only after a successful upsert.
  Retrieval only serves chunks whose doc is `ready` — half-written data never
  reaches generation.
- Failed ingestions are kept (`status: failed` + `statusError`) so the user can
  retry (`POST .../retry`); the reconciler purges their orphaned vectors but never
  deletes the row. Stuck `pending` docs (>15 min) are swept entirely.
- The worker re-checks the doc still exists after upserting and removes its own
  points if it was deleted mid-embed.

### 3. Models & API

- New models: `Game` (KB owner/namespace), `KbDocument` (registry + full original text).
- `Project.gameId` / `Questline.gameId` (optional links; questline overrides project;
  set via the existing PUTs, ownership-checked). Resolution for Part 2:
  `questline.gameId || project.gameId`; unset ⇒ ungrounded generation, as today.
- New routes (all authenticated + ownership-checked + zod-validated), mounted at `/games`:

| Method | Route | Notes |
|--------|-------|-------|
| POST/GET | `/games` | create / list |
| GET/PUT/DELETE | `/games/:gameId` | delete also wipes the whole vector KB |
| POST | `/games/:gameId/kb/ingest` | `{type, title, text[, metadata]}` → **202 + docId** |
| GET | `/games/:gameId/kb/documents` | registry list (no text) |
| GET/PUT/DELETE | `/games/:gameId/kb/documents/:docId` | GET includes `originalText`; PUT re-embeds only if text changed |
| POST | `/games/:gameId/kb/documents/:docId/retry` | re-run a `failed` ingestion |
| GET | `/games/:gameId/kb/search?q=&type=&topK=` | test search (`type` ∈ monsters, maps, items, general) |

> **KB categories (changed July 2026):** the original `lore | quests | characters |
> dialogue` types were replaced by `monsters | maps | items | general` (default:
> `general`). `KB_TYPES` in `backend/src/services/qdrant.ts` is the single source of
> truth — the Mongoose enum, queue typing and zod schemas all derive from it. New types
> mean new `kb_{gameId}_{type}` collections; no migration was needed (Qdrant was empty).

---

## Environment variables (`backend/.env`)

```bash
# Generation (swappable; default keeps Gemini behavior)
AI_PROVIDER=gemini                      # gemini | openai | anthropic | groq | ollama
GEN_MODEL=gemini-2.5-flash-lite
GEMINI_API_KEY=...                      # AI Studio key — used for gen AND embeddings

# Embeddings (PINNED — never change after ingesting)
EMBED_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
EMBED_API_KEY=                          # empty ⇒ falls back to GEMINI_API_KEY
EMBED_MODEL=gemini-embedding-001
EMBED_DIMENSIONS=1536

# Qdrant
QDRANT_URL=https://qdrant.bobber.dev    # https ⇒ port 443 automatically; or http://localhost:6333 for dev
QDRANT_API_KEY=...                      # must match the server's QDRANT__SERVICE__API_KEY
```

## Running it

```bash
# 1. Infra — local dev uses docker compose (repo root): mongo, redis, qdrant
docker compose up -d mongo redis qdrant     # or use the remote services in .env

# 2. Backend API
cd backend && npm run dev                   # port 3000

# 3. Worker — REQUIRED for ingestion (jobs stay 'pending' without it)
cd backend && npm run worker

# Sanity check any time (embedding round-trip + Qdrant connectivity):
cd backend && npx tsx src/scripts/ragSmokeTest.ts
```

Quick API tour (get `TOKEN` from `POST /auth/login`):

```bash
curl -X POST localhost:3000/games -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"My World"}'
curl -X POST localhost:3000/games/$GAME_ID/kb/ingest -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"general","title":"Region guide","text":"..."}'       # → 202 {docId}
curl "localhost:3000/games/$GAME_ID/kb/documents" -H "Authorization: Bearer $TOKEN"   # wait for status:"ready"
curl "localhost:3000/games/$GAME_ID/kb/search?q=who+guards+the+bridge&type=general" \
  -H "Authorization: Bearer $TOKEN"
```

## Server deployment (vector DB)

`deploy/docker-compose.qdrant.yml` — standalone Qdrant behind Caddy with automatic
Let's Encrypt TLS. Live at `https://qdrant.bobber.dev`. Full instructions are in the
file header; the short version:

1. DNS A record → server IP; open TCP 80 + 443 (cloud rule **and** OS iptables — OCI
   needs both).
2. `.env` next to the file: `QDRANT_DOMAIN=...`, `QDRANT_API_KEY=$(openssl rand -hex 32)`.
3. `docker compose -f docker-compose.qdrant.yml up -d` (project name is pinned to
   `questflow-qdrant`, so it won't merge into another stack's network).
4. Qdrant's own port is bound to the server's localhost only; keep 6333 closed in the
   firewall — everything external goes through Caddy on 443.

## Operational notes

- **Redis eviction policy**: BullMQ warns that the server Redis runs `allkeys-lru`;
  it should be `noeviction` (`CONFIG SET maxmemory-policy noeviction` + persist in
  redis config), otherwise Redis may evict queued jobs under memory pressure.
- **Redis/Mongo exposure**: both are currently reachable on public ports with
  password auth. Preferably restrict them (firewall to known IPs, private network,
  or Tailscale) — Redis especially is heavily scanned.
- Deleting the embedding model's stored vectors is unrecoverable — the reconciler
  and delete paths always remove Qdrant chunks *before* Mongo rows (a dangling
  Mongo row is recoverable; orphaned vectors are not referenced by anything).
- Known cosmetic issue: 2 pre-existing `questExport` snapshot-test failures
  (chapters render empty) — unrelated to this work, fail on `main` too.

## Frontend — Games & Knowledge Base UI

New "Games" section in the top nav (routes `#/games`, `#/games/:gameId`,
`#/games/:gameId/docs/new`, `#/games/:gameId/docs/:docId`, `#/games/:gameId/playground`):

| File | Purpose |
|------|---------|
| `frontend/src/app/api/gameApi.ts` | Typed API layer for all `/games` endpoints |
| `frontend/src/app/pages/Games/Games.tsx` | Games browser — card grid with doc counts, create/edit/delete |
| `frontend/src/app/pages/Games/GameDetail.tsx` | Per-game KB manager: document registry with live status |
| `frontend/src/app/pages/Games/KbDocumentEditor.tsx` | Full-page add/edit document — drag-drop or paste a `.txt`/`.md`/`.json` (read client-side, no upload endpoint), with per-category format help + insertable templates |
| `frontend/src/app/pages/Games/KbPlayground.tsx` | Playground: one query searches all categories in parallel → scored chunks per category (exactly what generation would receive) + session query history |
| `frontend/src/app/pages/Games/kbContent.ts` | Shared category labels/badges + the recommended-shape templates |

(The original `KbDocumentDialog.tsx` modal and `KbTestSearch.tsx` sidebar panel were
replaced by the two full-page flows above in July 2026.)

Details worth knowing:
- Document rows show live indexing state — **Indexing…** (auto-polls every 3 s while
  anything is pending), **Ready** with chunk count, or **Failed** with the error and a
  one-click retry.
- Editing a document's text re-indexes it in the background; title-only edits are instant.
- `GET /games` returns `documentCount` per game (aggregated server-side) for the cards.
- Verified end-to-end with a headless browser: login → create game → add document →
  watch it flip to Ready → search returns the right chunk with its score.

## What's next (Part 2)

See `quest-gen-rag-part2-integration.md`: structured collection files (`mobs.json`
etc.) exploded into per-entity entries, inferred progression scoring, reference-style
context assembly into the existing prompt builders (KB guides, never restricts), the
Games/KB management UI, and the KB selector in the quest-gen dialog.
