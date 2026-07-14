# Game Quest & Lore Generation Platform — Part 1: RAG Foundation

A RAG layer that lets users build shareable, per-**Game** knowledge bases and generate
quests, storyline lore, and character designs grounded in their own game content.

> **This plan is split into two parts.**
> - **Part 1 (this file) — RAG Foundation. Mandatory, build now.** The vector store, the
>   AI provider layer, the `Game` entity + KB ingestion/retrieval, cross-store consistency,
>   and the Game/KB CRUD API. It delivers the *capability* to store game data and retrieve
>   it — but does not yet rewrite the generation prompts or add UI.
> - **Part 2 — Integration & UX (`quest-gen-rag-part2-integration.md`). Not mandatory yet.**
>   Making quests/characters actually *use* the game data: redesigned, game-data-aware
>   prompts (real mobs, real drop tables, early/late-game progression tiers), character
>   creation aligned to the game world, the quest-gen dialog "attach Game KB" control, and
>   the new Game creation/editing page.
>
> The end goal (driving Part 2) is that generated quests reference **actual game entities**
> — real monsters and loot from the user's KB — with progression sense (early-game mobs
> drop early-game loot; bosses gate late-game rewards), and that characters fit the
> established world. Part 1 makes that retrievable and filterable (incl. a `tier`
> dimension); Part 2 makes the generator consume it.

> **Adjusted to the current QuestFlow stack (June 2026).** This revision aligns the
> original brainstorming plan with what the repo actually runs today. Three decisions
> drove the changes:
> 1. **AI layer** — replace the `@google/genai` (`callGemini`) layer with a single
>    **OpenAI-compatible, provider-swappable** layer that all generation flows through.
> 2. **Vector store** — **Qdrant**, self-hosted (no cloud-native store; Bedrock/S3-Vectors
>    is gone). Verified as the best fit for this workload — see §2.
> 3. **KB scope** — a new **`Game`** entity owns the KB; **Projects and Questlines
>    reference a `gameId`**, so multiple projects can share one knowledge base.
>
> See §9 for the migration notes (replacing the Gemini layer) and the stack-standard
> fixes (no `any`, controller→service→DB, `crypto.randomUUID`, BullMQ jobs).

---

## 1. Architecture Overview
  
```
┌──────────────────────────────────────────────────────────────────────┐
│                        Express 5 Backend (TS)                          │
│  Controllers → Services → DB   (never bypass — CLAUDE.md rule)         │
│                                                                        │
│   ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐     │
│   │  KB Service  │   │  RAG Service │   │  Generation (existing   │     │
│   │  (ingest /   │   │  (retrieve / │   │  quest/character flows, │     │
│   │   manage)    │   │   search)    │   │  now KB-grounded)       │     │
│   └──────┬───────┘   └──────┬───────┘   └───────────┬────────────┘     │
│          │                  │                       │                  │
│   ┌──────┴──────────────────┴───────────────────────┴───────────┐     │
│   │              AI Provider Layer  (services/ai.ts)             │     │
│   │   OpenAI-compatible SDK — one swap point for ALL gen +       │     │
│   │   embeddings. Replaces the old callGemini() helper.          │     │
│   └──────┬───────────────────────────────────────────┬──────────┘     │
└──────────┼──────────────────────────┬────────────────┼────────────────┘
           │                          │                │
   ┌───────┴────────┐        ┌────────┴────────┐  ┌────┴──────────────┐
   │     Qdrant     │        │     MongoDB     │  │  BullMQ + Redis    │
   │ (vectors, per- │        │ (Game, Project, │  │ (ingest/re-embed   │
   │  Game isolation)│        │  Questline,     │  │  jobs + reconciler)│
   │                │        │  Character,     │  │  reuses existing   │
   │                │        │  KbDocument)    │  │  queue infra       │
   └────────────────┘        └─────────────────┘  └────────────────────┘
```

### Responsibility split

| Store | Holds |
|-------|-------|
| **MongoDB** (existing) | Users, Games (KB owners), Projects, Questlines, Characters, generation history, **KbDocument registry incl. full original text** |
| **Qdrant** (new container) | Vector embeddings + a lean retrieval copy of each chunk — isolated per **Game** |
| **BullMQ + Redis** (existing) | Async ingest / re-embed jobs and the reconciler sweep (matches the sprite/quest worker pattern) |
| **AI Provider Layer** | Generation + embeddings via one OpenAI-compatible SDK (swappable provider) |

---

## 2. Key Decisions (locked)

1. **Self-developed RAG** — full control, no lock-in, no minimum cloud cost.

2. **Vector store = Qdrant, self-hosted via Docker.** Re-evaluated against the
   self-hosted field (Milvus, Weaviate, Chroma, pgvector, Redis vector, LanceDB) for
   *this* workload and confirmed:
   - The workload is **filter-heavy** (per-Game isolation + `region`/`faction`/`difficulty`
     metadata filters). Qdrant's payload filtering is its standout strength, with the
     lowest p50 latency (~4 ms) among dedicated stores.
   - **First-class TypeScript client** (`@qdrant/js-client-rest`).
   - Backend and worker are **separate processes** → both hit one Qdrant over HTTP.
     That rules out embedded stores (LanceDB / local Chroma) and undercuts "reuse
     Redis" (your compose runs `redis:7-alpine` with no vector module, and you don't
     want vector load on the BullMQ broker).
   - Not billion-scale (Milvus is overkill); not a throwaway prototype (Chroma is too light).
   - Managed Qdrant Cloud remains a drop-in later if scale demands it.

3. **OpenAI-compatible SDK for all AI calls** — generation provider is a single config
   swap (Gemini-compat / OpenAI / Anthropic-compat / Groq / Ollama). **This replaces the
   current `@google/genai` layer** (see §9). Default provider points at Gemini's
   OpenAI-compatible endpoint, so behavior and the existing `GEMINI_API_KEY` are
   preserved while the SDK becomes swappable.

4. **Embeddings decoupled from generation** — pinned to one model + dimension count
   (changing it forces a full re-embed); generation freely swappable.

5. **KB owner = a new `Game` entity; Projects/Questlines reference it.** A `Game` holds
   one knowledge base. `Project.gameId` and `Questline.gameId` are optional links, so
   **many projects can share the same KB**. Generation resolves the effective KB as
   `questline.gameId ?? project.gameId` (no link → ungrounded generation still works).

6. **Complete per-Game isolation** — one set of Qdrant collections per `gameId`. No
   shared collections; deleting a Game is a few `deleteCollection` calls.

7. **Storage = Pattern C (hybrid).** Full original document lives in MongoDB (source of
   truth — enables editing + re-embedding); lean chunk copies live in the Qdrant payload
   (retrieval is a single call). A shared `docId` (the `KbDocument._id`) links them.

8. **KB is editable.** Text edits = replace-under-same-`docId` (delete old chunks,
   re-chunk, re-embed, re-insert). Metadata/tag edits = fast Qdrant payload update, no
   re-embed. The user sees one "Save"; the backend picks the cheap path when it can.

9. **Ingestion runs as a BullMQ job**, not inline in the request — chunking + embedding a
   large doc is slow and belongs off the request path, exactly like the existing
   sprite/quest workers. The reconciler is a BullMQ **repeatable** job.

### Isolation model

Each Game gets its own dedicated collections, keyed by the Game's Mongo `_id`:

```
kb_{gameId}_lore
kb_{gameId}_quests
kb_{gameId}_characters
kb_{gameId}_dialogue
```

`gameId` is the stable `Game._id` string — no separate slug field needed.

---

## 3. Tech Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Runtime | Node 20 + TypeScript 5 | existing |
| Web framework | Express 5 | existing |
| Primary DB | MongoDB + Mongoose 9 (self-hosted `mongo:7`) | existing |
| Jobs / queue | BullMQ + Redis (`ioredis`) | existing — reuse for ingest/reconcile |
| Vector DB | **Qdrant** (`@qdrant/js-client-rest`), self-hosted Docker | **new** |
| AI SDK | **`openai`** (provider-swappable, OpenAI-compatible) | **new — replaces `@google/genai`** |
| Generation model | Gemini-compat default (`gemini-2.5-flash-lite`), swappable | migrated |
| Embeddings | Pinned via env (`gemini-embedding-001` default; or OpenAI / Ollama) | **new** |
| Validation | `zod` 4 | existing |
| File upload | `multer` — **only if** a file-upload UI is wanted (raw-text ingest needs none) | optional |
| IDs | `crypto.randomUUID()` (Node 20 built-in) for Qdrant point ids; Mongo `_id` for `docId` | no new dep |
| Object storage | AWS S3 / MinIO (`@aws-sdk/client-s3`) | existing — unrelated to RAG |

> **Dropped from the original plan:** the `openai`-vs-Anthropic-vs-Groq framing stays,
> but `uuid` and a hard `multer` dependency are gone. Node 20's `crypto.randomUUID()`
> covers point ids, and `docId` is just the `KbDocument._id`.

---

## 4. Data Models

### MongoDB — `Game` (new — the KB owner / namespace)

```ts
// src/models/gameModel.ts
interface IGame {
  _id: ObjectId;            // ← the Qdrant namespace key (gameId)
  ownerId: string;          // matches Project.ownerId (stored as String in this repo)
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### MongoDB — `Project` / `Questline` (add a link field to each)

```ts
// projectModel.ts  — ADD:
gameId?: string;            // optional KB this project draws on (shared across projects)

// questlineModel.ts — ADD:
gameId?: string;            // optional per-questline override; falls back to project's
```

> Resolution helper (service layer): `effectiveGameId = questline.gameId || project.gameId`.
> No link → generation runs ungrounded (fully backward-compatible with today's flows).

### MongoDB — `KbDocument` (new — registry + source of truth)

```ts
// src/models/kbDocumentModel.ts
type DocStatus = 'pending' | 'ready' | 'failed';   // retrieval gate — only 'ready' is live

interface IKbDocument {
  _id: ObjectId;            // this IS the docId (no uuid needed)
  gameId: string;           // owning Game KB
  type: 'lore' | 'quests' | 'characters' | 'dialogue';
  title: string;
  sourceFilename?: string;
  originalText: string;     // ← FULL uncut source. Enables edit + re-embed.
  chunkCount: number;
  pointIds: string[];       // Qdrant point ids (crypto.randomUUID) for this doc
  metadata: Record<string, unknown>;  // region, faction, difficulty, etc.
  status: DocStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

### MongoDB — Generation history (optional, lightweight)

```ts
interface IGeneration {
  _id: ObjectId;
  gameId?: string;
  projectId: string;
  questlineId?: string;
  kind: 'quest' | 'lore' | 'character';
  prompt: string;
  retrievedDocIds: string[];
  provider: string;
  model: string;
  createdAt: Date;
}
```

### Qdrant — Point payload (lean retrieval copy, Pattern C)

```ts
interface ChunkPayload {
  text: string;
  gameId: string;
  docId: string;           // ref back to the canonical KbDocument._id in MongoDB
  type: string;            // lore | quests | characters | dialogue
  chunkIndex: number;
}
```

> Part 1 keeps the payload minimal. The full `metadata` blob is an opaque
> `Record<string, unknown>` on the MongoDB `KbDocument`. Part 2 denormalizes whichever
> real game-data fields it filters on into the payload (and indexes them) once your
> schema is known — no field names are assumed here.

---

## 5. Core Modules (TypeScript)

> **Style rules enforced (CLAUDE.md):** no `any` — payloads are read through type
> guards; routes call **services**, services touch the DB. Heavy work runs in a worker.

### 5.1 AI config — env via the central `config`, provider in `config/ai.ts`

**Repo standard: never read `process.env` directly.** All new vars are registered on the
existing zod-validated `config` object (`src/config/config.ts`) and read through it.

```ts
// src/config/config.ts — add to envSchema (GEMINI_API_KEY already exists)
AI_PROVIDER: z.enum(['gemini', 'openai', 'anthropic', 'groq', 'ollama']).default('gemini'),
GEN_MODEL:   z.string().default('gemini-2.5-flash-lite'),
OPENAI_API_KEY:    z.string().default(''),
ANTHROPIC_API_KEY: z.string().default(''),
GROQ_API_KEY:      z.string().default(''),

// Embeddings — PINNED (changing these after ingest invalidates every stored vector)
EMBED_BASE_URL:   z.string().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
EMBED_API_KEY:    z.string().default(''),          // falls back to GEMINI_API_KEY in ai.ts
EMBED_MODEL:      z.string().default('gemini-embedding-001'),
EMBED_DIMENSIONS: z.coerce.number().default(1536),

// Qdrant
QDRANT_URL:     z.string().default('http://localhost:6333'),
QDRANT_API_KEY: z.string().default(''),
```

```ts
// src/config/ai.ts — reads from config, NOT process.env
import { config } from './config';

interface ProviderConfig { baseURL: string; apiKey: string; model: string; }

// Generation provider — swap via config.AI_PROVIDER. Default keeps Gemini (existing key
// + model) but through its OpenAI-compatible endpoint, so the SDK is now swappable.
// One shared GEN_MODEL: set it when you change AI_PROVIDER.
const GEN_PROVIDERS: Record<string, ProviderConfig> = {
  gemini:    { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: config.GEMINI_API_KEY,    model: config.GEN_MODEL },
  openai:    { baseURL: 'https://api.openai.com/v1',                                 apiKey: config.OPENAI_API_KEY,    model: config.GEN_MODEL },
  anthropic: { baseURL: 'https://api.anthropic.com/v1/',                             apiKey: config.ANTHROPIC_API_KEY, model: config.GEN_MODEL }, // compat endpoint (beta)
  groq:      { baseURL: 'https://api.groq.com/openai/v1',                            apiKey: config.GROQ_API_KEY,      model: config.GEN_MODEL },
  ollama:    { baseURL: 'http://localhost:11434/v1',                                 apiKey: 'ollama',                 model: config.GEN_MODEL },
};

export const genProvider = GEN_PROVIDERS[config.AI_PROVIDER];

// Embeddings — PINNED. Do NOT change after ingesting (invalidates every stored vector).
export interface EmbedConfig extends ProviderConfig { dimensions: number; }
export const embedProvider: EmbedConfig = {
  baseURL: config.EMBED_BASE_URL,
  apiKey: config.EMBED_API_KEY || config.GEMINI_API_KEY,
  model: config.EMBED_MODEL,
  dimensions: config.EMBED_DIMENSIONS,
};
```

> **Embedding-dimension note:** `gemini-embedding-001` and OpenAI `text-embedding-3-*`
> accept a `dimensions` request param (MRL truncation). Whatever you request **must
> equal** `EMBED_DIMENSIONS` **and** the Qdrant collection `size`. If a provider rejects
> `dimensions`, drop the param and set `EMBED_DIMENSIONS` to that model's native size.

### 5.2 AI clients — `src/services/ai.ts` (replaces `geminiClient.ts`)

```ts
import OpenAI from 'openai';
import { genProvider, embedProvider } from '../config/ai';

const genClient   = new OpenAI({ apiKey: genProvider.apiKey,   baseURL: genProvider.baseURL });
const embedClient = new OpenAI({ apiKey: embedProvider.apiKey, baseURL: embedProvider.baseURL });

const stripFences = (s: string) =>
  s.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

/** Drop-in replacement for the old callGemini(prompt): single-turn, fences stripped. */
export async function complete(prompt: string): Promise<string> {
  const res = await genClient.chat.completions.create({
    model: genProvider.model,
    messages: [{ role: 'user', content: prompt }],
  });
  return stripFences(res.choices[0]?.message?.content ?? '');
}

export async function embed(text: string): Promise<number[]> {
  const res = await embedClient.embeddings.create({
    model: embedProvider.model, input: text, dimensions: embedProvider.dimensions,
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await embedClient.embeddings.create({
    model: embedProvider.model, input: texts, dimensions: embedProvider.dimensions,
  });
  return res.data.map((d) => d.embedding);
}

export function getGenClient() { return { client: genClient, model: genProvider.model }; }
```

### 5.3 Qdrant service — `src/services/qdrant.ts`

```ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/config';
import { embedProvider } from '../config/ai';

const qdrant = new QdrantClient({
  url: config.QDRANT_URL,
  apiKey: config.QDRANT_API_KEY || undefined,
});

export type KbType = 'lore' | 'quests' | 'characters' | 'dialogue';
export const KB_TYPES: KbType[] = ['lore', 'quests', 'characters', 'dialogue'];

// Namespace helper — single source of truth for per-Game isolation.
export function collectionName(gameId: string, type: KbType): string {
  return `kb_${gameId}_${type}`;
}

export async function ensureCollection(gameId: string, type: KbType): Promise<string> {
  const name = collectionName(gameId, type);
  const { collections } = await qdrant.getCollections();
  if (!collections.some((c) => c.name === name)) {
    await qdrant.createCollection(name, {
      vectors: { size: embedProvider.dimensions, distance: 'Cosine' },
    });
    // docId is the only field Part 1 filters on (delete / re-embed by document).
    await qdrant.createPayloadIndex(name, { field_name: 'docId', field_schema: 'keyword' });
  }
  return name;
}

// Delete an entire Game's KB (complete isolation cleanup).
export async function deleteGameKb(gameId: string): Promise<void> {
  for (const type of KB_TYPES) {
    await qdrant.deleteCollection(collectionName(gameId, type)).catch(() => { /* may not exist */ });
  }
}

export { qdrant };
```

### 5.4 Chunking — `src/services/chunk.ts`

```ts
// Word-based chunking with overlap. Tune per content density; consider token-aware
// chunking later if you mix very long lore docs with short character sheets.
export function chunkText(text: string, chunkSize = 400, overlap = 60): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ').trim();
    if (chunk) chunks.push(chunk);
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}
```

### 5.5 KB service — `src/services/kbService.ts`

Controllers call this; it owns both stores. Ingest/re-embed **enqueue a job** (§5.7);
the synchronous parts here are the cheap ones (create the pending registry row,
metadata-only updates, deletes).

```ts
import { qdrant, collectionName, KbType } from './qdrant';
import { embedBatch } from './ai';
import { chunkText } from './chunk';
import KbDocumentModel from '../models/kbDocumentModel';

export async function buildPoints(text: string, gameId: string, docId: string, type: KbType) {
  const chunks = chunkText(text);
  const vectors = await embedBatch(chunks);
  const points = chunks.map((chunk, i) => ({
    id: crypto.randomUUID(),
    vector: vectors[i],
    payload: { text: chunk, gameId, docId, type, chunkIndex: i },
  }));
  return { points, chunkCount: chunks.length };
}

// Tags-only edit (text unchanged): Mongo-only — Part 1's payload carries no user metadata.
export async function updateDocumentMetadata(docId: string, metadata: Record<string, unknown>) {
  await KbDocumentModel.updateOne({ _id: docId }, { $set: { metadata, updatedAt: new Date() } });
}

// Delete chunks before the registry row (safe direction).
export async function deleteDocument(gameId: string, type: KbType, docId: string) {
  await KbDocumentModel.updateOne({ _id: docId }, { $set: { status: 'pending' } });
  await qdrant.delete(collectionName(gameId, type), {
    filter: { must: [{ key: 'docId', match: { value: docId } }] }, wait: true,
  });
  await KbDocumentModel.deleteOne({ _id: docId });
}

export async function deleteGameDocuments(gameId: string) {
  await KbDocumentModel.deleteMany({ gameId });   // Qdrant side handled by deleteGameKb
}
```

### 5.6 RAG retrieval — `src/services/ragService.ts`

```ts
import { qdrant, collectionName, KbType } from './qdrant';
import { embed } from './ai';
import KbDocumentModel from '../models/kbDocumentModel';

interface RetrieveOptions {
  gameId: string; type: KbType; query: string;
  topK?: number; filter?: Record<string, unknown>; scoreThreshold?: number;
}

// Type guards — no `any` (CLAUDE.md).
function field<T>(payload: unknown, key: string, is: (v: unknown) => v is T): T | undefined {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    return is(v) ? v : undefined;
  }
  return undefined;
}
const isStr = (v: unknown): v is string => typeof v === 'string';

export async function retrieve(opts: RetrieveOptions) {
  const { gameId, type, query, topK = 5, filter, scoreThreshold = 0.5 } = opts;
  const queryVector = await embed(query);

  // Over-fetch so the status-gate filter still leaves enough results.
  const results = await qdrant.search(collectionName(gameId, type), {
    vector: queryVector, limit: topK * 2, with_payload: true,
    score_threshold: scoreThreshold,
    filter: filter as Parameters<typeof qdrant.search>[1]['filter'],
  });

  // Status gate (the linchpin): only chunks whose doc is 'ready' may be used.
  const docIds = [...new Set(results.map((r) => field(r.payload, 'docId', isStr)).filter(isStr))];
  const ready = new Set(
    (await KbDocumentModel.find({ _id: { $in: docIds }, status: 'ready' }, { _id: 1 }).lean())
      .map((d) => String(d._id)),
  );

  return results
    .filter((r) => { const id = field(r.payload, 'docId', isStr); return id !== undefined && ready.has(id); })
    .slice(0, topK)
    .map((r) => ({
      text: field(r.payload, 'text', isStr) ?? '',
      score: r.score,
      docId: field(r.payload, 'docId', isStr),
    }));
}
```

### 5.7 Ingest / re-embed as a BullMQ job

Aligns with the existing sprite/quest workers. The controller enqueues; the worker does
chunk + embed + upsert, then flips `status: 'ready'`.

```ts
// src/queues/kbQueue.ts
import { Queue } from 'bullmq';
import { redis } from './connection';

export interface KbIngestJobData {
  docId: string;            // KbDocument._id
  gameId: string;
  type: 'lore' | 'quests' | 'characters' | 'dialogue';
  mode: 'ingest' | 'reembed';
}

export const kbQueue = new Queue<KbIngestJobData>('kb-ingest', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail: { age: 86_400 },
  },
});
```

```ts
// src/workers/kbWorker.ts   (import this from src/worker.ts alongside spriteWorker)
import { Worker, Job } from 'bullmq';
import { redis } from '../queues/connection';
import { KbIngestJobData } from '../queues/kbQueue';
import { qdrant, ensureCollection, collectionName } from '../services/qdrant';
import { buildPoints } from '../services/kbService';
import KbDocumentModel from '../models/kbDocumentModel';

async function process(job: Job<KbIngestJobData>) {
  const { docId, gameId, type, mode } = job.data;
  const doc = await KbDocumentModel.findById(docId);
  if (!doc) return;                                   // deleted before processing — drop

  const collection = await ensureCollection(gameId, type);
  if (mode === 'reembed') {
    await qdrant.delete(collection, {
      filter: { must: [{ key: 'docId', match: { value: docId } }] }, wait: true,
    });
  }
  const { points, chunkCount } = await buildPoints(doc.originalText, gameId, docId, type);
  await qdrant.upsert(collection, { points, wait: true });
  await KbDocumentModel.updateOne({ _id: docId }, { $set: {
    status: 'ready', chunkCount, pointIds: points.map((p) => p.id), updatedAt: new Date(),
  }});
}

new Worker<KbIngestJobData>('kb-ingest', async (job) => {
  try { await process(job); }
  catch (err) {
    // Last attempt failed → mark 'failed'; the reconciler will clean it up.
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await KbDocumentModel.updateOne({ _id: job.data.docId }, { $set: { status: 'failed' } });
    }
    throw err;
  }
}, { connection: redis });
```

### 5.8 Generation grounding → Part 2

Part 1 stops at the retrieval capability (`retrieve()` above). Actually *consuming* it —
assembling retrieved chunks into a context block, wiring that into the existing
quest/character prompts, and the game-data-aware prompt redesign (real mobs, real drops,
progression tiers) — is **Part 2** (`quest-gen-rag-part2-integration.md`), because it
depends on your real game-data schema. The only generation change in Part 1 is the
behavior-preserving AI-layer swap (`callGemini` → `complete`, §5.2 / §9).

---

## 6. Cross-store consistency (saga / compensation)

Qdrant and MongoDB don't share a transaction, so we make every write **safe under
failure**. Strategy: **Mongo-first, with a `status` gate**, and the embed work in a job
that retries.

```
INGEST:
  1. Service creates Mongo KbDocument { status: 'pending' }   ← claims docId, invisible to retrieval
  2. Service enqueues a kb-ingest job, returns 202 + docId
  3. Worker: ensureCollection → chunk → embed → upsert (wait: true)
  4. Worker: update KbDocument { status: 'ready', pointIds, chunkCount }
  5. Job fails all attempts → status 'failed'; reconciler sweeps it
```

**Two things make this safe:**

**(a) Retrieval filters on `status: 'ready'`** — the linchpin (already wired into
`retrieve` in §5.6). A pending/failed doc's chunks are never used, even if they briefly
exist. Over-fetch (`limit: topK * 2`) so gating still leaves enough results.

**(b) A reconciler sweeps rare survivors** — as a BullMQ repeatable job (not raw
`setInterval`), consistent with the existing queue infra. **Two corrections vs. the
original draft** (implemented in `workers/kbWorker.ts`):

- **`failed` docs are NOT deleted.** Deleting them would destroy `originalText` and
  contradict Part 2's "surface failed documents for retry" UX. The reconciler purges a
  failed doc's orphaned chunks but keeps the Mongo row (`status: 'failed'` +
  `statusError`); the user retries via `POST .../documents/:docId/retry`.
- **Stuck-`pending` TTL is generous (15 min, not 5)** so a queue backlog isn't treated
  as a crash, and the worker re-checks the doc still exists *after* upserting — if the
  row vanished mid-embed (user delete or reconcile), the worker removes the points it
  just wrote instead of leaving unreferenced vectors.

**Failure-mode guarantees:**

| Scenario | Outcome |
|----------|---------|
| Embed/Qdrant write fails during ingest | Job retries; final failure → `status: 'failed'`, reconciler removes the pending row (no orphans) |
| Worker crashes mid-ingest | Stuck `pending`; reconciler removes chunks + row after 5 min |
| Re-embed fails mid-swap | Old chunks were already deleted, doc is `pending` → not retrieved; reconciler/retry resolves |
| Delete: Qdrant ok, Mongo fails | Chunks already gone (safe direction); row cleaned by reconciler |
| Anything `pending`/`failed` | **Never reaches generation** — the status gate guarantees it |

> **Edit edge case to watch:** re-embed deletes old chunks before writing new ones, so
> during that window the doc is briefly empty. The `status: 'pending'` flip hides it from
> retrieval throughout, so callers see the old-or-nothing, never a half-written mix.
> If you need zero-downtime edits later, write new chunks under a temp `docId`, then
> atomically swap the registry pointer.

---

## 7. API Surface

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/games` | Create a Game (KB owner) |
| `GET` | `/games` | List the user's Games |
| `GET` | `/games/:gameId` | Get one Game |
| `DELETE` | `/games/:gameId` | Delete Game + wipe its entire Qdrant KB + KbDocuments |
| `POST` | `/games/:gameId/kb/ingest` | Ingest raw text → **202 + docId** (async job) |
| `POST` | `/games/:gameId/kb/upload` | Upload `.txt`/`.md`/`.json` (multer — optional) |
| `GET` | `/games/:gameId/kb/documents` | List documents (from MongoDB) |
| `GET` | `/games/:gameId/kb/documents/:docId` | Get one doc incl. `originalText` (edit view) |
| `PUT` | `/games/:gameId/kb/documents/:docId` | Edit — text change re-embeds (job); tags-only is instant |
| `DELETE` | `/games/:gameId/kb/documents/:docId` | Delete a document + its chunks |
| `GET` | `/games/:gameId/kb/search` | Test search (lets users verify their KB) |
| `POST` | `/games/:gameId/kb/documents/:docId/retry` | Re-run ingestion of a `failed` document |
| `PUT` | `/projects/:projectId` | Set/clear `gameId` (link a Project to a KB) — repo uses PUT, not PATCH; linked game must be owned by the caller |
| `PUT` | `/questlines/:questlineId` | Set/clear `gameId` (per-questline KB override) — same ownership check |

Generation stays on the **existing** quest routes (`/quests/generate`,
`/quests/generate-characters`, `/quests/generate-questline`); they gain optional KB
grounding when the resolved Game has a ready KB. No new generate endpoint needed.

### Edit route — smart re-embed routing (controller → service)

```ts
// PUT /games/:gameId/kb/documents/:docId   (controller; ownership-checked upstream)
export async function editKbDocument(req: AuthRequest, res: Response) {
  const { gameId, docId } = req.params;
  const { type, title, text, metadata } = req.body as {
    type: KbType; title?: string; text?: string; metadata?: Record<string, unknown>;
  };

  const doc = await kbService.getDocument(gameId, docId);     // service, not model
  if (!doc) { res.status(404).json({ error: 'document not found' }); return; }

  const textChanged = typeof text === 'string' && text !== doc.originalText;

  if (textChanged) {
    await kbService.queueReembed(gameId, docId, type, text, metadata ?? doc.metadata); // 202-ish
  } else if (metadata) {
    await kbService.updateDocumentMetadata(docId, metadata);
  }
  if (title) await kbService.setTitle(docId, title);

  res.json({ success: true, reEmbedded: textChanged });
}
```

> Streaming (`generateContentStream` / OpenAI `stream: true`) is **optional polish**.
> Today's quest flow returns JSON in one shot and must parse it whole, so it stays
> non-streaming. Add SSE only for free-text lore generation if the UX wants it.

---

## 8. KB sharing & resolution model

This is the part that differs most from the original plan — KBs are **shared**, not
per-project-isolated.

```
User ──owns──▶ Game (holds ONE knowledge base, isolated in Qdrant by gameId)
                  ▲                ▲
                  │ gameId         │ gameId (optional override)
              Project ───────▶ Questline
```

- A **Game** is a reusable world/KB. One user can have several; one Game can back many Projects.
- **`Project.gameId`** links a project to a Game's KB. Set it once; every questline in
  that project inherits the grounding.
- **`Questline.gameId`** optionally overrides, so a single questline can pull from a
  different Game's KB (e.g. a crossover).
- **Resolution:** `effectiveGameId = questline.gameId ?? project.gameId`. Unset → the
  generation runs exactly as it does today (no grounding). Nothing breaks for existing
  projects that never adopt a Game.

User flow:

```
1. Create a Game                  → MongoDB Game record
2. Upload lore/quests/characters  → 202; chunked+embedded in a job → kb_{gameId}_{type};
                                     full text + registry row in MongoDB (Pattern C)
3. Link Game to one or more       → PATCH project(s)/questline(s) with gameId
   Projects / Questlines
4. List / open / edit documents   → registry + originalText from MongoDB
5. Test search                    → GET /kb/search returns scored matches
6. Generate (existing flows)      → effective Game's collections only, status: 'ready' gate
7. Delete the Game                → deleteGameKb wipes all collections + KbDocuments;
                                     null out gameId on any linking projects/questlines
```

---

## 9. Migration: replacing the Gemini layer + stack-standard fixes

These are net-new vs. the original plan and are required to land cleanly in this repo.

1. **Replace `services/generation/agents/geminiClient.ts`** with `services/ai.ts`
   (§5.2). `callGemini(prompt)` → `complete(prompt)` is a drop-in (same single-turn,
   same fence-stripping). **Five call sites, not three:** the three in
   `questGenerationController.ts` (`generateObjectives`, `generateCharacters`,
   `generateQuestline`), plus a duplicate `callGemini` helper in `utils/gemini.ts`
   used by `questAiEditController.ts`, plus the direct `GoogleGenAI` text call in
   `services/exportTemplates/templateAnalysisService.ts`. Delete both helpers.
2. **Keep behavior identical on day one** by defaulting `AI_PROVIDER=gemini` (the
   OpenAI-compat Gemini endpoint, same `GEMINI_API_KEY`, same `gemini-2.5-flash-lite`).
   The swap is then a config-only change, de-risked.
3. **Add `openai` + `@qdrant/js-client-rest`** to `backend/package.json`.
   **`@google/genai` cannot be removed:** `questStyleModel.ts` uses
   `gemini-2.5-flash-image` with `Modality.IMAGE` for thumbnail generation, which the
   OpenAI-compatible endpoint does not cover. It stays for image generation only; all
   *text* generation goes through `services/ai.ts`.
4. **Wire the new worker:** import `./workers/kbWorker` from `src/worker.ts` (next to
   `spriteWorker`), and register the reconciler repeatable job there too.
5. **No `any`:** the original plan's `as any` / `as never` payload casts are replaced by
   the type-guard helpers in §5.6.
6. **Controller→service→DB:** the original plan's routes called Mongo models directly;
   here routes call `kbService` / `ragService`, matching the CLAUDE.md rule. (Note: the
   existing `questGenerationController` reaches into models directly — out of scope to
   refactor now, but new KB code should not copy that.)
7. **Drop dead Bedrock leftovers:** `QuestJobData` in `queues/questQueue.ts` still has
   `agentId` / `agentAliasId` from the removed Bedrock path — delete them while you're in
   there.
8. **`crypto.randomUUID()`** for Qdrant point ids; `KbDocument._id` for `docId`. No
   `uuid` package. `multer` only if you build a file-upload UI.

---

## 10. Build Order (phased)

### Phase 0 — Infrastructure (½ day)
- Add **Qdrant** to `docker-compose.yml` (next to mongo/redis); add env vars.
- Smoke-test: Qdrant connection + one `embed()` round-trip through the new AI layer.

### Phase 1 — AI layer swap (1 day)
- Implement `config/ai.ts` + `services/ai.ts`; replace `callGemini` with `complete`.
- Verify the three existing quest-generation flows still pass with `AI_PROVIDER=gemini`.

### Phase 2 — Vector foundation (1 day)
- `services/qdrant.ts`, `services/chunk.ts`. Verify create / upsert / search with dummy data.

### Phase 3 — Game + KB ingestion (3 days)
- `gameModel`, `kbDocumentModel`; add `gameId` to Project + Questline.
- `kbService`, `kbQueue`, `kbWorker` (async ingest), reconciler repeatable job.
- Routes: create/list/delete Game; ingest, list, get-one, **edit**, delete document.
- Edit routing: text-changed → re-embed job; tags-only → instant Mongo update.
- Wire the `status: 'ready'` gate into `ragService.retrieve`.
- Verify per-Game isolation **and** failure safety (kill the worker mid-ingest; confirm
  the reconciler cleans it and no orphan chunks reach generation).

### Phase 4 — Retrieval capability + test search (1 day)
- `ragService.retrieve` (status-gated). Add the `/kb/search` test endpoint so you can
  confirm the KB returns sensible matches. **No prompt changes here** — consuming
  retrieval in generation is Part 2.

### Phase 5 — Polish (1–2 days)
- Score-threshold + chunk-size tuning for real content density.
- Rate limiting. (`zod` validation and ownership checks moved into Phase 3 — they are
  day-one requirements on every `/games` route, not polish.)

> **End of Part 1.** At this point you can create Games, ingest/edit/delete KB documents,
> and retrieve from them — but generation does not yet use the KB. That is **Part 2**.

### Optional later
- Hybrid search (Qdrant sparse vectors) if named-entity retrieval underperforms.
- Provider fallback (retry on a second provider on failure).
- Reranking pass for higher precision.
- Qdrant self-hosted → Qdrant Cloud when scaling.

---

## 11. Critical Gotchas

1. **Never change the embedding model/dimension after ingesting** — it invalidates every
   stored vector. Pin `EMBED_MODEL` + `EMBED_DIMENSIONS` and treat them as immutable.
2. **Embedding dimensions must match the collection `size`** *and* the `dimensions` you
   request from the provider — a mismatch throws on upsert.
3. **Always resolve `gameId` from an authenticated ownership check** — never trust a raw
   id from the request for collection naming, and verify a linked `gameId` belongs to the
   same user.
4. **Batch embeddings** (`embedBatch`) on ingest — far fewer round-trips than per-chunk.
   Cap each request at ~100 inputs (Gemini's OpenAI-compat endpoint limits batch size);
   `services/ai.ts` splits internally.
5. **Index payload fields you filter on** — Part 1 filters only on `docId`, so that's the
   only index. Add more in Part 2 when filtered retrieval needs them (no re-ingest required).
6. **Generation provider is swappable; embeddings are not** — keep the two configs separate.
7. **An edit with changed text is delete-by-`docId` + re-embed, never an in-place vector
   edit** — old chunks must be removed first or stale chunks pollute retrieval.
8. **Keep Qdrant and MongoDB in sync on every write** — the shared `docId` is what lets
   you reconcile them; the status gate + reconciler enforce it.
9. **`originalText` in MongoDB is the source of truth** — never reconstruct a doc by
   stitching chunks (overlap makes that lossy). Re-embeds read from `originalText`.
10. **The `status: 'ready'` retrieval gate is not optional** — it's the single guarantee
    that orphaned/half-written chunks never reach generation. Every retrieval path enforces it.
    Also: searching a collection that doesn't exist yet (a Game with no docs of that type)
    must return an empty result, not throw — `ragService.retrieve` guards this.
11. **Always delete chunks before the Mongo row** — the safe direction leaves a
    recoverable dangling row on failure, never unrecoverable orphaned chunks.
12. **The worker process needs its own Qdrant + Mongo connections** — `src/worker.ts`
    already connects Mongo; make sure it imports `kbWorker` and that Qdrant env vars are
    present in the worker container.
13. **Gemini-via-OpenAI-compat caveats** — the compat endpoint covers chat + embeddings,
    but verify any provider-specific params (e.g. `dimensions`) are honored; Anthropic's
    compat layer is beta. Test each provider before declaring it "swappable in prod".

---

## 12. Environment Variables

```
# AI generation (swappable) — default keeps Gemini via its OpenAI-compatible endpoint
AI_PROVIDER=gemini
GEN_MODEL=gemini-2.5-flash-lite
GEMINI_API_KEY=            # existing
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=

# Embeddings (PINNED — do not change after ingesting)
EMBED_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
EMBED_API_KEY=             # falls back to GEMINI_API_KEY
EMBED_MODEL=gemini-embedding-001
EMBED_DIMENSIONS=1536

# Qdrant (new self-hosted container)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# Existing (unchanged)
DATABASE_URL=
REDIS_URL=redis://localhost:6379
```

### docker-compose addition

Implemented in two places (pin the image — `latest` is not a deploy strategy):

- **`docker-compose.yml` (dev)** — `qdrant` service (`qdrant/qdrant:v1.18.2`, ports
  6333/6334, `qdrant_data` volume); `backend` and `worker` now `depends_on` it.
- **`deploy/docker-compose.qdrant.yml` (server)** — standalone Qdrant for deploying the
  vector DB on its own host: required `QDRANT__SERVICE__API_KEY` (fails fast if unset),
  `restart: unless-stopped`, TCP healthcheck, on-disk payloads, log rotation, and gRPC
  not published. Point the backend at it with `QDRANT_URL` + `QDRANT_API_KEY`.
