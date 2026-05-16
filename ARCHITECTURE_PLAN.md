# QuestFlow — Comprehensive Architecture Plan

**Date:** May 4, 2026
**Scope:** AI service pipeline, Bedrock agent integration, monster pipeline, sprite generator rework, animation page rework, admin panel, game-themed quest & export system
**Revised:** May 8, 2026 — Sprite generator uses ComfyUI+LoRA (not Gemini), no separate monster generator page, monster stats and sprite generation are independent pipelines, S3 Vectors as vector store
**Revised:** May 11, 2026 — Sprite generator simplified: static Style Catalog (TS config) replaces dynamic LoRA Catalog. Styles bundle checkpoint + ordered LoRA list (style LoRA(s) + DMD2 always) + tuned prompts. DMD2 4-step distillation is always on; one workflow template via `Power Lora Loader (rgthree)` covers every style. Image prompt composition added to Plan 11.
**Revised:** May 11, 2026 — Cassette Beasts-specific content split out to [CB-plan.md](CB-plan.md). Plan 8 in this file is now a pointer; the CB KB, CB sprite style, CB Godot runtime, and CB exporters all live in the CB plan with their own task numbering (CB-1…CB-9).
**Revised:** May 11, 2026 — Plan 4 rewritten: monster pipeline replaced by interactive Character & Monster page (unified NPC/monster editor, three independently-regenerable agent sections — lore/appearance/stats, sprite iteration loop with manual approval gate). Always-on RMBG + Pixel Snap inline in every generation workflow (Plan 3.7); user-facing post-process toggles deleted. `BACKGROUND_PHRASE` (`", solid flat blue background"`) auto-appended by the image prompt composer. PixelLab animation + .tres / JSON / PNG export are on-demand character-page buttons, not pipeline steps. Plan 7.3 added (per-character export endpoint). Plan 11.8 added (character section agent task templates + KB policy).
**Revised:** May 11, 2026 — Plan 4 Character editor reframed from a sequenced "STEP 1 form → STEP 2 sprite → STEP 3 done" wireframe into a real **dedicated full page** at `/projects/:projectId/characters/:characterId` (canonical) + flat redirect aliases. Sections coexist; no enforced order. QuestBuilder "+ Create new" now full-page-navigates with `?returnTo=quest:<questId>:<nodeId>` (instead of opening a modal). CB-7.1 updated to match. In-progress sprite/animation jobs are queue-backed and survive navigation away from the page.
**Revised:** May 11, 2026 — Design refresh split out to [design-plan.md](design-plan.md). Sibling plan (same level as [CB-plan.md](CB-plan.md)) covering token rewrite, AI-trope removal inventory, shadcn component refresh, page-by-page audit, and a new public marketing/landing surface. Direction: retro/game-flavored dark UI. Not in this plan's execution scope.
**Revised:** May 16, 2026 — Pixel Snapper moved out of ComfyUI (Python port was 2-5s per image) into the Node sprite worker as a vendored WASM module (`backend/vendor/pixel-snapper/`, built from Hugo-Dz/spritefusion-pixel-snapper via `wasm-pack`, ~0.5-1.5s per image). `cbstyle.json` workflow now ends at `easy imageRemBg`; SaveImage reads from RMBG. New `pixelSnapper.ts` worker module does snap → crop 129→128 edge artifact → optional nearest-neighbor resize to `targetSize`. `targetSize` resolution order: character `targetSizeOverride` → style `targetSize` → global default `128`. Plan 3.4 Style interface, Plan 4 Character.assets schema, and Phase 3 sub-task table updated.

---

## Current State Assessment

### What Exists Today

**Backend** (Express 5 + TypeScript + Mongoose/MongoDB):
- `questGenerationController.ts` — Uses **Gemini 2.5 Flash Lite** to generate objectives, characters, and full quest graphs. Now theme-aware — injects tone, naming, rewards, locations, dialogue context from `GameTheme`. ✅ DONE
- `spriteController.ts` — Enqueues ComfyUI sprite jobs via BullMQ. Accepts `{ prompt, styleId?, negativePrompt? }`. Returns jobId immediately (202). ✅ DONE
- `jobQueue.ts` — **DELETED.** Replaced by BullMQ + Redis. ✅ DONE
- `worker.ts` — Separate worker process (`npm run worker`) boots all workers. ✅ DONE
- Models: User, Questline (with themeId + exportFormat), Sprite, QuestStyle, ExportTemplate, NodeVariantConfig, Comment, Post, Monster, ThemeConfig, GameTheme. ✅ DONE
- Auth: JWT + Google OAuth via Passport.
- Storage: S3 (or MinIO) for sprites with presigned URLs.
- Queues: `spriteQueue`, `monsterQueue`, `questQueue` via BullMQ + Redis. ✅ DONE
- Universal SSE job streaming route (`GET /jobs/:queue/:jobId/stream`). ✅ DONE
- Bedrock client + agent service wired, waiting for real agent IDs. ✅ DONE
- ComfyUI LoRA service built with workflow patching (`loraService.ts` + `cbstyle.json`). ✅ DONE
- Theme seeds: `generic_rpg` and `cassette_beasts` seeded on startup. ✅ DONE

**Frontend** (React 18 + Vite + Tailwind 4 + Radix UI + shadcn):
- Pages: Login, Dashboard, QuestCreate (wizard), QuestBuilder (flow graph via @xyflow/react), SpriteGenerator, SpriteAnimator.
- SpriteAnimator is a **stub** — hardcoded frames/animations, no actual sprite sheet loading, no PNG+JSON support.
- No admin page exists.
- SpriteGenerator uses Gemini-era filters (artStyle, perspective, etc.) — needs rework for ComfyUI style picker. ⬜ Phase 3.5
- QuestCreate has no theme picker yet. ⬜ Phase 3

### Key Problems Still to Solve

1. **Sprite generator backend swapped to ComfyUI** ✅ — UI still needs style picker instead of Gemini filters (Phase 3.4–3.5).
2. **No Bedrock agent IDs yet** — quest generation falls back to Gemini with theme context injected. Full Bedrock swap happens after Phase 6 admin panel wires up agents.
3. **Monster pipeline not built** — Bedrock stats + ComfyUI sprite + PixelLab animation + auto-tagger + .tres export.
4. **SpriteAnimator is a placeholder** — needs to parse Aseprite-format PNG+JSON and play back real animations.
5. **No admin panel** — no way to manage themes, styles, agents, knowledge bases, or jobs.
6. **No export system** — export format stored on questline but no exporters built yet.

### Key Design Decisions

1. **Every theme gets a Bedrock agent + KB.** "Generic RPG" is not a fallback without an agent — it's a first-class theme with its own KB containing RPG stat formulas, trope libraries, archetype patterns, and quest structures. Cassette Beasts is simply another theme alongside it.
2. **Export format is per-questline, not per-game.** A questline stores its `exportFormat` at creation time (defaulting from the selected theme), but the user can change it later from the QuestBuilder.
3. **Single-repo worker, not a separate microservice.** The worker process (`npm run worker`) runs from the same codebase, sharing models/services/types. Scale by running more worker instances against the same Redis.
4. **Theme selection drives the pipeline, not game selection.** A theme could be a game (Cassette Beasts) or a style (Dark Fantasy RPG). Each theme has its own agent, KB, and optional LoRA.
5. **Sprite generation and monster stats are independent.** The Sprite Generator is a standalone image tool (ComfyUI + LoRA, style picker). Monster stats come from Bedrock agents. A monster may have a sprite generated separately — they are not the same pipeline.
6. **Styles are a static, code-versioned catalog — not a dynamic LoRA database.** A Style bundles a checkpoint + optional LoRA + tuned prompt prefix + tuned negative + sampler params. Styles live in `backend/src/config/styles.ts` and are added via PR, not user upload. ThemeConfig references a `defaultStyleId` (a string key). "No Style" is just another style entry pointing at vanilla SDXL with no LoRA. No Civitai integration, no S3 sync, no upload UI — checkpoint and LoRA files live on the ComfyUI host (local disk or baked into RunPod image).
7. **DMD2 distillation is always on.** Every style stacks the DMD2 SDXL 4-step LoRA on top of its style LoRA via ComfyUI's Power Lora Loader (rgthree). All workflows run at DMD2-tuned params (4 steps, CFG 1.2, `euler` / `simple`). There is no normal-vs-fast mode toggle — generation is fast by default. Adding/removing/swapping LoRAs is a config edit (the `loras` array on a Style), not a workflow-schema change, because the Power Lora Loader takes an arbitrary list.
8. **Sprite cleanup (BG removal + Pixel Snap) is always-on inside ComfyUI.** The generation workflow ends with `easy imageRemBg` (BRIA RMBG 1.4) → `SpriteFusionPixelSnapper` → save. No toggle, no separate queue, no re-process route — every sprite that comes out of the pipeline is already transparent-background and grid-snapped. The image-prompt composer always appends `", solid flat blue background"` so the RMBG node has a high-contrast key color. See Plan 3.7.
9. **ComfyUI local for now, RunPod Serverless later.** One `.env` change (`COMFYUI_ENDPOINT`) switches between local and cloud. Checkpoint + LoRA files are managed manually on the ComfyUI host — no automated sync. RunPod path bakes them into the container image.
10. **Vector store = AWS S3 Vectors.** Not OpenSearch Serverless or Pinecone.
11. **CB mod is a three-package wrapper system** (see [CB-plan.md](CB-plan.md) CB-3): `questflow_core` ships once with the runtime; `questflow_questline_<id>` ships per questline; `questflow_bestiary_<projectId>` ships per project for shared/orphan monsters. Updating one questline never requires re-installing the rest. Project bundle export is a zip-of-folders for convenient first-time install.
12. **Projects are website-only organization.** A Project groups questlines + characters in QuestFlow's UI. They influence export *bundling* (the project bundle exporter) but each questline still installs as its own independent CB package.
13. **All AI generation goes through the prompt composer** (Plan 11). For text: system prompts are per-theme, task templates are universal, structured output is enforced via Bedrock tool-calling. For images: positive + negative are composed from the Style's tuned prefixes plus the user's prompt — users never write style cues like "pixel art, detailed" themselves; the Style provides those. KB grounds via retrieval when the task needs mechanical constraints; theme tone is always injected via the system prompt.

---

## Plan 1: AI Service & Job Pipeline ✅ COMPLETE

### Goal
Replace the in-memory job queue with a proper async job system that can handle multi-step, long-running AI pipelines.

### What Was Built

#### 1.1 Redis + BullMQ ✅
- `queues/connection.ts` — Redis singleton (`maxRetriesPerRequest: null`)
- `queues/spriteQueue.ts` — sprite queue, 3 attempts, exponential backoff
- `queues/monsterQueue.ts` — monster queue with `MonsterJobProgress` step types
- `queues/questQueue.ts` — quest queue
- `REDIS_URL` added to config (supports `redis://:password@host:port`)

#### 1.2 Worker Process ✅
- `worker.ts` — separate Node process, connects MongoDB, boots all workers
- `npm run worker` script added to `package.json`

#### 1.3 Sprite Worker Migrated ✅
- `workers/spriteWorker.ts` — ComfyUI generation via `generateWithLora` / `generateBase` (Phase 3.2)
- `utils/jobQueue.ts` — **deleted**

#### 1.4 Universal SSE Job Streaming ✅
- `routes/jobRoute.ts` — `GET /jobs/:queue/:jobId/stream`
- Polls BullMQ every 500ms, streams state + progress + result
- Heartbeat every 15s, cleans up on client disconnect
- Supports: `sprite-generation`, `monster-generation`, `quest-generation`

#### 1.5 Config ✅
```
REDIS_URL=redis://:password@host:6379
COMFYUI_ENDPOINT=http://127.0.0.1:8188
AWS_BEDROCK_REGION=us-east-1
```

---

## Plan 2: AWS Bedrock Agent & Knowledge Base Integration ✅ PARTIALLY COMPLETE

### Goal
Every theme gets its own Bedrock Agent backed by its own Knowledge Base. Quest generation is grounded in structured data, never pure hallucination.

### Architecture

```
────────────────────────────────────────────────────────────────
                        AWS Bedrock

  ┌─────────────────────┐   ┌─────────────────────┐
  │  CB Agent (Haiku)   │   │  Generic RPG Agent  │   (+ more...)
  └──────────┬──────────┘   └──────────┬──────────┘
             │                         │
  ┌──────────▼──────────┐   ┌──────────▼──────────┐
  │  CB Knowledge Base  │   │  RPG Knowledge Base │
  │  (S3 Vectors)       │   │  (S3 Vectors)       │
  └──────────┬──────────┘   └──────────┬──────────┘
             │                         │
  ┌──────────▼──────────┐   ┌──────────▼──────────┐
  │  S3: cb_kb/         │   │  S3: generic_kb/    │
  │  type_chart.json    │   │  stat_formulas      │
  │  all_beasts.json    │   │  archetype_lib      │
  │  all_moves.json     │   │  quest_patterns     │
  │  world_lore.md      │   │  trope_catalog      │
  └─────────────────────┘   └─────────────────────┘
────────────────────────────────────────────────────────────────
                    │
               ┌────▼─────┐
               │ QuestFlow│
               │ Backend  │
               └──────────┘
```

### What Was Built

#### 2.1 Bedrock Client + Services ✅
- `services/bedrock/bedrockClient.ts` — `BedrockAgentRuntimeClient` + `BedrockAgentClient` singletons
- `services/bedrock/agentService.ts` — `invokeAgent(agentId, aliasId, prompt)` streams response chunks
- `services/bedrock/knowledgeBaseService.ts` — `syncKnowledgeBase`, `deleteKnowledgeBase` (KB creation stubbed, wired in Phase 6 admin panel with S3 Vectors config)

#### 2.2 Models ✅
- `models/themeConfigModel.ts` — themeId, displayName, category, bedrockAgentId, bedrockAliasId, knowledgeBaseId, s3KBPath, loraModelPath, loraTriggerWord, exportFormats, spriteSpecs (note: `loraModelPath`/`loraTriggerWord` to be replaced with `defaultStyleId` per revised Plan 3.4)
- `models/gameThemeModel.ts` — questTone, namingStyle, rewardTypes, questTypes, locationRules, dialogueStyle
- `models/monsterModel.ts` — speciesData, assets, jobId, status (superseded by `models/characterModel.ts` with `kind: 'monster'` per revised Plans 4 and 9.2; to be deleted after migration)
- `models/questlineModel.ts` — added `themeId` + `exportFormat` fields ✅
- `models/seedThemes.ts` — seeds `generic_rpg` and `cassette_beasts` on startup ✅

#### 2.3 Theme-Aware Quest Generation ✅
- All three endpoints (`/generate`, `/generate-characters`, `/generate-questline`) accept `themeId`
- `GameTheme` context (tone, naming, rewards, locations, dialogue) injected into Gemini prompts
- `themeId` + `exportFormat` saved on questline at creation
- Export format resolved: request body → ThemeConfig default → `'json'`

#### 2.4 Still Needed ⬜
- Build Generic RPG KB files and upload to S3
- (CB-specific KB files moved to [CB-plan.md](CB-plan.md) CB-1.2 — not in this plan's scope)
- Create Bedrock Agents in AWS (one per theme), save agent IDs to ThemeConfig via admin panel
- Quest generation auto-upgrades to full Bedrock agent once IDs are set (no code change needed — `invokeAgent` already wired)

---

## Plan 3: Sprite Generator Rework ✅ PARTIALLY COMPLETE

### Goal
Replace Gemini image generation with ComfyUI. Replace Gemini-specific filter UI with a **Style picker** (curated style cards backed by a static code-versioned catalog). Each Style bundles a checkpoint, an ordered LoRA list (style LoRA(s) + the always-on DMD2 4-step distillation LoRA), tuned prompt prefixes/negatives, and sampler params. One workflow template per base model handles every style via ComfyUI's `Power Lora Loader (rgthree)`. Add **post-processing** (background removal, upscale, downscale) as both inline workflow toggles and standalone re-process operations.

### Key Design Decisions

1. **Style Catalog is a static TypeScript config, not a database.** `backend/src/config/styles.ts` exports an array of Style entries. Adding a style = code PR. No upload UI, no Civitai client, no MongoDB collection, no S3 sync. ThemeConfig holds a `defaultStyleId: string` referencing a key in this catalog.
2. **A Style is a complete generation recipe, not just a LoRA reference.** Each Style declares: checkpoint filename, optional LoRA filename + trigger word + strength, prompt prefix, tuned negative prompt, default dimensions, and sampler params. Picking a style locks all of these. The user provides only the *subject* description.
3. **The word "LoRA" never appears in the user UI.** Internally we still use LoRAs. Externally users see "Style". Advanced/admin views may show LoRA details, but the SpriteGenerator surface treats Styles as opaque.
4. **Each style declares its own checkpoint.** Pixel-art styles use Pixel Art Diffusion XL; anime/creature styles use Animagine XL; realistic styles use Juggernaut XL; "No Style" uses vanilla SDXL. Vanilla SDXL is a *bad* baseline for pixel art — the checkpoint matters as much as the LoRA. Workflow JSON files are parameterized over checkpoint name.
5. **DMD2 distillation is always on, not opt-in.** Every Style's `loras[]` includes the DMD2 4-step distillation LoRA as its final entry. All generations run at DMD2-tuned sampler params (4 steps, CFG 1.2, `euler` / `simple`). There is no "Fast preview" toggle — generation is fast by default. LoRA stacking is handled by ComfyUI's `Power Lora Loader (rgthree)`, which takes an arbitrary ordered list.
6. **Checkpoint and LoRA file management is manual, not automated.** Files live on the ComfyUI host. Local dev: drop into `models/checkpoints/` and `models/loras/` once. Production (RunPod): baked into the container image. No `loraSync.ts`, no S3 round trips, no per-job downloads.
7. **Post-processing is GPU-resident inside ComfyUI.** Background removal (rembg), upscaling (4x-UltraSharp), and resizing are nodes appended to the workflow when toggled. No S3 round trips between stages.
8. **Standalone re-process is a separate route.** `POST /sprites/:id/process` runs a post-process-only workflow on an existing sprite (download from S3 → ComfyUI → upload result).

### What Was Built

> **Note:** Subsections 3.1–3.3 describe state-as-of-build. The `generateWithLora` / `generateBase` split and the `base.json` template are scheduled for removal in 3.5.1–3.5.2 (collapse into one `generationService.generateWithStyle` + one `sdxl_power_lora.json` template). `cbstyle.json` itself was rewritten in-place to the new shape (Power Lora Loader + DMD2 stacked, 4 steps, CFG 1.2, euler/simple, ends with `easy imageRemBg` — Pixel Snap moved to the worker, see Plan 3.7).

#### 3.1 ComfyUI LoRA Service ✅ (to be refactored in 3.5)
- `services/generation/loraService.ts` — `generateWithLora(opts)` + `generateBase(opts)`:
  - Loads workflow JSON template from `workflows/` by LoRA name
  - Patches nodes: LoRA name (node 2), positive prompt (node 3), negative prompt (node 4), dimensions (node 5), random seed (node 6)
  - POSTs to `/prompt`, polls `/history/:promptId` every 1.5s, fetches image from `/view`
  - Falls back to `cbstyle` workflow if no theme-specific workflow exists
  - `generateBase()` — uses `base.json` workflow (no LoRA node) for "No Style" path
  - Timeout: 120s
- `services/generation/workflows/cbstyle.json` — rewritten to use Power Lora Loader + always-on DMD2 ✅
- `services/generation/workflows/base.json` — base SDXL workflow (no LoRA) ✅ — to be deleted in 3.5

#### 3.2 Swap Worker to ComfyUI ✅
- `workers/spriteWorker.ts` — replaced Gemini with `generateWithLora()` / `generateBase()`
- Branches on `loraName`: if set → `generateWithLora`, else → `generateBase`
- `SpriteJobData` — drops `fullPrompt`/`filters`, has `positivePrompt`, `negativePrompt`, `loraName`, `triggerWord`, `styleId`
- `spriteController.ts` — removed Gemini gate, accepts `{ prompt, styleId?, negativePrompt? }`, resolves LoRA from ThemeConfig
- `spriteQueue.ts` — updated to match new job data shape

#### 3.3 SpriteModel Updated ✅
- Replaced `filters` object with `styleId` + `negativePrompt` + `positivePrompt`

### Still Needed

#### 3.4 Static Style Catalog (replaces dynamic LoRA catalog) ⬜

New file: `backend/src/config/styles.ts`. A pure TypeScript module — no DB, no routes, no upload pipeline.

```typescript
export interface StyleSamplerParams {
  steps: number;     // DMD2-tuned: 4 (range 4-8)
  cfg: number;       // DMD2-tuned: 1.2 (range 1.0-1.5)
  sampler: 'euler' | 'dpmpp_2m' | 'dpmpp_sde' | 'lcm';
  scheduler: 'simple' | 'karras' | 'normal' | 'sgm_uniform';
}

export interface StyleLora {
  filename: string;            // in models/loras/
  strength: number;            // model-side strength (Power Lora Loader)
  strengthClip: number;        // clip-side strength — typically <1.0
  triggerWord?: string;        // prepended to positive prompt (style LoRAs); DMD2 has none
}

export interface Style {
  id: string;                  // 'cb_pixel' | 'anime_mon' | 'dark_fantasy' | 'none'
  name: string;                // user-facing
  description: string;         // shown in tooltip / card
  previewImagePath: string;    // bundled asset, not S3
  category: 'pixel' | 'illustrated' | 'realistic' | 'raw';
  baseModel: 'SDXL';           // future: Flux
  checkpoint: string;          // safetensors filename in ComfyUI's models/checkpoints/
  loras: StyleLora[];          // applied in order via Power Lora Loader (rgthree).
                               // Convention: style LoRA first, DMD2 last.
                               // "No Style" sets loras: [{ DMD2 only }].
  promptPrefix: string;        // prepended to user's subject text
  negativePrompt: string;      // tuned per style, NOT a generic default
  defaultDimensions: { width: number; height: number };  // ComfyUI generation size (typically 1024×1024)
  targetSize?: number;         // final snap-and-resize output edge length, e.g. 64 | 128 | 256
                               // omitted → falls back to global default (128)
                               // see Plan 3.7.4 for resolution order (character override > style > global)
  sampler: StyleSamplerParams; // DMD2-tuned by default (4 steps, CFG 1.2, euler/simple)
  isDefault?: boolean;
}

export const STYLES: Style[] = [ /* … see 3.4.1 … */ ];
export function getStyle(id: string): Style | undefined { … }
```

**Why `loras: StyleLora[]` instead of a single `lora` field:** every workflow uses ComfyUI's Power Lora Loader (rgthree) which natively accepts a list. DMD2 is always one of the entries. Adding a new LoRA (e.g. detail enhancer, character LoRA) to a style = append one config object; no workflow JSON change.

ThemeConfig change: replace `loraModelPath: string` + `loraTriggerWord: string` with `defaultStyleId: string` (a key into `STYLES`). Existing seed data migrates: CB theme → `defaultStyleId: 'cb_pixel'`, Generic RPG → `defaultStyleId: 'none'`.

##### 3.4.1 Initial Style Catalog Contents

Four initial entries cover the realistic spectrum of needs. Adding more is a code PR.

| `id` | Checkpoint | Style LoRA (+ DMD2 always) | Best for |
|---|---|---|---|
| `cb_pixel` | `pixelArtDiffusionXL.safetensors` | `cb-000006.safetensors` (trigger `cbstyle`) + DMD2 | Cassette Beasts creatures, retro RPG sprites |
| `anime_mon` | `animagineXL_v3.safetensors` | DMD2 only initially | Stylized creatures, Pokémon-style monsters |
| `dark_fantasy` | `juggernautXL_v9.safetensors` | DMD2 only initially | Realistic monsters, dark fantasy creatures |
| `none` | `sd_xl_base_1.0.safetensors` | DMD2 only | Generic / "raw SDXL" fallback |

Every style ships with:
- The DMD2 4-step distillation LoRA at strength 1.0 as the final entry in `loras[]`. No exceptions — DMD2 isn't optional, it's how every generation runs.
- A tuned `promptPrefix` (e.g. `cb_pixel`: `"cbstyle, monster creature, pixel art, clean outline,"`).
- A tuned `negativePrompt` (e.g. `cb_pixel`: `"photo, realistic, 3d render, blurry, low quality, text, watermark, signature, jpeg artifacts"` — note: **no anti-human-face, no anti-symmetry, no anti-bright-colors** terms that the current `DEFAULT_NEGATIVE` has).
- Identical sampler params across all styles: `{ steps: 4, cfg: 1.2, sampler: 'euler', scheduler: 'simple' }`. These are DMD2's required range; deviating breaks generation quality. Style identity comes from the checkpoint + style LoRA + prompts, not from sampler tuning.

##### 3.4.2 Files installed manually on ComfyUI host

```
models/checkpoints/
  sd_xl_base_1.0.safetensors
  pixelArtDiffusionXL.safetensors
  animagineXL_v3.safetensors
  juggernautXL_v9.safetensors

models/loras/
  cb-000006.safetensors          (existing CB LoRA)
  dmd2_sdxl_4step_lora.safetensors
```

A short README in `backend/src/config/` will document where each file came from and how to install it on a fresh ComfyUI instance.

##### 3.4.3 Removed scope (was 3.4 in May 8 plan)

The following are explicitly cut: `models/loraModel.ts`, `routes/loraRoute.ts`, `services/lora/civitaiClient.ts`, `services/lora/loraSync.ts`, `POST /api/loras/upload`, `POST /api/loras/import-civitai`, S3 storage of `.safetensors` files. Any future "add a style" flow is a PR, not a runtime feature.

#### 3.5 Workflow Parameterization & Updates ⬜

`cbstyle.json` has been rewritten to use the new shape (Power Lora Loader with style LoRA + DMD2, euler/simple, 4 steps, CFG 1.2). It now serves as the template for a generic `sdxl_power_lora.json` that any style can use. `base.json` is no longer needed because "No Style" is just a Style entry with `loras: [DMD2 only]`.

##### 3.5.1 Workflow file consolidation

One reusable workflow template covers every style, because the Power Lora Loader takes an arbitrary list of LoRAs:

- `workflows/sdxl_power_lora.json` — `CheckpointLoaderSimple` → `Power Lora Loader (rgthree)` → CLIP encode (pos/neg) → KSampler → VAE → save. Patched at runtime with `checkpoint`, the full `loras[]` array (style LoRA + DMD2 at minimum), prompts, sampler params, seed.

Style differentiation lives entirely in the Style config — checkpoint name, LoRA list, prompts. The workflow JSON itself never changes per style. "No Style" passes `loras: [DMD2 only]`. Adding a third LoRA to a style (e.g. a detail enhancer) is a config-only change.

`loraService.ts` is renamed `generationService.ts` and updated to:
1. Accept a `Style` object plus a composed prompt.
2. Load `sdxl_power_lora.json`, patch the checkpoint, the Power Lora Loader's `lora_1`, `lora_2`, … entries from `style.loras[]`, the prompts, sampler params, and seed.
3. Submit to ComfyUI and return the result.

The existing `cbstyle.json` already uses this shape (Power Lora Loader, DMD2 stacked, euler/simple, 4 steps, CFG 1.2) and serves as the template — generalize it into `sdxl_power_lora.json` and delete the style-specific copy. `base.json` is deleted (no longer needed).

##### 3.5.2 Cleanup tasks

- Delete `DEFAULT_NEGATIVE` from `loraService.ts`. Negatives are per-style from now on.
- Delete `base.json` (one workflow template replaces both).
- Rename `loraService.ts` → `generationService.ts` and drop the `generateWithLora` / `generateBase` distinction; one entry point.

#### 3.6 Image Prompt Composition (cross-references Plan 11.7) ⬜

A new `services/generation/imagePromptComposer.ts`:
```typescript
export interface ComposedImagePrompt {
  positive: string;                 // "<triggers>, <stylePrefix>, <userSubject>"
  negative: string;                 // style.negativePrompt + optional user additions
  checkpoint: string;
  loras: StyleLora[];               // full ordered list — style LoRA(s) + DMD2
  sampler: StyleSamplerParams;
  dimensions: { width: number; height: number };
}

export function composeImagePrompt(opts: {
  styleId: string;
  userSubject: string;              // "a fire dragon with horns"
  extraNegative?: string;           // user-supplied additions, not replacement
  dimensionsOverride?: { width: number; height: number };
}): ComposedImagePrompt;
```

Trigger word handling: the composer collects `triggerWord` from every entry in `style.loras` that has one (typically just the style LoRA — DMD2 has none) and prepends them to the positive prompt before `style.promptPrefix`.

**Background phrase (always appended).** The composer always appends a fixed phrase — `", solid flat blue background"` — to the end of the positive prompt. This gives the background-removal node (Plan 3.7) a clean, high-contrast key color to detect. It is not configurable per style and never omitted; the BG removal node assumes its presence. Final positive shape:

```
{triggers}, {stylePrefix} {userSubject}, solid flat blue background
```

The constant lives in `imagePromptComposer.ts` as `BACKGROUND_PHRASE` so it can be tuned in one place.

The composer is what `generationService.generateWithStyle()` (renamed from `loraService.generateWithLora` / `generateBase`) consumes. The worker no longer assembles strings — it asks the composer for a ready prompt object.

User guidance baked into the UI tooltip: *"Describe what the creature is (e.g. 'a fire dragon with horns, lava-cracked skin'). Don't describe how it should look (e.g. 'pixel art, detailed') — the Style handles that."*

#### 3.7 Always-On Sprite Cleanup (BG Removal in ComfyUI + Pixel Snap + Resize in Worker) ⬜

Every sprite generation produces a clean, transparent-background, grid-snapped, target-sized PNG. The cleanup runs in two stages, split between ComfyUI and the Node worker. Both stages are mandatory, single-pipeline, hidden from the user.

##### 3.7.1 Stage 1 — Background removal (inside ComfyUI)

`sdxl_power_lora.json` (Plan 3.5) extends past VAE Decode with one appended node:

1. **`easy imageRemBg`** (from [ComfyUI-Easy-Use](https://github.com/yolain/ComfyUI-Easy-Use)) — model `u2net` or BRIA RMBG-1.4. Strips the solid blue background introduced by the prompt-side `BACKGROUND_PHRASE`. Output: 1024×1024 RGBA image with transparent background.
2. **`SaveImage`** — reads from RMBG output.

> **Node class name not yet verified against installed nodes.** ComfyUI custom node class names can drift. On first integration, inspect the loaded node classes in ComfyUI's API and update `cbstyle.json` / `sdxl_power_lora.json` accordingly. The current `cbstyle.json` uses provisional name `easy imageRemBg`.

##### 3.7.2 Stage 2 — Pixel snap + resize (inside the Node sprite worker)

After ComfyUI returns the 1024×1024 transparent PNG, the worker pipes it through a **WASM-compiled Pixel Snapper + a `sharp` resize step**, then uploads the result to S3. This stage replaces the previously-planned in-ComfyUI Pixel Snapper node — the Python port was 2-5s per image (k-means + Sobel + walker passes), versus 0.5-1.5s in WASM.

```
ComfyUI returns 1024×1024 RGBA PNG
            │
            ▼
  pixelSnapper(buffer, { k_colors: 16, pixel_size: null })
    └─ via WASM, calls process_image(bytes, 16, null)
            │
            ▼
  resulting buffer is ~128×128 (or 129×129 — snapper edge artifact)
            │
            ▼
  sharp.extract({ left: 0, top: 0, width: 128, height: 128 })
    └─ crops the +1 walker overshoot when present
            │
            ▼
  if targetSize !== 128:
    sharp.resize(targetSize, targetSize, { kernel: 'nearest' })
    └─ nearest-neighbor preserves grid integrity
            │
            ▼
  upload to S3 → rawSpriteCandidates[] entry
```

##### 3.7.3 Pixel Snapper WASM integration

The snapper algorithm comes from [Hugo-Dz/spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) — a Rust crate that already exposes a `#[wasm_bindgen]` `process_image(bytes, k_colors?, pixel_size?) -> Vec<u8>` entry point. Build is one command (`wasm-pack build --target nodejs --release`); upstream is the source of truth, no algorithm porting required.

Vendoring approach:
- **Source location** in the repo: `backend/vendor/pixel-snapper/` — a git submodule pinned to a tagged Rust commit. Bumping the commit on upstream releases is a deliberate per-release action.
- **Build artifact**: `backend/vendor/pixel-snapper/pkg/` (output of `wasm-pack`) committed to the repo so production deploys don't need a Rust toolchain. ~5 files, <1MB.
- **Build script**: `npm run build:pixel-snapper` runs `wasm-pack build --target nodejs --out-dir pkg --release` inside the submodule. Wired into CI so a missing or stale build fails the build.
- **Node wrapper**: `backend/src/services/generation/pixelSnapper.ts` — ~30 lines of TS importing `pkg/spritefusion_pixel_snapper.js`, exposing:
  ```typescript
  export async function snapAndResize(
    png: Buffer,
    targetSize: number,           // final output edge length, e.g. 128, 64, 256
    kColors = 16,
  ): Promise<Buffer>;
  ```
  Internally: invoke WASM `process_image`, decode the result with `sharp`, crop to 128×128 to clip the edge artifact, resize to `targetSize` if ≠ 128 (nearest-neighbor), encode PNG.

Why WASM not native binary:
- One artifact (vendored `pkg/`) works on Windows dev + Linux prod + RunPod. No per-platform Rust builds.
- Same Node process as BullMQ workers — no IPC, no shell-out, no temp files.
- WASM perf is 1.5-2× slower than native Rust but still 3-5× faster than the Python port.

Why not port to TypeScript:
- Upstream is actively maintained. A TS port would mean re-syncing the algorithm every time Hugo updates the Rust crate.
- WASM keeps upstream as the source of truth; bumping the submodule commit is the entire upgrade story.

##### 3.7.4 Sizing — `targetSize` resolution order

The worker resolves the target size in this order before calling `snapAndResize`:

1. **Character-level override** — `character.assets.targetSizeOverride` (Plan 4 data model). User-settable for advanced cases (an oversize boss monster at 256, or a small icon at 32). Not exposed in default UI; set via an "Advanced" disclosure on the Character editor sprite section.
2. **Style-level default** — `style.targetSize` (Plan 3.4 `Style` interface). e.g. `cb_pixel` sets `targetSize: 64` because CB sprites are 64×64.
3. **Global default** — `128` if neither of the above is set.

The user never *needs* to touch these — defaults work for every common case. The advanced override exists so a single boss sprite doesn't force a new Style entry.

##### 3.7.5 Why always-on, not toggle

- Sprite generations in this app are *always* for character/monster artwork — a transparent-background, snapped pixel-art sprite at a known size is the only useful output shape. Toggling off any step produces an artifact the rest of the pipeline (PixelLab animation, export) cannot consume.
- Hiding the cleanup stage from the user means: no UI complexity, no failure-mode surfaces.
- Total pipeline time: ~5s ComfyUI (gen + RMBG) + ~1s worker (WASM snap + sharp resize) ≈ 6s per candidate. Acceptable for iterative sprite work.

##### 3.7.6 No user-visible knobs (with one exception)

- `k_colors` is a fixed default (`16`) in the worker. Not surfaced in UI, not in the `Style` config, not exposed in any API.
- `pixel_size` is always auto-detected (`null` to the WASM call).
- `targetSize` is **the one exception**: surfaced behind an "Advanced" disclosure on the Character editor sprite section (Plan 4.6) so a user can override Style/global defaults. Defaults are sensible enough that 95% of users never open the disclosure.

##### 3.7.7 What this replaces

The old plan had:
- A `removeBackground?: boolean` + `upscale?: 2 | 4` + `targetSize?` toggle set on the composed prompt.
- Standalone re-process route `POST /sprites/:id/process`.
- `spritePostprocessQueue` + `spritePostprocessWorker`.
- `services/generation/workflowComposer.ts` for composing post-process nodes.
- The in-ComfyUI Pixel Snapper Python node (slow).

**All of this is cut.** BG removal stays in ComfyUI. Snap + resize move to a single Node-side step. Upscale is dropped entirely — sprites are downsampled to a target size, never upscaled.

If a future use case needs standalone re-snapping (e.g. user uploads their own sprite and wants snapping applied), reintroduce a thin route then. Not in scope now.

#### 3.8 Styles API Endpoint ⬜
- `GET /api/styles` — returns the static `STYLES` array (filtered to active, omitting internal fields like raw filenames). Frontend caches indefinitely; it changes only on deploys.
- Each entry returns: `id`, `name`, `description`, `previewImageUrl`, `category`, `defaultDimensions`.
- No `POST`, `PATCH`, `DELETE` endpoints. The catalog is read-only at runtime.

#### 3.9 Rework Sprite Generator UI ⬜
- **Remove:** artStyle, perspective, aspectRatio, colorPalette, detailLevel, category filters (all Gemini-specific).
- **Add:** Style picker — grid of style cards from `GET /api/styles` showing preview image + name + short description. One card selected at a time. Default selected = theme's `defaultStyleId`.
- **Add:** Subject textarea with tooltip teaching the "describe what, not how" rule.
- **Add:** Optional negative prompt field (collapsed by default) — additions to the style's negative, not a replacement. Labeled "Things to avoid (optional)".
- **Keep:** Generate button, preview, gallery, download, lightbox, quick prompts.
- **Add:** "What's a Style?" link → modal explaining styles in plain language. The word "LoRA" appears nowhere in this surface.

**No background-removal toggle, no upscale toggle, no re-process button.** BG removal + Pixel Snap run inline on every generation (Plan 3.7). They are invisible to the user.

#### 3.10 Admin: Styles Read-Only View ⬜
- Admin page `pages/Admin/Styles/` — read-only list of `STYLES` showing all fields (checkpoint, LoRA list with strengths, trigger words, sampler) for debugging.
- No edit/upload/delete. To change styles, edit `config/styles.ts` and redeploy.
- Useful for confirming "is `cb_pixel` actually using the right checkpoint in this environment?"

---

## Plan 4: Character & Monster Pipeline ⬜ (formerly: Monster Pipeline)

### Goal
Replace the old fire-and-forget monster pipeline with a **dedicated, top-level Character editor page**. Not a form embedded in another screen, not a modal — its own route at `/projects/:projectId/characters/:characterId` (and `/new`). Lore, appearance, stats, and sprite work are sections of this page that can be edited in any order, at any time. Sprite generation is a tight iteration loop with a manual approval gate. The page produces a generic artifact (snapped, transparent-background pixel sprite in S3, optionally a spritesheet later). Format-specific exports (.tres, JSON, PNG) are buttons on the page that call Plan 7's export dispatcher.

This plan supersedes the May 8 monster pipeline. The 6-step auto-chain (Bedrock → ComfyUI → PixelLab → autoTag → .tres → S3) is **deleted**. In its place: a real page the user lives on.

### Key Design Decisions

1. **Character editor is a dedicated full page, not a form or modal.** It has its own route, its own URL, its own browser-history entry. Sections (identity, lore, appearance, stats, sprite, animation, export) coexist on the page and can be edited in any order — there is no enforced step-1-then-step-2 sequence. One unified page handles both NPCs and monsters via the `kind: 'npc' | 'monster'` discriminator (Plan 9.2); NPCs hide the Stats section, everything else is shared. Why unify: lore/appearance authoring is identical, and a user often realizes mid-design that a "character" should be a "monster" or vice-versa — toggling `kind` should not require switching pages.
2. **Three independently-regenerable agent sections.** Lore, Physical Appearance, and Stats (monsters only) each have their own [Generate] and [Refine] buttons. Each section is its own agent call with its own KB-retrieval policy (see Plan 11.8). Filling section A and locking it informs section B's generation — but generating A does not implicitly trigger B.
3. **Bidirectional stats↔description.** From description alone, the agent can generate stats grounded in theme KB tier/type/AP ranges (CB type chart, generic RPG formulas). From stats alone, the agent can describe the creature's likely lore + appearance. Either direction works because both are agent calls with the other section as context. The user chooses which direction to start from.
4. **Sprite iteration is a separate, manual loop with a hard approval gate.** Generating a sprite enqueues a job that runs the standard generation workflow (Plan 3.5) which already includes inline RMBG + Pixel Snap (Plan 3.7). The result lands in a candidates grid alongside previous attempts. The user keeps clicking "Regenerate" until satisfied, then clicks "Use this sprite". No sprite is canonical until the user picks one.
5. **No auto-pipeline beyond sprite selection.** The previous plan ran PixelLab + auto-tagger + .tres-export as a chained background job. All three are now **separate, user-triggered actions on the character page** — not pipeline steps. Once the user picks a sprite, the character's `snappedSpriteS3Key` is the canonical artifact and the pipeline is done.
6. **Animation is on-demand, not automatic.** "Generate Animations" is a button on the character page. It invokes PixelLab against the snapped sprite, generates the 6 battle + 8 world frame sets, runs the auto-tagger to produce the Aseprite JSON, and saves the spritesheet + JSON to S3. The user can re-run animation if unsatisfied — costs PixelLab API budget per run.
7. **Export is on-demand, not automatic.** "Export as .tres" / "Export as JSON" / "Export as PNG" are buttons that call Plan 7's export dispatcher with the character ID + format. .tres generation lives in the Plan 7 / CB-plan.md formatter chain, not in this pipeline.
8. **Rejected sprite candidates are kept, not deleted.** Every generated candidate (with its seed + composed prompt) is appended to `character.assets.rawSpriteCandidates`. The user can scroll back through history and pick a different one. Cap: latest 20 candidates per character (older candidates pruned with their S3 objects). Cheap to store, valuable for "I picked the wrong one".
9. **No monolithic "monster job".** The old `monsterQueue` ran one job that did everything; SSE streamed step-by-step progress. After this plan, each operation is its own queue job — section regen, sprite gen, animation gen — each with its own SSE stream. Simpler workers, simpler retry semantics, simpler UI.

### Page Structure & Routing

#### Routes

```
/projects/:projectId/characters/new          → empty editor, create mode
/projects/:projectId/characters/:characterId → existing character, edit mode
```

The project-nested route is canonical. Two flat aliases redirect to the nested form for direct deep linking:

```
/characters/new?projectId=p_abc              → 302 → /projects/p_abc/characters/new
/characters/:characterId                     → 302 → /projects/<owning-project>/characters/:characterId
```

The redirect handler resolves the character's owning project server-side; clients never construct the nested URL themselves.

#### Entry points (all navigate to the editor as a full page — no modals)

| From | How |
|---|---|
| `/projects/:id/characters` (Characters list, Plan 9.7) | Click any character card |
| `/projects/:id/characters` "+ New Character" button | Lands in create mode |
| Project dashboard "Recent characters" tray | Click a tile |
| QuestBuilder monster/NPC picker → "+ Create new" (CB-7.1) | Full-page navigation, **not** a modal. After save, the user navigates back to QuestBuilder via a `?returnTo=quest:<questId>:<nodeId>` query param; QuestBuilder reads it on mount and auto-attaches the new character to the originating node. |

#### Page layout (single page, sections coexist)

```
/projects/:projectId/characters/:characterId
┌──────────────────────────────────────────────────────────────────────┐
│ ← Back to <Project Name>                              [⋯ delete] [⤓] │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ Identity                                                         │ │
│ │   Name [           ]    Kind: ( ) NPC  ( ) Monster               │ │
│ │   Tags [           ]                                             │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Lore / Background            │ │ Sprite                          │ │
│ │  [Generate] [Refine] [🔒]    │ │  Style: [cb_pixel ▼]            │ │
│ │ ┌──────────────────────────┐ │ │  [Generate Sprite]              │ │
│ │ │                          │ │ │                                 │ │
│ │ │  free text area          │ │ │  Candidates (latest 20):        │ │
│ │ │                          │ │ │  ┌──┐ ┌──┐ ┌──┐ ┌──┐            │ │
│ │ └──────────────────────────┘ │ │  │  │ │  │ │  │ │  │  ← select  │ │
│ │                              │ │  └──┘ └──┘ └──┘ └──┘            │ │
│ │ Physical Appearance          │ │  ┌──┐ ┌──┐ ┌──┐ ┌──┐            │ │
│ │  [Generate] [Refine] [🔒]    │ │  │  │ │  │ │  │ │  │            │ │
│ │ ┌──────────────────────────┐ │ │  └──┘ └──┘ └──┘ └──┘            │ │
│ │ │ used as sprite subject   │ │ │                                 │ │
│ │ └──────────────────────────┘ │ │  Selected: [larger preview]     │ │
│ │                              │ │  [Use this sprite]              │ │
│ │ Stats (monsters only)        │ │                                 │ │
│ │  [Generate] [Refine] [🔒]    │ │ ────────────────────────────    │ │
│ │  HP [  ] ATK [  ] DEF [  ]   │ │ Animation (optional)            │ │
│ │  SPD [  ] AP [  ]            │ │  [Generate Animations]          │ │
│ │  Type1 [   ] Type2 [   ]     │ │  (PixelLab — costs API budget)  │ │
│ │  Moves [...]                 │ │  ─ spritesheet preview when set │ │
│ └──────────────────────────────┘ │                                 │ │
│                                  │ ─ Export ───────────────────    │ │
│                                  │  [Export .tres] [JSON] [PNG]    │ │
│                                  └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

Saves: each section auto-saves on blur or after a debounce.
Order: no enforced order. User can fill stats first, lore last, or
       generate a sprite from a one-line appearance and refine the
       rest afterwards.
Lock icon [🔒] toggles whether the section is included in or excluded
       from regenerations of sibling sections (Plan 11.8 locked fields).
```

Each agent-backed section has the same micro-UI: `[Generate]` (fresh fill, respects locks), `[Refine]` (opens a free-text "what to change?" prompt and regenerates with the hint), `[🔒]` (lock toggle).

#### In-progress job behavior

Sprite-generation jobs are queue-backed (BullMQ) and run regardless of page state. If the user navigates away mid-iteration:
- The job continues; new candidates land in `character.assets.rawSpriteCandidates` server-side.
- Returning to the page loads the current candidate list — newly-completed ones appear automatically.
- No "are you sure you want to leave?" dialog. No client-side cancellation on navigation.

The same applies to PixelLab animation jobs and per-section agent calls. SSE streams reconnect on page mount via the universal `GET /jobs/:queue/:jobId/stream` route (Plan 1.4) if a job ID is in flight for this character.

#### Why a page, not a wizard/stepper

Earlier drafts framed this as STEP 1 → STEP 2 → STEP 3. That framing was misleading: the user does not actually move linearly through steps. They might:
- Type one line of appearance, generate three sprite candidates, decide they hate them, rewrite appearance, regenerate.
- Generate full stats first (description-from-stats mode) and only then write lore.
- Pick a sprite, then go back and refine lore for the bestiary entry.

A single page with coexisting sections supports all of these without making any of them feel like the "wrong" flow.

### Data Model

The unified Character model (Plan 9.2) gets its `assets` field updated:

```typescript
interface ICharacterAssets {
  rawSpriteCandidates: Array<{
    s3Key: string;          // pre-selection candidate (already RMBG'd + snapped + resized)
    seed: number;
    composedPositive: string;
    composedNegative: string;
    styleId: string;
    snapSize: number;       // the targetSize used when producing this candidate (64/128/256/etc.)
    createdAt: Date;
  }>;
  snappedSpriteS3Key?: string;     // the user-picked one — canonical
  spritesheetS3Key?: string;       // populated when "Generate Animations" runs
  spritesheetJsonS3Key?: string;

  // Optional per-character override of the resolved sprite size (Plan 3.7.4 resolution order).
  // Surfaced behind an "Advanced" disclosure on the Character editor sprite section.
  // Typical use: an oversize boss monster at 256, or an icon-sized NPC at 32.
  targetSizeOverride?: number;
}
```

Notes:
- The old `tresFile` field is **dropped**. Exports are produced on-demand and streamed to the user; they are not persisted.
- The old `battleSprite` / `worldSprite` split is **dropped**. One snapped sprite + one optional spritesheet covers both use cases — the export formatter decides whether to slice the spritesheet or use the base sprite per target format.
- `rawSpriteCandidates` is capped at 20; older entries' S3 objects are pruned on append.
- Each candidate records its `snapSize` so the user can see (in the candidates grid) which size that attempt was generated at — relevant if they changed `targetSizeOverride` mid-iteration. The "Use this sprite" action copies `snapSize` to `assets.snappedSize` (added below as needed) if cross-character variance matters.

### 4.1 Character Agent (sectional) ⬜

```typescript
// services/generation/agents/characterAgent.ts

export interface CharacterAgentInput {
  character: ICharacter;          // current state of the character record
  theme: IThemeConfig;            // resolves Bedrock agent ID + KB
  lockedFields: string[];         // e.g. ['name', 'lore'] — won't be touched
  userHint?: string;              // free-text refinement guidance
}

export async function generateLore(input: CharacterAgentInput): Promise<{
  lore: string;
  citations?: Citation[];
}>;

export async function generateAppearance(input: CharacterAgentInput): Promise<{
  appearance: string;
  citations?: Citation[];
}>;

export async function generateStats(input: CharacterAgentInput): Promise<{
  stats: IMonsterStats;
  citations?: Citation[];
}>;
```

Each function:
- Builds a focused prompt via the Plan 11 composer with a section-specific task template (`tasks/generateLore.md`, `tasks/generateAppearance.md`, `tasks/generateStats.md`).
- Calls the theme's Bedrock agent with the appropriate tool schema (`tools/submitLore.json`, etc.) — see Plan 11.8.
- Returns only the regenerated section, never the whole character. Callers patch the record.
- KB retrieval policy per Plan 11.8: lore → theme tone only; appearance → light or none; stats → heavy KB grounding for tier/type/AP ranges.

### 4.2 Sprite Iteration (queue + worker) ⬜

Reuses the existing `spriteQueue` and `spriteWorker` (Plan 1.3). On generation, the job:

1. Resolves `targetSize` per Plan 3.7.4 order: `character.assets.targetSizeOverride` → `style.targetSize` → `128` global default.
2. Calls `composeImagePrompt({ styleId, userSubject: character.appearance, ... })` (Plan 3.6).
3. Calls `generationService.generateWithStyle(prompt)` (Plan 3.5) — ComfyUI returns a 1024×1024 RGBA PNG (background already removed by the workflow's `easy imageRemBg` node).
4. Pipes the buffer through `snapAndResize(png, targetSize, kColors=16)` (Plan 3.7.3) — WASM snap, crop 129→128 edge artifact, nearest-neighbor resize to `targetSize` if ≠ 128.
5. Uploads the final PNG to S3.
6. Appends `{ s3Key, seed, composedPositive, composedNegative, styleId, snapSize: targetSize, createdAt }` to `character.assets.rawSpriteCandidates`.
7. Prunes the oldest candidate if length exceeds 20 (deletes S3 object too).

User clicks "Use this sprite" → `POST /api/characters/:id/select-sprite` body `{ s3Key }` → sets `assets.snappedSpriteS3Key` to that key. Other candidates remain in history.

### 4.3 PixelLab Animation (on-demand button) ⬜

Triggered by the "Generate Animations" button. Input: `character.assets.snappedSpriteS3Key`. Pipeline:

1. Download snapped sprite from S3.
2. POST to PixelLab API once per animation type — battle (6 anims, 34 frames) and world (8 directions, 32 frames).
3. Stitch frames into two grid PNGs (`<name>_battle.png`, `<name>_world.png`).
4. Run `generateBattleJSON` / `generateWorldJSON` auto-tagger to produce Aseprite-format JSON.
5. Upload all four files to S3; set `assets.spritesheetS3Key` and `assets.spritesheetJsonS3Key`.

```typescript
// services/generation/pixelLabService.ts
export async function animateSprite(
  baseSprite: Buffer,
  animationType: 'battle' | 'world',
): Promise<Buffer[]>;
```

The PixelLab call shape is the same as the May 8 plan — only its trigger has changed (button instead of pipeline step).

### 4.4 Auto-Tagger (Aseprite JSON Generator) ⬜

Unchanged from May 8 plan. Module: `services/generation/autoTagger.ts` — generates Aseprite-format JSON for either the 6-anim battle sheet or the 8-direction world sheet. Now invoked only by 4.3, not by a pipeline.

### 4.5 Removed scope

The following are explicitly cut from Plan 4:

- The 6-step auto-chain monster job and its monster worker (`monsterWorker.ts` is removed).
- The `monsterQueue` (deleted; replaced by `characterQueue` if we need one — but most operations can run on existing `spriteQueue`).
- `tresExporter.ts` in `services/generation/` — moved to Plan 7 / CB-plan.md (export dispatcher plugin).
- `spriteStitcher.ts` as a generation-pipeline file — folded into 4.3 since stitching is only needed when animation runs.
- Auto-generation of monster stats on creation. Stats are now generated only when the user clicks [Generate] in the Stats section.
- Direct integration of monster generation with QuestBuilder. Instead: QuestBuilder picks an existing character via the character picker (Plan 9.9). Users create characters from the Characters page (Plan 9.7), not from QuestBuilder.

### 4.6 API Routes

```
POST   /api/characters/:id/sections/lore/generate         → enqueue lore regen
POST   /api/characters/:id/sections/appearance/generate   → enqueue appearance regen
POST   /api/characters/:id/sections/stats/generate        → enqueue stats regen
GET    /api/characters/:id/jobs/:queue/:jobId/stream      → SSE per-job (uses Plan 1.4 universal route)

POST   /api/characters/:id/sprite/generate                → enqueue sprite candidate gen
POST   /api/characters/:id/sprite/select                  → body: { s3Key } — set canonical sprite

POST   /api/characters/:id/animate                        → enqueue PixelLab pipeline
POST   /api/characters/:id/export                         → body: { format } — delegates to Plan 7
```

### 4.7 Sub-Tasks

| # | Task | Depends On | Files | Status |
|---|------|------------|-------|--------|
| 4.1 | Character agent (per-section: lore, appearance, stats) | Plan 9.2, Plan 11.5, Plan 11.8 | `services/generation/agents/characterAgent.ts` | ⬜ |
| 4.2 | Sprite iteration queue handler + select endpoint | 3.5, 3.6, 3.7, Plan 9.2 | `workers/spriteWorker.ts` (extended), `controllers/characterController.ts` | ⬜ |
| 4.3 | PixelLab service + animation queue handler | Plan 9.2, 4.2 | `services/generation/pixelLabService.ts`, `workers/characterWorker.ts` | ⬜ |
| 4.4 | Auto-tagger | 4.3 | `services/generation/autoTagger.ts` | ⬜ |
| 4.5 | Per-character export route (delegates to Plan 7 dispatcher) | Plan 7 | `controllers/characterController.ts` | ⬜ |
| 4.6 | Character editor as a dedicated page at `/projects/:projectId/characters/:characterId` + `/new` (with flat redirect aliases). Sections coexist (identity / lore / appearance / stats / sprite / animation / export). Reads `?returnTo` query param for QuestBuilder round-trip. | 4.1, 4.2, 4.3, Plan 9.8 | `pages/Character/CharacterEditor.tsx`, `pages/Character/routes.ts` (redirect aliases) | ⬜ |

---

## Plan 5: Animation Page Rework (PNG + JSON) ⬜

### Goal
Replace the SpriteAnimator stub with a real sprite sheet player that loads Aseprite-format PNG+JSON and plays back animations with controls.

### Architecture

```
─────────────────────────────────────────────────────────────
  SpriteAnimator Page

  ┌──────────────┐  ┌───────────────────────┐  ┌────────────┐
  │  Animation   │  │    Canvas             │  │ Properties │
  │  List        │  │    (Canvas2D)         │  │ Panel      │
  │              │  │  ┌──────────────┐     │  │            │
  │  - idle      │  │  │              │     │  │ Frame W/H  │
  │  - alt_idle  │  │  │   Animated   │     │  │ Duration   │
  │  - windup    │  │  │   Sprite     │     │  │ Loop mode  │
  │  - attack    │  │  │   Preview    │     │  │ Zoom       │
  │  - hurt      │  │  │              │     │  │ Onion skin │
  │  - sleep     │  │  └──────────────┘     │  │            │
  │              │  │                       │  │            │
  └──────────────┘  │  ┌───────────────────┐│  └────────────┘
                    │  │  Timeline Bar     ││
                    │  │  ▶ ‖  ⏭ [frames] ││
                    │  └───────────────────┘│
                    └───────────────────────┘
─────────────────────────────────────────────────────────────
```

### Implementation

#### 5.1 Core: Sprite Sheet Parser ⬜

```typescript
// frontend/src/app/utils/spriteSheetParser.ts

export interface ParsedAnimation {
  name: string;
  frames: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    duration: number;
  }>;
  direction: string;
}

export interface ParsedSpriteSheet {
  image: string;
  imageData?: HTMLImageElement;
  size: { w: number; h: number };
  animations: ParsedAnimation[];
  totalFrames: number;
}

export function parseAsepriteJSON(json: AsepriteJSON): ParsedSpriteSheet {
  const frameList = Object.values(json.frames);

  const animations: ParsedAnimation[] = json.meta.frameTags.map(tag => ({
    name: tag.name,
    frames: frameList.slice(tag.from, tag.to + 1).map(f => ({
      x: f.frame.x,
      y: f.frame.y,
      w: f.frame.w,
      h: f.frame.h,
      duration: f.duration,
    })),
    direction: tag.direction,
  }));

  return {
    image: json.meta.image,
    size: json.meta.size,
    animations,
    totalFrames: frameList.length,
  };
}
```

#### 5.2 Canvas Renderer Component ⬜

```typescript
// frontend/src/app/pages/SpriteAnimator/components/SpriteCanvas.tsx
// Canvas2D, nearest-neighbor scaling, onion skin support
// imageSmoothingEnabled = false for crisp pixel art
```

#### 5.3 Playback Engine Hook ⬜

```typescript
// frontend/src/app/hooks/useSpritePlayback.ts
// RAF-based, per-frame duration from Aseprite JSON
```

#### 5.4 Data Loading

The SpriteAnimator page accepts three input modes:
1. **From character animation output** — load PNG + JSON from S3 via presigned URLs (`?characterId=abc123`), populated when the user runs "Generate Animations" on the character editor (Plan 4.3)
2. **From file upload** — user drops a PNG + JSON file pair
3. **From sprite gallery** — select a previously generated sprite

#### 5.5 File Structure ⬜

```
frontend/src/app/pages/SpriteAnimator/
├── SpriteAnimator.tsx           # Main page (REWRITE)
└── components/
    ├── AnimationsList.tsx       # Left panel (REWRITE)
    ├── SpriteCanvas.tsx         # Center canvas renderer (NEW)
    ├── PlaybackControls.tsx     # Transport controls (REWRITE)
    ├── PropertiesPanel.tsx      # Right panel (REWRITE)
    ├── SpriteUploader.tsx       # Drag-drop PNG+JSON upload (NEW)
    └── FrameTimeline.tsx        # Visual frame strip with scrubbing (NEW)
```

---

## Plan 6: Admin Panel ⬜

### Goal
Create an admin section where you can manage themes, LoRAs, Bedrock agents, knowledge bases, and monitor generation jobs. Bedrock agent IDs are wired here — once saved, quest generation automatically upgrades from Gemini to full Bedrock.

### Pages

```
/admin                            → Admin Dashboard (job stats, system health)
/admin/themes                     → Theme manager (CRUD themes — games + styles)
/admin/themes/:themeId/agent      → Bedrock Agent setup for a theme
/admin/themes/:themeId/kb         → Knowledge Base manager (upload, sync — uses S3 Vectors)
/admin/themes/:themeId/metadata   → Theme metadata editor (tone, naming, rewards)
/admin/themes/:themeId/lora       → LoRA manager (register downloaded LoRA files)
/admin/jobs                       → Job queue monitor (active, completed, failed)
```

### Architecture

```
frontend/src/app/pages/Admin/
├── AdminDashboard.tsx
├── ThemeConfigList.tsx           # List all themes
├── ThemeConfigEditor.tsx         # Create/edit a theme
├── AgentSetup.tsx                # Create/configure Bedrock agents
├── KnowledgeBaseManager.tsx      # Upload KB files, trigger sync (S3 Vectors)
├── ThemeMetadataEditor.tsx       # Edit tone, naming, rewards, dialogue style
├── LoRAManager.tsx               # Register downloaded LoRA files
└── JobMonitor.tsx                # Real-time BullMQ job queue view
```

#### 6.1 Agent Setup Flow (AgentSetup.tsx) ⬜

```
1. Select theme → "Cassette Beasts" or "Generic RPG" or custom
2. Click "Build Knowledge Base"
   → For game themes: upload structured JSON + markdown to S3
     (type_chart.json, all_beasts.json, all_moves.json, world_lore.md)
   → For style themes: admin uploads curated KB files manually
     (RPG trope docs, stat formulas, archetype definitions)
3. Click "Create Bedrock KB"
   → Backend calls AWS Bedrock API:
     - CreateKnowledgeBase (S3 Vectors as vector store)
     - StartIngestionJob (sync KB)
4. Click "Create Bedrock Agent"
   → Backend calls AWS Bedrock API:
     - CreateAgent (with Haiku model, KB access)
     - CreateAgentAlias
     - PrepareAgent
5. Agent ID + Alias ID saved to ThemeConfig in MongoDB
6. Test panel: send a test query, see agent response
→ Quest generation now uses Bedrock agent automatically (no code change)
```

#### 6.2 Backend Admin Routes ⬜

```
GET    /api/admin/themes                       → List all theme configs
POST   /api/admin/themes                       → Create theme config
PUT    /api/admin/themes/:themeId              → Update theme config
DELETE /api/admin/themes/:themeId              → Delete theme config

POST   /api/admin/themes/:themeId/build-kb     → Trigger KB build
POST   /api/admin/themes/:themeId/create-kb    → Create Bedrock KB from S3 (S3 Vectors)
POST   /api/admin/themes/:themeId/sync-kb      → Trigger KB sync/ingestion
POST   /api/admin/themes/:themeId/create-agent → Create Bedrock agent
POST   /api/admin/themes/:themeId/test-agent   → Send test query to agent
DELETE /api/admin/themes/:themeId/agent        → Delete Bedrock agent

GET    /api/admin/jobs                         → List all jobs (paginated)
GET    /api/admin/jobs/:jobId                  → Get job details
POST   /api/admin/jobs/:jobId/retry            → Retry a failed job
DELETE /api/admin/jobs/:jobId                  → Cancel/delete a job
```

#### 6.3 Access Control ⬜

```typescript
// middlewares/adminMiddleware.ts
export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
```

Add `isAdmin: Boolean` to `userModel.ts`.

---

## Plan 7: Export System (Pluggable Formats) ⬜

### Goal
Build a pluggable export system where each format is a self-contained exporter. The export format is stored on the questline and can be changed at any time from the QuestBuilder. Cassette Beasts (Godot 3.5.1 mod) is the first game-specific exporter; JSON is the universal default.

### CB Mod Structure

```
questflow_mod/
├── mod.tres
├── scripts/
│   ├── quest_loader.gd
│   ├── quest_manager.gd
│   ├── dialogue_runner.gd
│   └── monster_injector.gd
├── species/
│   └── wraithand.tres
├── sprites/
│   ├── wraithand.png
│   ├── wraithand.json
│   ├── wraithand_world.png
│   └── wraithand_world.json
├── quests/
│   └── shadow_reach.json
├── dialogue/
│   └── shadow_reach/
│       ├── node_1.dialogue
│       └── node_2.dialogue
└── portraits/
    └── npc_name.png
```

### 7.1 Export Pipeline (Backend) — Pluggable Architecture ⬜

```
backend/src/services/export/
├── index.ts                # Export registry + dispatcher
├── baseExporter.ts         # Abstract base class
├── jsonExporter.ts         # Universal JSON export (default)
├── cassetteBeatsExporter.ts # CB Godot mod export (ZIP)
└── customExporter.ts       # Raw data dump
```

### 7.2 Export Format Switching ⬜

```
POST   /api/questlines/:id/export          → Export using questline's current format
PATCH  /api/questlines/:id/export-format   → Change the export format
       body: { exportFormat: "godot_tres" }
```

**Frontend — QuestBuilder toolbar:**
1. Format dropdown — shows current format, calls PATCH to persist
2. Export button — calls POST, label updates dynamically ("Export as Godot Mod", "Export as JSON", etc.)

### 7.3 Per-Character Export ⬜

Characters and monsters have their own export buttons on the character editor page (Plan 4.5). The dispatcher accepts a `Character` as input, not just a questline.

```
POST   /api/characters/:id/export          → body: { format }
       Valid formats: "tres" | "json" | "png"
```

Each format produces a different artifact from `character.assets`:
- **`tres`** — Godot SpeciesData `.tres` file (CB-plan.md CB-5 plugin). Requires `assets.spritesheetS3Key` if the format expects an animated bestiary entry; falls back to `snappedSpriteS3Key` for static.
- **`json`** — Universal JSON with character fields + presigned S3 URLs for assets.
- **`png`** — Just the snapped sprite, downloaded raw.

A new `characterExporter.ts` base class in `services/export/` mirrors `baseExporter.ts` but is parameterized over `ICharacter` instead of `IQuestline`. The dispatcher routes per `(entityType, format)`.

Why this lives in Plan 7 (not Plan 4): the export plugin pattern is the dispatcher's responsibility. Plan 4 just calls the dispatcher. Adding new export formats later (e.g. Aseprite native, Unity Sprite Library) is a Plan 7 extension that automatically becomes available to characters.

---

## Plan 8: Cassette Beasts Mod Integration

**Moved to [CB-plan.md](CB-plan.md).** Not in scope for this plan.

### Sibling: Design Refresh

The visual / brand refresh (replace purple-coded AI-product styling with a retro/game-flavored dark UI, full audit across tokens / components / pages / marketing) lives in [design-plan.md](design-plan.md). Same status as CB-plan — independent track, not in this parent plan's execution scope. Coordinate timing: design tokens (D-5.1–D-5.5) should land before new pages from Plans 3.9 / 3.10 / 4.6 ship, so those pages inherit the new tokens instead of needing a follow-up restyle.

---

## Plan 9: Projects + Character System Overhaul ⬜

### Goal
Introduce **Projects** as a top-level container that owns many questlines and a shared roster of NPCs and monsters. Graduate NPCs and monsters from "inline children of a questline" to **first-class entities** that can exist independently (orphans), be reused across questlines in a project, and be edited from a dedicated Characters page.

### Why This Matters

Today the data model assumes one-questline-at-a-time. In reality:
- Users want to build **multi-questline campaigns** sharing world, recurring NPCs, and a beast roster (a CB mod with 3 questlines + 8 monsters is a normal scope)
- **Orphan monsters** are a real workflow — generate a beast, then later decide which questline it belongs to (or just keep it as "concept art for the project")
- **Recurring NPCs** — Elder Marlowe gives quest A in chapter 1, gives quest C in chapter 3. Should be one character record, not two
- The CB mod export maps to a Project as **a bundle of independently-installable packages** — one bestiary package + N questline packages, all extracted into `mods/` side-by-side. This means individual questlines can be updated, added, or removed without touching the rest of the project (see [CB-plan.md](CB-plan.md) CB-3 for the wrapper architecture)

### Key Design Decisions

1. **Project is the new top-level unit.** A user has many Projects. A Project has many Questlines, many Characters (NPCs + Monsters), one default theme.
2. **NPCs and Monsters share a base type.** Both are `Character` records with a `kind: 'npc' | 'monster'` discriminator. NPCs have portrait + dialogue traits; monsters have stats + battle/world sprites. Shared fields: name, description, projectId, ownerId, tags.
3. **Characters are project-scoped, not questline-scoped.** This is the breaking change. Currently questlines have inline `characters[]`. After this plan, questlines reference characters by ID, characters live at the project level, and one character can be referenced by many questlines.
4. **Orphans are valid.** A character with no questline references is "unattached" — appears in the Characters page filtered as orphan, doesn't break anything.
5. **Themes are project-default + per-questline lock.** Project has a default theme used for new questlines. Questline still locks its theme at creation (with the visible note explained in Plan 10.7). A project can contain questlines using different themes if the user opts in — but the default makes the common case one click.
6. **Backwards compatibility: ungrouped questlines = "Inbox" project.** On migration, every existing questline without a projectId is moved into an auto-created "Inbox" project per user. No data loss; existing UX still works.
7. **CB mod export gets three modes** (built in [CB-plan.md](CB-plan.md) CB-5.6 / CB-5.7 / CB-5.8):
   - **Single questline** — exports just one questline package. Used for incremental updates after the initial install.
   - **Bestiary only** — exports the project's shared/orphan monsters as one bestiary package. Used to ship monster updates independently of any questline.
   - **Project bundle** — zip-of-folders containing the bestiary + all questlines side-by-side. Used for first-time install of a whole campaign.

   Each questline package declares its bestiary as a soft dependency via `requires_bestiary`. Updating one questline doesn't touch the bestiary or other questlines. Adding a monster to the bestiary doesn't require re-exporting any questlines — they automatically pick up the new species when the bestiary is updated.
8. **Bestiary membership is explicit.** In the QuestFlow UI, each monster character has a flag: questline-only, bestiary, or both. The default is questline-only; QuestFlow auto-suggests bestiary inclusion for any character referenced by 2+ questlines or marked as orphan, and the user confirms.

### Data Model Changes

**New model: `projectModel.ts`**
```typescript
interface IProject {
  ownerId: string;
  title: string;
  description: string;
  themeId: string;          // default theme for new questlines
  exportFormat: string;     // default export format
  createdAt: Date;
  updatedAt: Date;
}
```

**New model: `characterModel.ts`** (replaces inline `questline.characters[]` and Plan 4's `monsterModel`)
```typescript
interface ICharacter {
  ownerId: string;
  projectId: string;
  kind: 'npc' | 'monster';
  name: string;
  description: string;
  appearance: string;
  background: string;
  tags: string[];
  bestiaryMembership?: 'none' | 'bestiary' | 'both';  // monsters only — controls CB export routing (see CB-plan.md)

  // Shared lore/appearance — used by both NPCs and monsters, regenerable per Plan 4.1
  lore?: string;                 // background / story
  // (appearance is already in the shared fields above)

  // NPC-only
  portraitUrl?: string;          // S3 key
  dialogueTraits?: string[];     // e.g. ['gruff', 'mysterious']

  // Monster-only — from Plan 4.1 generateStats agent
  speciesData?: {
    type1: string;
    type2: string;
    base_hp: number;
    base_melee_attack: number;
    base_melee_defense: number;
    base_ranged_attack: number;
    base_ranged_defense: number;
    base_speed: number;
    base_max_ap: number;
    move_tags: string[];
  };

  // S3 assets — populated by Plan 4.2 (sprite iteration) and Plan 4.3 (optional animation)
  assets?: {
    rawSpriteCandidates: Array<{
      s3Key: string;
      seed: number;
      composedPositive: string;
      composedNegative: string;
      styleId: string;
      snapSize: number;              // resolved targetSize used for this candidate (Plan 3.7.4)
      createdAt: Date;
    }>;
    snappedSpriteS3Key?: string;     // user-picked, canonical
    spritesheetS3Key?: string;       // only if "Generate Animations" was run
    spritesheetJsonS3Key?: string;
    targetSizeOverride?: number;     // optional per-character override (Plan 3.7.4); advanced UI
  };

  // No `tresFile` / `battleSprite` / `worldSprite` — those were old auto-pipeline artifacts.
  // Exports are produced on-demand via Plan 7 and streamed, not persisted.

  createdAt: Date;
  updatedAt: Date;
}
```

**Modified: `questlineModel.ts`**
- Add `projectId: string` (required after migration; default to user's "Inbox" project)
- Replace inline `characters: ICharacter[]` with `characterIds: string[]` (refs to Character)
- Quest nodes already use `npcIds: string[]` and `monsterIds: string[]` — those become refs to Character `_id` (with `kind` filtering on read)

### Routes

```
GET    /api/projects                      → List user's projects
GET    /api/projects/:id                  → Project with stats (counts of questlines, characters)
POST   /api/projects                      → Create project
PATCH  /api/projects/:id                  → Update (title, description, default theme, export format)
DELETE /api/projects/:id                  → Delete (cascade: questlines + characters or block if non-empty)

GET    /api/projects/:id/characters       → All characters in project (filter: ?kind=npc|monster, ?orphan=true)
POST   /api/projects/:id/characters       → Create character (manual or trigger generation pipeline)
GET    /api/characters/:id                → Single character
PATCH  /api/characters/:id                → Edit fields
POST   /api/characters/:id/regenerate     → Regenerate a specific field (tied to Plan 10.1)
DELETE /api/characters/:id                → Delete (warn if referenced by questlines)
GET    /api/characters/:id/usage          → List questlines that reference this character

GET    /api/projects/:id/questlines       → All questlines in project
POST   /api/projects/:id/questlines       → Create questline in this project
```

### UI Pages

**`/projects`** — Projects list (cards with counts, last activity)
**`/projects/:id`** — Project dashboard: questlines grid, characters tray (recent), quick actions
**`/projects/:id/characters`** — **Characters page**:
- Tabs: All / NPCs / Monsters / Orphans
- Filters: theme, tag, status (for monsters: generating/ready/failed)
- Grid view (portrait/sprite cards) and list view
- "+ New Character" button → navigates to `/projects/:id/characters/new` (the Character Editor page, in create mode)
- Click a card → navigates to `/projects/:id/characters/:characterId` (the Character Editor page)

**`/projects/:projectId/characters/:characterId`** (and `/new`) — **Character Editor** (dedicated full page, see Plan 4 "Page Structure & Routing"):
- Common fields: name, kind, tags, lore, appearance
- For NPCs: portrait upload/regenerate, dialogue traits picker
- For Monsters: stats panel with per-field locks + [Generate Stats] button (Plan 4.1), sprite candidates grid with [Generate Sprite] / [Use this sprite] (Plan 4.2), optional [Generate Animations] button (Plan 4.3), per-format export buttons (Plan 7.3). No .tres preview — exports are downloads, not stored artifacts.
- Right sidebar: "Used in" — list of questlines + nodes referencing this character
- Per-section [Generate] / [Refine] / [🔒] controls (ties to Plan 10.1 iterative regen)
- **AI authoring assist** (ties to Plan 10.14):
  - "Generate from seed" — top-of-page input ("grumpy old fisherman who lost his son") → AI fills name, appearance, lore, dialogue traits in one pass, grounded in project theme
  - "✨ Generate" button next to every empty field — context-aware, uses already-filled fields + theme as input
  - "✨ Expand" button next to short text — turns a one-line sketch into a paragraph
  - For monsters: bidirectional stats↔description per Plan 4.1 — Generate Stats from filled lore/appearance, or Generate Lore + Appearance from filled stats. Whichever direction; whichever fields are locked stay fixed.
- Flat aliases `/characters/new?projectId=...` and `/characters/:characterId` redirect to the nested form.

**Modified `/quest-builder/:id`** — Character picker:
- "Add NPC/Monster to node" → picker shows project's characters (filtered by kind)
- "+ Create new" inside picker → full-page navigation to the Character Editor with `?returnTo=quest:<questId>:<nodeId>`. On save, the editor navigates back and the new character auto-attaches to the originating node. **Not a modal.**

### Migration Strategy

1. New `Project` collection
2. For each user, create one "Inbox" project
3. For each questline without projectId: set `projectId = inbox._id`
4. For each questline's inline `characters[]`: create Character documents at project scope, replace inline array with `characterIds`
5. For each existing Sprite (from Plan 3 sprite gallery): leave as-is — sprites are not characters. But add a "Convert to Character" button so a user can promote a sprite to a Monster character.
6. Plan 4's `monsterModel` is **superseded** by `characterModel.ts` with `kind: 'monster'`. Build Plan 4's character editor + sectional agents + sprite iteration loop against this unified model — there is no separate `monsterModel` runtime path.

### Phase 9 Sub-Tasks

| # | Task | Depends On | Files | Status |
|---|------|------------|-------|--------|
| 9.1 | Project model + CRUD routes | — | `models/projectModel.ts`, `routes/projectRoute.ts`, `controllers/projectController.ts` | ⬜ |
| 9.2 | Character model (NPC + Monster discriminator) | — | `models/characterModel.ts` | ⬜ |
| 9.3 | Character CRUD routes | 9.2 | `routes/characterRoute.ts`, `controllers/characterController.ts` | ⬜ |
| 9.4 | Migration script: inline characters → Character collection | 9.1, 9.2 | `scripts/migrate-projects.ts` | ⬜ |
| 9.5 | Update Questline model: projectId + characterIds | 9.2 | `models/questlineModel.ts` | ⬜ |
| 9.6 | Projects list + dashboard pages | 9.1 | `pages/Projects/` | ⬜ |
| 9.7 | Characters page (browse, filter, orphan view) | 9.3 | `pages/Project/Characters.tsx` | ⬜ |
| 9.8 | Character Editor page (unified NPC + Monster) | 9.3 | `pages/Character/CharacterEditor.tsx` | ⬜ |
| 9.9 | Quest Builder character picker (use existing or create new) | 9.3, 9.5 | `pages/QuestBuilder/components/CharacterPicker.tsx` | ⬜ |
| 9.10 | Wire Plan 4 character pipeline (sectional agents + sprite loop + animation button) against unified Character model | 9.2, Plan 4 | `workers/characterWorker.ts`, `controllers/characterController.ts` | ⬜ |
| 9.11 | (Wiring CB exporters into UI — moved to [CB-plan.md](CB-plan.md) CB-7.3) | — | — | ⬜ |
| 9.12 | Sprite → Character "promote" flow | 9.2 | `pages/SpriteGenerator/` button | ⬜ |

---

## Plan 10: UX Polish & Iteration Loop ⬜

### Goal
The previous plans build the engine. This plan makes it pleasant to use. Focus areas: iterative AI refinement, in-app playtesting, content discoverability, safety nets, and trust-building (sources, validation, undo).

### 10.1 Iterative Node-Level Regeneration ⬜ **HIGHEST PRIORITY**

The single biggest UX win available. Today the user generates a 30-node questline; if it's 80% right, they regenerate everything. Instead:

- **Per-node regenerate** — right-click any quest node → "Regenerate with constraints" → modal asks "what to change?" (free text + structured options: "make it darker", "shorter", "swap to combat node")
- **Per-field regenerate** — character editor (Plan 9.8) gets a "regenerate" button next to each field (appearance, background, dialogue traits)
- **Locked fields** — when regenerating, user can lock fields they want preserved (the name stays, the rest gets rewritten)
- **Backend** — new `POST /api/quests/nodes/:id/regenerate` and `POST /api/characters/:id/regenerate-field` routes. Both build a focused prompt with locked context, send to Bedrock/Gemini, return updated content.

### 10.2 In-App Playtest Mode ⬜

Walk through the questline as a player would, in-app, before exporting:

- **`/questlines/:id/playtest`** — opens a panel that simulates the quest engine
- Shows current NPC dialogue
- Shows player choice options (when branches exist)
- Logs path taken
- Detects dead ends ("this dialogue has no continuation")
- Detects unreachable nodes ("the following nodes were never visited under any branch")
- "Export" button at the end to commit the questline

Implementation: a TypeScript port of the GDScript quest engine logic from [CB-plan.md](CB-plan.md) CB-4.1, just enough to walk the graph. Doesn't need to render battles or generate visuals — just text + flow.

### 10.3 Quest Validation Pass ⬜

Cheap automated checks runnable on demand and before export:

- Are all nodes reachable from the start node?
- Are there leaf nodes without rewards or terminal dialogue?
- Are there orphan NPCs (referenced by no node)?
- Do any nodes reference deleted character IDs?
- Are there cycles that can't terminate?

Result: a side panel listing warnings/errors with "jump to node" links. Export is allowed with warnings, blocked on errors.

### 10.4 Recent Jobs Tray ⬜

A persistent floating tray (bottom-right) on every page showing active and recently completed BullMQ jobs (sprite, monster, quest gen). Clicking a job opens its result. Ties Plan 4's multi-minute pipeline to a "leave the page, come back" UX.

- Reads from a shared client-side store fed by SSE streams
- Persists across page navigations (mounted at app shell level)
- Shows progress for active jobs, status for completed ones
- "Cancel" button on active jobs

### 10.5 Sources Panel for AI Outputs ⬜

When Bedrock + KB lands (Plan 6.9), every AI output should expose **which KB chunks it cited**. Bedrock's `RetrieveAndGenerate` API returns citation metadata — surface it.

- Each AI-generated field has a small "ⓘ Sources" toggle
- Expanding shows the KB document names and excerpts that influenced the generation
- Builds user trust ("the agent isn't hallucinating"), aids debugging, helps users learn the theme's source material

### 10.6 Sprite + Character Tagging, Search, Favorites ⬜

The sprite gallery is flat. As soon as a user has 20+ sprites, finding anything is painful. Same will apply to the Characters page.

- Add `tags: string[]` and `favorite: boolean` to Sprite + Character models (Character already has tags from Plan 9)
- Search bar on gallery and character list
- Filter chips by tag
- "Pin to favorites" star icon on cards
- Auto-suggest tags from the prompt text (e.g. "wolf, forest, dark" → suggest those tags on save)

### 10.7 Theme Lock Visibility + Theme Expansion ⬜

Themes are locked at questline creation (clarified design decision). Add UI affordances:

- On the questline create wizard: theme picker shows "Locked after creation — you can change individual nodes' tone but not swap the theme"
- On QuestBuilder header: theme badge showing the current theme + tooltip explaining the lock
- **Theme expansion** is supported — admins can add new dialogue rules, rewards, or naming patterns to a theme via Plan 6 admin panel. Those changes propagate to *future* generations using that theme but don't retroactively rewrite existing content.
- Document the trade-off explicitly in the in-app help

### 10.8 Questline Snapshots / Undo ⬜

Quest editing is destructive (regenerate a node, edit a field — old content gone). Build minimum-viable version history:

- New `QuestlineSnapshot` collection: `{ questlineId, snapshot: <full questline JSON>, reason: 'auto-save' | 'pre-regenerate' | 'manual', createdAt }`
- Snapshot on: every regeneration, every export, manual "save snapshot" button
- Cap at 20 snapshots per questline (FIFO eviction)
- Restore button reverts the questline to a snapshot
- Side panel showing snapshot history with diff preview

### 10.9 Read-Only Share Links ⬜

Users want to show questlines to friends. Currently impossible without screenshots.

- "Share" button on questline → generates a public read-only URL with a random token
- `GET /share/:token` returns the questline graph in a stripped-down read-only viewer
- Token revocable from the questline settings
- No auth required to view

### 10.10 Export Preview Tree ⬜

Before clicking Export, show what the zip will contain:

- Side panel on QuestBuilder showing the file tree of the would-be export
- File counts and total size estimate
- Highlights what's missing ("no monsters attached — bestiary will be empty")
- Prevents the "I downloaded a 200-byte zip and didn't notice" failure mode

### 10.11 Questline Import (JSON) ⬜

Plan 7 has JSON exporter. Build the matching importer.

- `POST /api/projects/:id/questlines/import` — accepts JSON file, validates schema, creates questline + characters in the target project
- "Import questline" button on Projects dashboard
- Round-trip: export → import produces an identical questline (modulo IDs)
- Enables sharing questlines as files between users / instances

### 10.12 Usage / Cost Tracking (Admin) ⬜

Every Bedrock call, ComfyUI run, PixelLab call costs money. Track per-user spend before usage scales.

- New `UsageEvent` collection: `{ userId, service, action, units, costEstimate, createdAt }`
- Hooks in: Bedrock client wrapper, ComfyUI service, PixelLab service
- Admin dashboard panel: per-user totals, per-service breakdowns, daily/weekly/monthly views
- (Future) per-user quotas / rate limits — out of scope here, but the data model supports it

### 10.14 AI Authoring Assist for Characters ⬜

Plan 9.8 lists this as a feature of the Character Editor; this section nails down the backend and the deeper interactions.

**Per-field assist (lightweight)**
- `POST /api/characters/:id/assist` body `{ field: 'appearance' | 'background' | ..., mode: 'generate' | 'expand', userHint?: string, lockedFields: string[] }`
- Builds a focused prompt: project theme context + already-filled-and-locked fields + the user's hint + an instruction tailored to the field
- Returns the proposed text — the UI shows it as a diff/suggestion the user can accept or edit
- Cheap, single-turn, latency target ~2–4s

**Generate-from-seed**
- `POST /api/characters/:id/assist-full` body `{ seed: string }`
- One pass that fills all empty fields coherently from the seed
- Uses the project's theme agent (Bedrock once available, Gemini fallback)
- Useful when starting from a blank character — bypasses the per-field shuffle

**Cross-field consistency check**
- `POST /api/characters/:id/check-consistency`
- Returns a list of contradictions ("appearance says young, background says veteran of three wars")
- "Fix" button on each — invokes assist with the conflicting fields targeted

**Conversational refinement (heavier — flag as v2 of this feature)**
- Right-rail chat panel on the Character Editor
- Stateful conversation tied to the character: "make him more sympathetic", "give him a secret tied to the cult faction", "what does his voice sound like?"
- AI proposes patches to specific fields; user accepts per-patch
- Backed by Bedrock agent with the character's current state + project theme + chat history in context window
- Higher complexity (state management, diff UI, partial accept) — split out if velocity matters

**Monster-specific assist**
- "Stats from description" — Bedrock query against the theme's KB to map prose → stat block within the KB's stat range conventions. Returns proposed stats with reasoning ("high speed because the description emphasizes hit-and-run")
- "Description from stats" — inverse: prose generation grounded in the stat shape and the theme's tone

**Why split from Plan 10.1:**
- Plan 10.1 = "regenerate something I already have, with constraints"
- Plan 10.14 = "help me write something I don't have yet, from scratch or a sketch"
- Different prompts, different UI, different mental model. Same underlying agent infrastructure.

### 10.13 Wizard → Builder Onboarding Bridge ⬜

After the QuestCreate wizard finishes and dumps the user into QuestBuilder, the graph is overwhelming.

- First-time-only overlay highlighting: "this is your start node", "click any node to edit", "drag to connect", "right-click for regenerate"
- Dismissible, marked complete in user prefs
- "Suggested next step" indicator on the node most likely to need editing (e.g. nodes with empty bodies, missing NPCs)

### Phase 10 Sub-Tasks

| # | Task | Depends On | Files | Status |
|---|------|------------|-------|--------|
| 10.1 | Iterative node + field regeneration (backend + UI) | 2.3, 9.8 | `controllers/questGenerationController.ts`, `controllers/characterController.ts`, QuestBuilder + Character editor UI | ⬜ |
| 10.2 | In-app playtest mode | — | `pages/QuestBuilder/Playtest.tsx`, `services/questEngine.ts` (TS port of GD runtime) | ⬜ |
| 10.3 | Quest validation pass | — | `services/validation/questValidator.ts`, validation panel UI | ⬜ |
| 10.4 | Recent Jobs tray | 1.6 | `app/components/JobsTray.tsx`, shared SSE store | ⬜ |
| 10.5 | Sources panel for AI outputs | 6.9 | `services/bedrock/agentService.ts` citation passthrough, UI toggles | ⬜ |
| 10.6 | Tagging, search, favorites (sprites + characters) | 9.2 | `models/spriteModel.ts`, `models/characterModel.ts`, gallery + character list UI | ⬜ |
| 10.7 | Theme lock visibility + theme expansion docs | 6.5 | Wizard + QuestBuilder UI, admin docs | ⬜ |
| 10.8 | Questline snapshots / undo | — | `models/questlineSnapshotModel.ts`, snapshot middleware, restore UI | ⬜ |
| 10.9 | Read-only share links | — | `routes/shareRoute.ts`, `pages/SharedQuestline.tsx` | ⬜ |
| 10.10 | Export preview tree | 7.6 | QuestBuilder side panel | ⬜ |
| 10.11 | Questline import (JSON) | 7.2, 9.5 | `controllers/questlineImportController.ts`, Projects dashboard button | ⬜ |
| 10.12 | Usage / cost tracking (admin) | 6.4 | `models/usageEventModel.ts`, hooks in Bedrock/ComfyUI/PixelLab clients, admin panel | ⬜ |
| 10.13 | Wizard → Builder onboarding bridge | — | QuestBuilder first-run overlay, user prefs flag | ⬜ |
| 10.14 | AI authoring assist for characters (per-field, generate-from-seed, consistency, monster stats↔desc) | 9.8 | `controllers/characterController.ts` (assist routes), Character Editor UI | ⬜ |

---

## Plan 11: Prompt Architecture ⬜

### Goal
Define the prompt structure for every AI generation endpoint so output is **grounded in KB constraints, structurally reliable (parseable JSON), and stylistically consistent across themes**. This plan is the missing layer between "we have a Bedrock agent" (Plan 2) and "we generate quests" (Plan 2.3, Plan 4, Plan 9.10) — it nails down *how* the agent is asked.

### Key Design Principles

1. **Three-layer prompt assembly.** Every generation prompt is composed of three layers, in this order:
   - **System prompt (per agent)** — role, output discipline, hard rules. Defined once per ThemeConfig.
   - **Context block** — KB grounding + theme metadata + project state, retrieved per request.
   - **Task block** — the specific instruction (generate questline / regenerate node / fill character field) with the user's input and any locked fields.
2. **Structured output via tool use, not prose parsing.** Bedrock + Claude support function/tool calling. Every generation endpoint defines a tool with a strict JSON schema; the agent "calls" the tool and the tool input becomes the parsed result. No regex, no fragile JSON-from-prose extraction.
3. **KB grounding instructions are explicit.** The system prompt teaches the agent: *use the KB as constraints, not as a catalog*. We invent freely; we just stay within the rules. This phrasing matters — without it the agent tends to copy-paste from KB chunks.
4. **Locked fields are first-class.** Every regen/refine endpoint accepts a `lockedFields` array. The task block instructs the agent: "these values are fixed, do not change them, generate everything else around them."
5. **Theme metadata is always injected, KB retrieval is conditional.** `GameTheme` (tone, naming, dialogue style) is small and goes in every prompt. KB retrieval is potentially expensive — only invoked when the task actually needs grounding (quest generation, monster stats, reward balancing — not character appearance refinement).
6. **Per-theme system prompts, shared task templates.** The system prompt varies by ThemeConfig (CB agent vs Generic RPG agent). Task templates are universal — the same `generateQuestline` task block works for any theme because it inserts theme-specific context dynamically.

### 11.1 System Prompt Templates ⬜

Stored in `services/prompts/system/` as `.md` files. Loaded once per Bedrock agent at agent creation time (Plan 6.6).

**`cassette_beasts.md`** — see [CB-plan.md](CB-plan.md) (CB-1.4) for the CB system prompt.

**`generic_rpg.md`** (Generic RPG-themed agent system prompt):
```
You are the Generic RPG content agent for QuestFlow.

ROLE
You help users design quests, monsters, NPCs, and rewards for
high/low fantasy RPGs in the spirit of D&D, JRPGs, and Western
CRPGs.

GROUNDING RULES (HARD)
You have access to a Knowledge Base containing:
  - Stat formulas (HP, attack, defense, speed by level)
  - Common archetypes (warrior, mage, rogue, etc.)
  - Quest pattern library (fetch, escort, hunt, mystery, etc.)
  - Trope catalog (mentor's death, hidden heir, lost city, etc.)
  - Reward rarity tiers and stat conventions
  - Naming conventions per cultural inflection (Tolkienesque,
    Norse, Greek, etc.)

You MUST:
  - Place stats within documented ranges for the requested tier.
  - Match the user's chosen sub-style (high fantasy, dark fantasy,
    grimdark, etc.) consistently across all generated content.

You SHOULD:
  - Invent original characters, monsters, locations, and quests.
  - Use the KB as guardrails, not as content to copy.
  - Mix archetypes and tropes in unexpected ways.

OUTPUT DISCIPLINE
[same tool-call discipline as above]
```

### 11.2 Tool Schemas (Structured Output) ⬜

Stored in `services/prompts/tools/`. Each generation endpoint defines a Bedrock agent action group with a tool whose JSON schema describes the expected output. The agent "calls" the tool; the input it provides IS the structured output.

**`tools/generateQuestline.json`** (abbreviated):
```json
{
  "name": "submit_questline",
  "description": "Submit the generated questline. Always call this tool. Do not write prose outside the tool call.",
  "input_schema": {
    "type": "object",
    "required": ["title", "description", "nodes", "edges", "characters", "rewards"],
    "properties": {
      "title": { "type": "string", "maxLength": 80 },
      "description": { "type": "string", "maxLength": 400 },
      "nodes": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["nodeId", "title", "body", "variant"],
          "properties": {
            "nodeId":    { "type": "string", "pattern": "^node_[a-z0-9_]+$" },
            "title":     { "type": "string", "maxLength": 60 },
            "body":      { "type": "string", "maxLength": 600 },
            "variant":   { "enum": ["story", "combat", "dialogue", "treasure"] },
            "npcRefs":     { "type": "array", "items": { "type": "string" } },
            "monsterRefs": { "type": "array", "items": { "type": "string" } },
            "rewardRefs":  { "type": "array", "items": { "type": "string" } }
          }
        }
      },
      "edges": { /* { from: nodeId, to: nodeId } */ },
      "characters": { /* full Character objects with name, appearance, background */ },
      "rewards":    { /* { name, description, rarity } */ },
      "error":      { "type": "string", "description": "Set if the request cannot be fulfilled." }
    }
  }
}
```

Other tools: `submit_monster`, `submit_character`, `submit_node_regenerate`, `submit_field_regenerate`, `submit_consistency_check`.

### 11.3 Context Block Builders ⬜

`services/prompts/context.ts` — assembles the per-request context block from:

```typescript
interface ContextBlock {
  theme: GameThemeContext;        // tone, naming, rewards, dialogue (always)
  projectSummary?: string;         // if part of a Project, the project's description + existing characters/questlines summary
  kbRetrieval?: string;            // KB chunks retrieved for this specific task (when grounding needed)
  existingState?: string;          // for refinement: current node/character JSON
  lockedFields?: string[];         // for regen: field names to preserve
  userHints?: string;              // free-text user input ("make it darker")
}

function renderContextBlock(ctx: ContextBlock): string {
  return `
<theme>
${formatTheme(ctx.theme)}
</theme>

${ctx.projectSummary ? `<project_context>\n${ctx.projectSummary}\n</project_context>` : ''}

${ctx.kbRetrieval ? `<kb_grounding>\n${ctx.kbRetrieval}\nUse these as constraints, not as content to copy.\n</kb_grounding>` : ''}

${ctx.existingState ? `<existing>\n${ctx.existingState}\n</existing>` : ''}

${ctx.lockedFields?.length ? `<locked_fields>\nThe following fields must NOT change:\n${ctx.lockedFields.map(f => `  - ${f}`).join('\n')}\n</locked_fields>` : ''}

${ctx.userHints ? `<user_hint>\n${ctx.userHints}\n</user_hint>` : ''}
`.trim();
}
```

XML-style tags are used because Claude is well-trained on them — they're more reliable than markdown headings for delimiting prompt sections.

### 11.4 Task Templates ⬜

Stored in `services/prompts/tasks/` as `.md` files with `{{placeholder}}` syntax. Each generation endpoint loads the appropriate template and fills it.

**`tasks/generateQuestline.md`**:
```
Generate a complete questline for the player.

REQUIREMENTS
  - Between {{minNodes}} and {{maxNodes}} nodes
  - At least one combat node and at least one treasure/reward node
  - A clear narrative arc (setup, complication, resolution)
  - All nodes must be reachable from the start node
  - All leaf nodes must have a reward or terminal dialogue

USER STORY PROMPT
{{storyPrompt}}

USER PREFERENCES
  - Genre: {{genre}}
  - Export format: {{exportFormat}}

Call the `submit_questline` tool with your generated content.
```

**`tasks/regenerateNode.md`**:
```
Regenerate the following quest node.

The node currently looks like this — preserve its structure and any
locked fields, but rewrite the rest according to the user's hint.

USER HINT
{{userHint}}

Examples of common hints and how to interpret them:
  - "make it darker" → shift tone of body text, dialogue, and rewards
  - "shorter" → reduce body length by ~50%, simpler choices
  - "swap to combat" → change variant to "combat", add monsterRefs
  - "tie into faction X" → weave the named faction into the body

Call the `submit_node_regenerate` tool with the updated node.
```

**`tasks/generateMonster.md`**:
```
Generate an original monster that fits the theme's KB constraints.

USER SEED
{{seed}}

REQUIREMENTS
  - Stats must fall within the tier indicated by the seed (or starter
    tier if not specified)
  - Type(s) must come from the official type chart
  - Moves must use AP costs in the allowed range
  - The monster's name and lore must NOT match any documented monster
    in the KB — invent something original
  - The monster's design language should fit the theme's visual tone

Call the `submit_monster` tool with the full SpeciesData.
```

**`tasks/assistCharacterField.md`** (for Plan 10.14):
```
The user is editing a {{kind}} character. They've asked for help
filling the `{{field}}` field.

Use the existing filled fields as context. The new value for
`{{field}}` must be consistent with them. Do NOT change other fields.

MODE: {{mode}}
  - "generate" → produce a new value from scratch
  - "expand" → take the existing short text in `{{field}}` and turn
    it into a fuller paragraph, preserving its core idea

Call the `submit_field_regenerate` tool.
```

### 11.5 Prompt Composer ⬜

`services/prompts/composer.ts` — single entry point that assembles a system prompt + context block + task block into the final agent invocation.

```typescript
interface ComposeOpts {
  themeId: string;
  taskTemplate: string;            // 'generateQuestline' | 'regenerateNode' | etc.
  taskVars: Record<string, string>;
  context: ContextBlock;
  toolSchema: object;
}

interface ComposedPrompt {
  systemPrompt: string;            // loaded from system/<themeAgentSlug>.md
  userMessage: string;             // contextBlock + taskBlock
  tools: object[];                 // [toolSchema]
  toolChoice: { type: 'tool', name: string };  // force the agent to call this tool
}

export async function composePrompt(opts: ComposeOpts): Promise<ComposedPrompt> {
  const theme = await ThemeConfigModel.findById(opts.themeId).lean();
  const systemPrompt = await loadSystemPrompt(theme.systemPromptKey);

  const contextBlock = renderContextBlock(opts.context);
  const taskBlock    = await renderTaskTemplate(opts.taskTemplate, opts.taskVars);

  return {
    systemPrompt,
    userMessage: `${contextBlock}\n\n${taskBlock}`,
    tools: [opts.toolSchema],
    toolChoice: { type: 'tool', name: opts.toolSchema.name },
  };
}
```

The composer is what `agentService.invokeAgent()` (Plan 2.1) ultimately consumes. Today `agentService` takes a raw prompt string; after Plan 11 it takes a `ComposedPrompt` and uses Bedrock's tool-calling API.

### 11.6 KB Retrieval Strategy (When to Ground) ⬜

Not every generation needs KB retrieval. Calling `RetrieveAndGenerate` adds latency and cost. The rule:

| Generation Task | KB Retrieval? | Reason |
|---|---|---|
| Generate questline | ✅ Required | Needs locations, factions, world lore for grounding |
| Generate monster stats | ✅ Required | Needs type chart, stat ranges, move taxonomy |
| Generate reward | ✅ Required | Needs item economy, rarity tiers |
| Generate NPC backstory | ⚠️ Conditional | Retrieve only if the project's existing characters reference factions in the KB |
| Regenerate node body | ⚠️ Conditional | Retrieve only if user hint mentions a faction/location/system |
| Refine character appearance | ❌ Skip | Aesthetic field, no mechanical grounding needed |
| Expand a sketch into a paragraph | ❌ Skip | Stylistic, theme tone in system prompt is enough |
| Cross-field consistency check | ❌ Skip | Internal logic, no external constraints |

When retrieval is needed, the composer queries the KB with a task-specific query string (e.g. for `generateMonster`: "type chart, stat ranges for {{tier}} tier, move AP costs"). Retrieved chunks go into `context.kbRetrieval`.

### 11.7 Image Prompt Composition ⬜

Text generation goes through `composer.ts` (11.5). Image generation needs an analogous module — `services/generation/imagePromptComposer.ts` — because the same problems apply: prompts assembled ad-hoc in the worker drift between code paths, are impossible to debug, and quietly degrade output quality.

#### Three-layer image prompt assembly

Every image generation prompt is composed of three layers, in this order:

- **Trigger words** — collected from every entry in `Style.loras` that declares a `triggerWord` (typically just the style LoRA — DMD2 has none). E.g. `cbstyle`. Joined with commas if multiple.
- **Style prefix** — comes from `Style.promptPrefix`, e.g. `"monster creature, pixel art, clean outline,"`. This is the curated "how it should look" half. Tuned per style by whoever maintains the catalog.
- **User subject** — what the user actually typed, e.g. `"a fire dragon with horns and lava-cracked skin"`.

Final positive: `"{triggers}, {prefix} {userSubject}"` (triggers section omitted if no LoRA has one).

Final negative: `style.negativePrompt` (always) `+ ", " + userExtraNegative` (if supplied).

#### Why this matters

The current code path has three problems:
1. `loraService.ts` exports a shared `DEFAULT_NEGATIVE` constant. It includes phrases like "human face", "human hands", "symmetrical body", "bright happy colors" — which actively fight Cassette Beasts-style creatures (often colorful, often symmetrical, often have faces). The negative is sabotaging the generation. Per-style negatives fix this.
2. The user is implicitly expected to write style cues ("pixel art, vibrant, detailed") in their prompt. This is brittle and inconsistent — different users will write different cues and get different results from the same style. Moving style cues into the Style config makes generations reproducible.
3. The trigger word is currently prepended manually in `patchLoraWorkflow` ([loraService.ts:48](backend/src/services/generation/loraService.ts#L48)). Centralizing in the composer makes it consistent and testable, and the worker stops knowing about prompt strings at all.

#### User-facing rule

Surface in the SpriteGenerator UI tooltip:

> *Describe the creature, not the art style. Write "a fire dragon with horns and lava skin" — not "pixel art fire dragon with sharp pixels." The selected Style already handles the art direction.*

#### Composer signature

```typescript
export interface ComposedImagePrompt {
  positive: string;
  negative: string;
  checkpoint: string;
  loras: StyleLora[];               // ordered: style LoRA(s) + DMD2
  sampler: StyleSamplerParams;
  dimensions: { width: number; height: number };
}

export function composeImagePrompt(opts: {
  styleId: string;
  userSubject: string;
  extraNegative?: string;
  dimensionsOverride?: { width: number; height: number };
}): ComposedImagePrompt;
```

`generationService.generateWithStyle(prompt: ComposedImagePrompt)` is the single entry point for image generation. The worker calls `composeImagePrompt` first, then passes the result to the generator. The same composer is used by the monster pipeline (Plan 4) so monster sprite generation gets the same style discipline for free.

#### Trace fields (for debugging)

Every generated sprite stores the composed prompt fields on its DB record:

```typescript
{
  styleId: string;
  composedPositive: string;
  composedNegative: string;
  checkpoint: string;
  loras: Array<{ filename: string; strength: number; strengthClip: number }>;
  samplerParams: StyleSamplerParams;
}
```

When a generation looks wrong, the admin can read the exact prompt that was sent — same idea as `promptTrace` for text generations (11.8 below).

### 11.8 Character Section Agents ⬜

Plan 4 introduces three independently-callable agents on the character editor page: lore, appearance, and stats. Each is a thin task template + tool schema + KB-retrieval policy on top of the existing composer (11.5).

#### Task templates

- **`tasks/generateLore.md`** — generates a 1-3 paragraph background/history. Variables: `{{kind}}`, `{{name}}`, `{{existingAppearance}}`, `{{existingStats}}`, `{{userHint}}`, `{{lockedFields}}`. Tone reference: theme system prompt.
- **`tasks/generateAppearance.md`** — generates a 1-2 paragraph physical description suitable for direct use as the sprite-generation subject (Plan 3.6 composer). Variables: same as lore. Output must be visually concrete (forms, colors, distinctive features) — never abstract ("looks mysterious" is bad; "tall, lean figure with ash-grey skin and four glowing yellow eyes" is good).
- **`tasks/generateStats.md`** — generates the full `speciesData` block (types, base stats, AP, move tags). Monsters only. Variables: same as lore + `{{tier}}` (starter / mid / late / legendary).

#### Tool schemas

- **`tools/submitLore.json`** — `{ lore: string }`.
- **`tools/submitAppearance.json`** — `{ appearance: string }`.
- **`tools/submitStats.json`** — full `speciesData` JSON schema, with `type1`/`type2` constrained to the theme's type chart (CB: 16 types; Generic RPG: open enum).

#### KB retrieval policy per section

| Section | KB Retrieval | Why |
|---|---|---|
| Lore | ❌ Skip | Theme system prompt carries the tone; lore is invention, not grounded fact. KB call would add latency for no quality gain. |
| Appearance | ❌ Skip | Same reason — invention, no mechanical constraints. |
| Stats | ✅ Heavy | Stats must respect type chart, tier ranges, AP cost ranges, move taxonomy. Without KB retrieval the agent guesses values that break game balance. |

This per-section policy is wired in `services/prompts/retrieval.ts` (Plan 11.6).

#### Bidirectional flow

Generating lore with stats locked → agent reads stats from context, invents background consistent with them.
Generating stats with lore locked → agent reads lore from context, picks types/stats that fit the narrative (a "swamp drifter" with high speed + Water/Plastic typing, not a Fire tank).

This works without special-case code because the context block (Plan 11.3) always includes the full character record, and the task template instructs the agent to honor `lockedFields`. The "direction" is implicit in which fields are locked.

### 11.9 Source Citation Passthrough ⬜

Bedrock's `RetrieveAndGenerate` returns citation metadata showing which KB chunks influenced the generation. The composer captures this metadata and the controller returns it alongside the generated content:

```typescript
interface GenerationResult<T> {
  content: T;                      // parsed tool input
  citations?: Array<{
    documentName: string;
    chunkText: string;
    relevanceScore: number;
  }>;
  promptTrace?: {                  // for admin debugging
    systemPromptKey: string;
    taskTemplate: string;
    contextSize: number;
    kbChunksRetrieved: number;
    inputTokens: number;
    outputTokens: number;
  };
}
```

Citations feed Plan 10.5 (Sources Panel for AI Outputs). `promptTrace` feeds Plan 10.12 (Usage / Cost Tracking) and the admin Job Monitor (Plan 6.8).

### 11.10 Iterative Regen Prompt Deltas ⬜

When a user hits "Regenerate this node, keep the title, make it darker," the prompt assembly differs from a fresh generation only in the context block:

| Layer | Fresh generation | Regenerate |
|---|---|---|
| System prompt | Same | Same |
| `<theme>` | Same | Same |
| `<project_context>` | Same | Same |
| `<kb_grounding>` | Retrieved if needed | Retrieved if needed |
| `<existing>` | Absent | Current node JSON |
| `<locked_fields>` | Absent | `["title"]` |
| `<user_hint>` | Story prompt | "make it darker" |
| Task template | `generateQuestline.md` | `regenerateNode.md` |
| Tool | `submit_questline` | `submit_node_regenerate` |

The system prompt, theme context, and KB grounding don't change — that infrastructure carries over. This means iterative regen is *cheap* in terms of prompt-engineering surface area: every endpoint inherits the same theme + grounding for free.

### 11.11 Prompt Versioning ⬜

System prompts and task templates are versioned. Each ThemeConfig stores `systemPromptVersion` and `taskTemplateVersion`. When prompts are edited:

- Version bumps automatically (filename suffix or git-tracked checksum)
- Existing ThemeConfigs continue using their pinned version until manually upgraded via the admin panel
- The Job Monitor records which prompt version each generation used — so when output quality regresses you can correlate to a prompt change

This is critical because prompt changes can silently degrade output quality across an entire theme. Without versioning + traceability, debugging "why did all my quests get worse last week" is impossible.

### Sub-Tasks

| # | Task | Depends On | Files | Status |
|---|------|------------|-------|--------|
| 11.1 | System prompts (one per ThemeConfig) | 2.2 | `services/prompts/system/<themeKey>.md` | ⬜ |
| 11.2 | Tool schemas for every generation endpoint | — | `services/prompts/tools/*.json` | ⬜ |
| 11.3 | Context block builder | 2.2 | `services/prompts/context.ts` | ⬜ |
| 11.4 | Task templates (questline, monster, character, regenerate, assist, consistency) | 11.2 | `services/prompts/tasks/*.md` | ⬜ |
| 11.5 | Prompt composer (single entry point) | 11.1-11.4 | `services/prompts/composer.ts` | ⬜ |
| 11.6 | KB retrieval router (per-task retrieval policy) | 2.1, 11.5 | `services/prompts/retrieval.ts` | ⬜ |
| 11.7 | Image prompt composer + per-sprite prompt trace fields | 3.4 | `services/generation/imagePromptComposer.ts`, `models/spriteModel.ts` | ⬜ |
| 11.8 | Character section agents (lore, appearance, stats) — task templates + tool schemas + per-section KB policy | 11.2, 11.4, 11.5, 11.6, Plan 9.2 | `services/prompts/tasks/generate{Lore,Appearance,Stats}.md`, `services/prompts/tools/submit{Lore,Appearance,Stats}.json` | ⬜ |
| 11.9 | Citation + prompt trace passthrough (text) | 11.5 | `services/bedrock/agentService.ts` extension | ⬜ |
| 11.10 | Wire all generation endpoints through the composer | 11.5, 11.7, 11.8 | `controllers/questGenerationController.ts`, `characterController.ts`, `workers/spriteWorker.ts` | ⬜ |
| 11.11 | Prompt versioning + Job Monitor trace recording | 6.8, 11.9 | `models/themeConfigModel.ts`, admin UI | ⬜ |

### Why This Plan Now

Without prompt architecture defined upfront, every generation endpoint reinvents prompt assembly inconsistently. You'll end up with `questGenerationController.ts` building prompts one way, `characterController.ts` another way, the regen endpoint a third way — and when output quality regresses, you can't correlate it to anything. By centralizing on the composer + tool-calling pattern from the start:

- Every endpoint behaves predictably (always JSON, always grounded the same way)
- Adding a new theme = write one system prompt + (optionally) seed a new KB. All existing endpoints work for it instantly.
- Adding a new generation endpoint = write one task template + one tool schema. Composer handles the rest.
- Output quality is debuggable because every generation has a recorded trace.

---

## Implementation Priority & Dependencies

### Phase 1: Foundation ✅ COMPLETE

| # | Task | Status | Files |
|---|------|--------|-------|
| 1.1 | Add Redis + BullMQ, create queue infrastructure | ✅ | `queues/`, `connection.ts` |
| 1.2 | Migrate sprite generation to BullMQ worker | ✅ | `workers/spriteWorker.ts`, deleted `jobQueue.ts` |
| 1.3 | Create Monster model in MongoDB | ✅ | `models/monsterModel.ts` |
| 1.4 | Create ThemeConfig + GameTheme models | ✅ | `models/themeConfigModel.ts`, `gameThemeModel.ts` |
| 1.5 | Create Bedrock client + agent service | ✅ | `services/bedrock/` |
| 1.6 | Create universal SSE job streaming route | ✅ | `routes/jobRoute.ts` |

### Phase 2: Theme-Grounded Quest Generation ✅ COMPLETE

| # | Task | Status | Files |
|---|------|--------|-------|
| 2.1 | Create GameTheme model + seed both themes | ✅ | `models/gameThemeModel.ts`, `seedThemes.ts` |
| 2.2 | Add themeId + exportFormat to questline | ✅ | `models/questlineModel.ts` |
| 2.3 | Theme-aware quest generation (all 3 endpoints) | ✅ | `controllers/questGenerationController.ts` |
| 2.4 | ComfyUI LoRA service + cbstyle workflow | ✅ | `services/generation/loraService.ts` |
| 2.5 | Build KB files + create Bedrock agents in AWS | ⬜ | Done in Phase 6 admin panel |

### Phase 3: Sprite Generator Rework ⬜ IN PROGRESS

| # | Task | Depends On | Files | Status |
|---|------|------------|-------|--------|
| 3.1 | (built) ComfyUI service + worker | — | `services/generation/loraService.ts`, `workers/spriteWorker.ts` | ✅ |
| 3.2 | (built) SpriteJobData types | — | `queues/spriteQueue.ts`, `controllers/spriteController.ts` | ✅ |
| 3.3 | (built) SpriteModel (styleId + negativePrompt) | — | `models/spriteModel.ts` | ✅ |
| 3.4 | Static Style Catalog (config + types) | — | `backend/src/config/styles.ts` | ⬜ |
| 3.4-mig | ThemeConfig migration → `defaultStyleId` | 3.4 | `models/themeConfigModel.ts`, migration script | ⬜ |
| 3.5 | Generalize workflow into `sdxl_power_lora.json` (Power Lora Loader, DMD2 always); rename `loraService` → `generationService`; delete `base.json` + `DEFAULT_NEGATIVE` | 3.4 | `services/generation/workflows/sdxl_power_lora.json`, `services/generation/generationService.ts` | ⬜ |
| 3.6 | Image prompt composer (positive/negative + `loras[]`) | 3.4 | `services/generation/imagePromptComposer.ts` | ⬜ |
| 3.7a | Append always-on `easy imageRemBg` node to `sdxl_power_lora.json`; install ComfyUI-Easy-Use custom node pack on ComfyUI host (BG removal only — snap moved to worker, see 3.7b) | 3.5 | `services/generation/workflows/sdxl_power_lora.json`, `backend/src/config/README.md` (install doc) | ⬜ |
| 3.7b | Vendor Hugo-Dz/spritefusion-pixel-snapper as a git submodule under `backend/vendor/pixel-snapper/`; add `npm run build:pixel-snapper` (runs `wasm-pack build --target nodejs --release`); commit the resulting `pkg/` to the repo | — | `backend/vendor/pixel-snapper/` (submodule), `backend/package.json` (script), CI config | ⬜ |
| 3.7c | `pixelSnapper.ts` Node wrapper — `snapAndResize(buf, targetSize, kColors?)` calling WASM `process_image` then `sharp` crop-to-128 + nearest-neighbor resize to targetSize | 3.7b | `backend/src/services/generation/pixelSnapper.ts` | ⬜ |
| 3.7d | Wire `pixelSnapper.snapAndResize` into the sprite worker post-generation; resolve `targetSize` per Plan 3.7.4 order; record `snapSize` on each candidate | 3.7c, Plan 4.2 | `backend/src/workers/spriteWorker.ts` | ⬜ |
| 3.8 | Styles API endpoint (read-only) | 3.4 | `routes/stylesRoute.ts` | ⬜ |
| 3.9 | Rework Sprite Generator UI (style picker, subject textarea — no post-process toggles) | 3.6, 3.8 | `pages/SpriteGenerator/SpriteGenerator.tsx` | ⬜ |
| 3.10 | Admin: Styles read-only view | 3.8 | `pages/Admin/Styles/` | ⬜ |

### Phase 4: Character & Monster Pipeline ⬜

| # | Task | Depends On | Files |
|---|------|------------|-------|
| 4.1 | Character agent (per-section: lore, appearance, stats) | Plan 9.2, Plan 11.5, Plan 11.8 | `services/generation/agents/characterAgent.ts` |
| 4.2 | Sprite iteration queue handler + select-sprite endpoint | 3.5, 3.6, 3.7, Plan 9.2 | `workers/spriteWorker.ts` (extended), `controllers/characterController.ts` |
| 4.3 | PixelLab service + animation queue handler | Plan 9.2, 4.2 | `services/generation/pixelLabService.ts`, `workers/characterWorker.ts` |
| 4.4 | Auto-tagger | 4.3 | `services/generation/autoTagger.ts` |
| 4.5 | Per-character export route (delegates to Plan 7.3) | Plan 7 | `controllers/characterController.ts` |
| 4.6 | Character editor as a dedicated page at `/projects/:projectId/characters/:characterId` (+ flat redirect aliases); coexisting sections; `?returnTo` round-trip for QuestBuilder | 4.1, 4.2, 4.3, Plan 9.8 | `pages/Character/CharacterEditor.tsx`, `pages/Character/routes.ts` |

### Phase 5: Animation Page ⬜

| # | Task | Depends On | Files |
|---|------|------------|-------|
| 5.1 | Build sprite sheet parser | — | `utils/spriteSheetParser.ts` |
| 5.2 | Build Canvas2D renderer component | 5.1 | `SpriteCanvas.tsx` |
| 5.3 | Build playback engine hook | — | `hooks/useSpritePlayback.ts` |
| 5.4 | Rewrite SpriteAnimator page | 5.1-5.3 | `pages/SpriteAnimator/` |
| 5.5 | Add PNG+JSON upload support | 5.4 | `SpriteUploader.tsx` |
| 5.6 | Add frame timeline with scrubbing | 5.4 | `FrameTimeline.tsx` |

### Phase 6: Admin Panel ⬜

| # | Task | Depends On | Files |
|---|------|------------|-------|
| 6.1 | Add isAdmin to User model | — | `models/userModel.ts` |
| 6.2 | Create admin middleware | 6.1 | `middlewares/adminMiddleware.ts` |
| 6.3 | Create admin routes + controllers | 6.2 | `routes/adminRoute.ts` |
| 6.4 | Build AdminDashboard page | 6.3 | `pages/Admin/` |
| 6.5 | Build ThemeConfig CRUD UI + LoRA manager | 6.3 | `ThemeConfigEditor.tsx`, `LoRAManager.tsx` |
| 6.6 | Build Agent Setup wizard | 6.3 | `AgentSetup.tsx` |
| 6.7 | Build KB Manager UI (S3 Vectors) | 6.3 | `KnowledgeBaseManager.tsx` |
| 6.8 | Build Job Monitor UI | 6.3 | `JobMonitor.tsx` |
| 6.9 | Wire Bedrock agent IDs → quest generation upgrades automatically | 6.6 | ThemeConfig in MongoDB |

### Phase 7: Export System ⬜

| # | Task | Depends On | Files |
|---|------|------------|-------|
| 7.1 | Build export registry + base interface | — | `services/export/index.ts`, `baseExporter.ts` |
| 7.2 | Build JSON exporter (universal default) | 7.1 | `services/export/jsonExporter.ts` |
| 7.3 | (CB exporter — moved to [CB-plan.md](CB-plan.md) CB-5) | — | — |
| 7.4 | (dialogue file generator — moved to CB-plan.md CB-5.5) | — | — |
| 7.5 | (GDScript quest_loader template — moved to CB-plan.md CB-4) | — | — |
| 7.6 | Build export route + controller | 7.1, 7.2 | `routes/exportRoute.ts` |
| 7.7 | Add export format switcher + button to QuestBuilder | 7.6 | `QuestBuilder.tsx` |
| 7.8 | Test JSON export round-trip | 7.2 | Manual testing |

### Phase 8: Cassette Beasts Mod Integration

Moved to [CB-plan.md](CB-plan.md) (sub-task table at CB-8). Not in this plan's execution scope.

---

## New Dependencies Summary

### Backend
```json
{
  "bullmq": "^5.x",          ✅ installed
  "ioredis": "^5.x",         ✅ installed
  "@aws-sdk/client-bedrock-agent": "^3.x",          ✅ installed
  "@aws-sdk/client-bedrock-agent-runtime": "^3.x",  ✅ installed
  "sharp": "^0.33.x",        ⬜ needed for Phase 3.7c (snap-and-resize crop + nearest-neighbor resize) and Phase 4.3 (animation frame stitching)
  "jszip": "^3.x",           ⬜ needed for CB mod export (see CB-plan.md)
  "archiver": "^7.x"         ⬜ needed for CB mod export (see CB-plan.md)
}
```

### Frontend
```json
{
  // No new dependencies needed — Canvas2D used instead of PixiJS
}
```

### Infrastructure
- **Redis** — on VPS with password (`redis://:password@host:6379`) ✅
- **ComfyUI** — local for now (`http://127.0.0.1:8188`), RunPod Serverless later ✅ service built
- **AWS Bedrock** — Claude Haiku 4.5, S3 Vectors KB ⬜ agents not created yet
- **PixelLab API** — account + key needed for Phase 4 ⬜

---

## Top-Level Repo Structure (Relevant Folders)

```
QuestFlow/
├── backend/                           # Express + TypeScript API + workers
├── frontend/                          # React + Vite UI
├── cb-mod/                            ⬜ NEW (CB-plan.md CB-4) — questflow_core GDScript runtime
│   ├── mod.tres
│   ├── autorun.gd
│   └── scripts/
│       ├── plugin_loader.gd           ⬜ scans mods/ for questflow_questline_*
│       ├── quest_engine.gd
│       ├── dialogue_runner.gd
│       ├── monster_injector.gd
│       ├── reward_dispenser.gd
│       ├── npc_hook.gd
│       ├── save_extension.gd
│       ├── version.gd                 ⬜ RUNTIME_VERSION + semver compat
│       └── ui/
│           ├── quest_log.gd + .tscn
│           └── dialogue_ui.gd + .tscn
├── scripts/
│   └── build-cb-core.ts               ⬜ NEW (CB-plan.md CB-4.2) — packages cb-mod/ → zip
├── backend/vendor/
│   └── pixel-snapper/                 ⬜ NEW (Phase 3.7b) — git submodule of Hugo-Dz/spritefusion-pixel-snapper
│       └── pkg/                       ⬜ committed wasm-pack output (~5 files, <1MB)
└── ARCHITECTURE_PLAN.md
```

## Current File Tree (Backend)

```
backend/src/
├── app.ts
├── server.ts
├── worker.ts                          ✅ worker process entry
├── config/
│   └── config.ts                      ✅ Redis, Bedrock, ComfyUI config
├── controllers/
│   ├── questGenerationController.ts   ✅ theme-aware, Gemini with context injection
│   ├── spriteController.ts            ✅ BullMQ enqueue
│   ├── loraController.ts              ⬜ NEW (Phase 3.4)
│   ├── monsterController.ts           ⬜ NEW (Phase 4)
│   ├── adminController.ts             ⬜ NEW (Phase 6)
│   ├── exportController.ts            ⬜ NEW (Phase 7)
│   └── ...existing...
├── middlewares/
│   ├── authMiddleware.ts
│   └── adminMiddleware.ts             ⬜ NEW (Phase 6)
├── models/
│   ├── userModel.ts                   ⬜ needs isAdmin (Phase 6)
│   ├── questlineModel.ts              ✅ themeId + exportFormat added
│   ├── spriteModel.ts                 ✅ styleId + negativePrompt added
│   ├── monsterModel.ts                ✅ NEW
│   ├── themeConfigModel.ts            ⬜ migrate to defaultLoraId (Phase 3.7)
│   ├── gameThemeModel.ts              ✅ NEW
│   ├── loraModel.ts                   ⬜ NEW (Phase 3.4) — LoRA catalog
│   ├── seedThemes.ts                  ✅ seeds generic_rpg + cassette_beasts
│   └── ...existing...
├── queues/
│   ├── connection.ts                  ✅ NEW
│   ├── monsterQueue.ts                ✅ NEW (to be replaced by character pipeline queues — Plan 4)
│   ├── questQueue.ts                  ✅ NEW
│   └── spriteQueue.ts                 ✅ NEW
├── workers/
│   ├── characterWorker.ts             ⬜ NEW (Plan 4) — handles per-section agent + sprite gen jobs
│   ├── questWorker.ts                 ⬜ NEW (future)
│   └── spriteWorker.ts                ✅ ComfyUI — calls generationService.generateWithStyle (inline RMBG + snap)
├── services/
│   ├── bedrock/
│   │   ├── bedrockClient.ts           ✅ NEW
│   │   ├── agentService.ts            ✅ NEW
│   │   └── knowledgeBaseService.ts    ✅ NEW (KB creation stubbed for Phase 6)
│   ├── prompts/                       ⬜ NEW (Phase 11) — prompt architecture
│   │   ├── system/                    ⬜ per-theme system prompts (.md)
│   │   │   ├── cassette_beasts.md
│   │   │   └── generic_rpg.md
│   │   ├── tools/                     ⬜ structured-output tool schemas (.json)
│   │   │   ├── generateQuestline.json
│   │   │   ├── submitMonster.json
│   │   │   └── ...
│   │   ├── tasks/                     ⬜ task templates (.md, with {{vars}})
│   │   │   ├── generateQuestline.md
│   │   │   ├── regenerateNode.md
│   │   │   └── ...
│   │   ├── context.ts                 ⬜ ContextBlock builder
│   │   ├── composer.ts                ⬜ system + context + task → ComposedPrompt
│   │   └── retrieval.ts               ⬜ KB retrieval policy per task type
│   ├── generation/
│   │   ├── generationService.ts       ⬜ renamed from loraService.ts (Phase 3.5) — generateWithStyle
│   │   ├── imagePromptComposer.ts     ⬜ NEW (Phase 3.6 / 11.7) — positive/negative + BACKGROUND_PHRASE + loras[]
│   │   ├── pixelSnapper.ts            ⬜ NEW (Phase 3.7c) — WASM snap + sharp crop/resize wrapper
│   │   ├── workflows/
│   │   │   ├── sdxl_power_lora.json   ⬜ NEW (Phase 3.5) — generalized from cbstyle.json; ends in RMBG (Pixel Snap moved to worker)
│   │   │   └── cbstyle.json           ✅ Power Lora Loader + DMD2 + RMBG (Pixel Snap moved to worker)
│   │   ├── agents/
│   │   │   └── characterAgent.ts      ⬜ NEW (Plan 4) — generateLore / generateAppearance / generateStats
│   │   └── pixelLabService.ts         ⬜ NEW (Plan 4 — invoked only when user clicks "Generate Animations")
│   └── export/
│       ├── index.ts                   ⬜ NEW (Phase 7)
│       ├── baseExporter.ts            ⬜ NEW (Phase 7)
│       ├── jsonExporter.ts            ⬜ NEW (Phase 7)
│       ├── cassetteBeatsExporter.ts   ⬜ NEW (CB-plan.md CB-5.6 — Plan 7 plugin)
│       ├── customExporter.ts          ⬜ NEW (Phase 7)
│       └── cb/                        ⬜ NEW (CB-plan.md CB-5) — package builders
│           ├── manifestGenerator.ts   ⬜ stub mod.tres + manifest.json (questline + bestiary)
│           ├── questlineSerializer.ts ⬜ questline → runtime JSON shape
│           ├── triggerMapper.ts       ⬜ NPC name → quest node binding
│           ├── assetBundler.ts        ⬜ S3 → zip, dedup (per-package)
│           ├── dialogueGenerator.ts   ⬜ quest body → dialogue JSON
│           ├── bestiaryExporter.ts    ⬜ NEW (CB-plan.md CB-5.7) — bestiary package
│           ├── projectBundleExporter.ts ⬜ NEW (CB-plan.md CB-5.8) — zip-of-folders
│           └── readmeGenerator.ts     ⬜ install instructions (3 variants)
├── routes/
│   ├── jobRoute.ts                    ✅ NEW — universal SSE streaming
│   ├── loraRoute.ts                   ⬜ NEW (Phase 3.4) — LoRA catalog CRUD
│   ├── stylesRoute.ts                 ⬜ NEW (Phase 3.11)
│   ├── monsterRoute.ts                ⬜ NEW (Phase 4)
│   ├── adminRoute.ts                  ⬜ NEW (Phase 6)
│   └── ...existing...
└── utils/
    ├── s3Helper.ts
    └── jobQueue.ts                    ✅ DELETED
```

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| ComfyUI unavailable locally | Blocks sprite generation | Health check endpoint. Clear error message to user. |
| PixelLab API rate limits or downtime | Blocks monster pipeline | Queue with retry + exponential backoff. Cache results in S3. |
| Bedrock KB retrieval returns irrelevant data | Inaccurate monster stats | Use structured queries, validate output against stat ranges in code. |
| Redis unavailability | No job processing | Health check endpoint. Redis on VPS with password auth. |
| Long pipeline time (2-5 min) | UX frustration | SSE progress with per-step updates. Allow browsing while generating. |
| RunPod cold start (~30s) | Slow first generation | Acceptable — ComfyUI generation itself takes 15-30s. Show "warming up" state. |

(CB-specific risks moved to [CB-plan.md](CB-plan.md) CB-9.)
