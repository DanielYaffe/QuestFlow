# QuestFlow — Forward Architecture Plan (V2)

**Date:** June 4, 2026
**Supersedes:** [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) (kept as historical record).

This plan is the **forward roadmap only** — it drops everything already finished or abandoned and
keeps just the still-relevant work, with **AWS Bedrock removed entirely** (Gemini is the only text
model).

### What is already done (not re-planned here)

- **Plans 1–3** — job pipeline (BullMQ + Redis + worker + universal SSE), theme-aware Gemini quest
  generation, and the ComfyUI sprite generator rework (DB-backed `SpriteStyle`, per-style
  workflows, image prompt composer, WASM pixel snapper, styles API, sprite UI). ✅
- **Export** — built by another dev on `origin/feat/export-formats` +
  `origin/feat/quest-export-github-push`: `services/questExport/` (JSON, YAML, Unity, Unreal,
  Godot `.tres`), `questExportController.ts`, `githubService.ts`. This covers old **Plan 7** and
  old **Plan 10.10 / 10.11** (export preview + import). ✅
- **Quest node/field regeneration** — built by another dev on `origin/feat/ai-questline-editor`:
  `questAiEditController.ts` + `AIEditPanel.tsx` (per-change approval). This covers old
  **Plan 10.1**. ✅

### What is explicitly dropped

- **AWS Bedrock** in all forms — agents, knowledge bases, S3 Vectors, RAG retrieval, citations.
  The live text path is and stays **Gemini** (`gemini-2.5-flash-lite`).
- **Old Plan 11** (Bedrock prompt-composer / tool-calling architecture) — Gemini uses the existing
  raw-prompt pattern.
- **Conversational / RAG chat** authoring (old Plan 10.14 chat panel) and the **Sources panel**
  (old Plan 10.5).
- **Export & quest-regen rebuilds** — those ship on the branches above; this plan only *consumes*
  them.

---

## Cross-cutting decisions

1. **Gemini is the only text model.** Character section agents (lore / appearance / stats) and the
   character authoring assist reuse the `callGemini` pattern from
   `controllers/questGenerationController.ts`, extracted into a shared
   `services/generation/agents/geminiClient.ts`. No Bedrock, no KB retrieval, no tool-calling
   layer, no `services/prompts/` composer. Theme tone is injected via the existing `loadTheme()` +
   `buildThemeContext()` helpers, exactly as quest generation already does.
2. **No KB / RAG / citations / conversational chat.**
3. **Export and quest regen are external dependencies, not work.** Per-character export calls the
   existing `services/questExport` dispatcher (extended to accept a character entity). This plan
   does not rebuild any exporter.
4. **One unified `Character` model** (`kind: 'npc' | 'monster'`) replaces both the inline
   `questline.characters[]` and the standalone `monsterModel.ts`.
5. **Reuse the sprite job rail.** Character sprite iteration reuses `spriteQueue`,
   `workers/spriteWorker.ts`, `imagePromptComposer.composeImagePrompt`,
   `generationService.generateWithStyle`, `services/generation/pixelSnapper.ts`, the universal SSE
   route (`GET /jobs/:queue/:jobId/stream`), and `context/SpriteJobContext.tsx` — no new
   generation stack.

---

## Phase 0 — Bedrock removal + groundwork ✅

Delete the dead AWS Bedrock code so the rest of the plan has no Bedrock surface area. Verified:
nothing outside these files references Bedrock, so removal is non-breaking. S3 (`s3Helper.ts`) is
unaffected — only Bedrock AI is cut.

| # | Task | Files |
|---|------|-------|
| 0.1 ✅ | Delete the Bedrock service dir | `backend/src/services/bedrock/{agentService,bedrockClient,knowledgeBaseService}.ts` |
| 0.2 ✅ | Drop the two SDK deps (then reinstall to update the lockfile) | `backend/package.json` → remove `@aws-sdk/client-bedrock-agent`, `@aws-sdk/client-bedrock-agent-runtime` |
| 0.3 ✅ | Remove Bedrock config | `backend/src/config/config.ts` (`AWS_BEDROCK_REGION`), `backend/.env.example` (`AWS_BEDROCK_REGION=...`) |
| 0.4 ✅ | Extract a shared Gemini helper | New `backend/src/services/generation/agents/geminiClient.ts` — move `callGemini()` out of `questGenerationController.ts`; both quest gen and character agents import it |

---

## Phase 1 — Projects + unified Character system (was Plan 9) ✅

**Goal:** introduce **Projects** as the top-level container and graduate NPCs/monsters into
first-class, project-scoped **Character** records reusable across questlines. This is the data
foundation Phase 2 builds on, so it ships first.

**Key decisions**

- A `Project` owns many questlines + many characters + one default theme/export format.
- `Character` is unified (`kind: 'npc' | 'monster'`): monsters add `speciesData` + `assets`;
  NPCs add `portraitUrl` + `dialogueTraits`. Supersedes `monsterModel.ts` (no separate runtime
  path) and the inline `questline.characters[]`.
- Backwards-compat: questlines without a project move into an auto-created **"Inbox"** project per
  user — no data loss, existing UX keeps working.
- `assets` uses the candidate-grid model: `rawSpriteCandidates[]` (capped 20, oldest S3 objects
  pruned on append) + `snappedSpriteS3Key` (user-picked canonical) + optional
  `spritesheetS3Key` / `spritesheetJsonS3Key` + `targetSizeOverride?`. Old
  `battleSprite` / `worldSprite` / `tresFile` fields are dropped — exports are on-demand, not
  persisted.

| # | Task | Depends | Files |
|---|------|---------|-------|
| 1.1 ✅ | `Project` model + CRUD | 0 | `models/projectModel.ts`, `routes/projectRoute.ts`, `controllers/projectController.ts` |
| 1.2 ✅ | Unified `Character` model (npc+monster discriminator, `assets`, `speciesData`, `tags`) | — | `models/characterModel.ts` |
| 1.3 ✅ | Character CRUD routes/controller | 1.2 | `routes/characterRoute.ts`, `controllers/characterController.ts` |
| 1.4 ✅ | Questline model: add `projectId` + `characterIds` (refs); node `npcIds`/`monsterIds` resolve to Character `_id` | 1.2 | `models/questlineModel.ts` |
| 1.5 ✅ | Migration: inline characters → Character collection; assign Inbox project; supersede `monsterModel` | 1.1–1.4 | `scripts/migrate-projects.ts` |
| 1.6 ✅ | Projects list + dashboard pages | 1.1 | `frontend/src/app/pages/Projects/` |
| 1.7 ✅ | Characters page (browse / filter / orphan tabs, grid+list) | 1.3 | `frontend/src/app/pages/Project/Characters.tsx` |
| 1.8 ✅ | QuestBuilder character picker (pick existing / "+ Create new" full-page nav with `?returnTo=quest:<questId>:<nodeId>`) | 1.3, 1.4 | `frontend/src/app/pages/QuestBuilder/components/CharacterPicker.tsx` |
| 1.9 ✅ | Sprite → Character "promote" button | 1.2 | `frontend/src/app/pages/SpriteGenerator/` |

> The Character **Editor** page itself is task 2.6 — it needs the Phase 2 agents/loop.
>
> **Note:** Migration script written but not yet run against prod DB (data loss incident — see below).

---

## ⚠ Known issue: test suite destroyed prod DB

`npm test` ran against the real `DATABASE_URL` because no `.env.test` existed. `afterAll` called
`mongoose.connection.dropDatabase()` on prod. Fixed:

- `jest.setup.ts` — now rewrites `DATABASE_URL` to append `_test` (single-file, no secrets duplication)
- `auth.test.ts` `beforeAll` — hard guard: throws before any test runs if DB name doesn't end in `_test`

---

## Phase 2 — Character & Monster pipeline (was Plan 4, Gemini-based)

**Goal:** a dedicated full page at `/projects/:projectId/characters/:characterId` (+ `/new`, +
flat redirect aliases `/characters/new?projectId=...` and `/characters/:characterId`) where lore,
appearance, stats, sprite, animation, and export coexist as independently-editable sections — no
enforced order.

**Key decisions**

- **Three Gemini section agents** — `generateLore`, `generateAppearance`, `generateStats` — each a
  focused prompt via the shared Gemini helper (0.4) with theme tone + `lockedFields` + optional
  `userHint`. Bidirectional stats↔lore works because the full character record is always in
  context and the locks decide direction. Each returns only its section; the caller patches the
  record. Appearance output must be visually concrete (used directly as the sprite subject).
- **Sprite iteration loop** reuses the existing sprite rail (cross-cutting #5): a job composes the
  prompt from `character.appearance`, runs `generateWithStyle`, snaps if `style.targetSize` is set
  (resolution order `targetSizeOverride` → `style.targetSize` → `128`), uploads, and appends to
  `rawSpriteCandidates` (prune > 20). "Use this sprite" sets `snappedSpriteS3Key`. No sprite is
  canonical until the user picks one.
- **Animation + auto-tagger are on-demand buttons**, not a pipeline: PixelLab → stitch → Aseprite
  JSON → S3. Costs API budget per run; re-runnable.
- **Per-character export** delegates to the existing `services/questExport` dispatcher (extended to
  accept a `Character`), not a new exporter. Valid formats reuse what the dispatcher supports.
- No monolithic monster job — each operation (section regen, sprite gen, animation) is its own
  queue job with its own SSE stream. Jobs are queue-backed and survive navigation away from the
  page; SSE reconnects on mount via the universal route.

| # | Task | Depends | Files |
|---|------|---------|-------|
| 2.1 | Character section agents (lore / appearance / stats) via Gemini | 0.4, 1.2 | `services/generation/agents/characterAgent.ts` |
| 2.2 | Sprite iteration queue handler + `select-sprite` endpoint (reuses spriteQueue/worker) | 1.2, Plans 3.x | `workers/spriteWorker.ts` (extend), `controllers/characterController.ts` |
| 2.3 | PixelLab service + animation job | 1.2, 2.2 | `services/generation/pixelLabService.ts`, `workers/characterWorker.ts` |
| 2.4 | Auto-tagger (Aseprite JSON for battle + world sheets) | 2.3 | `services/generation/autoTagger.ts` |
| 2.5 | Per-character export route → existing questExport dispatcher (extend to accept a character entity) | export branch | `controllers/characterController.ts`, `services/questExport/` |
| 2.6 | Character Editor page (coexisting sections, `[Generate]/[Refine]/[🔒]` per section, `?returnTo` round-trip, SSE reconnect) | 2.1–2.3, 1.3 | `frontend/src/app/pages/Character/CharacterEditor.tsx`, `pages/Character/routes.ts` |
| 2.7 | Character API routes (section generate, sprite generate/select, animate, export) | 2.1–2.5 | `routes/characterRoute.ts` |

**Routes**

```
POST /api/characters/:id/sections/{lore|appearance|stats}/generate  → enqueue section regen
POST /api/characters/:id/sprite/generate                            → enqueue sprite candidate
POST /api/characters/:id/sprite/select        body { s3Key }        → set canonical sprite
POST /api/characters/:id/animate                                    → enqueue PixelLab pipeline
POST /api/characters/:id/export               body { format }       → delegate to questExport
GET  /jobs/:queue/:jobId/stream                                     → existing universal SSE route
```

---

## Phase 3 — Animation page rework (was Plan 5)

**Goal:** replace the hardcoded `SpriteAnimator.tsx` stub with a real Aseprite PNG+JSON player. No
backend AI involved.

**Key decisions**

- Parse Aseprite `meta.frameTags` → animations; Canvas2D renderer with
  `imageSmoothingEnabled = false` for crisp pixels; RAF playback using per-frame durations.
- Three input modes: from a character's animation output (`?characterId=`, presigned S3 URLs),
  drag-drop PNG+JSON upload, or pick from the sprite gallery.

| # | Task | Depends | Files |
|---|------|---------|-------|
| 3.1 | Sprite-sheet parser (`parseAsepriteJSON`) | — | `frontend/src/app/utils/spriteSheetParser.ts` |
| 3.2 | Canvas2D renderer (nearest-neighbor, onion skin) | 3.1 | `pages/SpriteAnimator/components/SpriteCanvas.tsx` |
| 3.3 | RAF playback hook | — | `frontend/src/app/hooks/useSpritePlayback.ts` |
| 3.4 | Rewrite page + list / controls / properties panels | 3.1–3.3 | `pages/SpriteAnimator/` (rewrite) |
| 3.5 | PNG+JSON upload + load-from-character (`?characterId=`) | 3.4, 2.3 | `pages/SpriteAnimator/components/SpriteUploader.tsx` |
| 3.6 | Frame timeline with scrubbing | 3.4 | `pages/SpriteAnimator/components/FrameTimeline.tsx` |

---

## Phase 4 — UX polish (trimmed Plan 10)

The four selected polish items. All Bedrock / RAG / export / quest-regen items from old Plan 10
are dropped (done elsewhere or out of scope).

### 4.1 Recent Jobs Tray
Persistent app-shell floating tray (bottom-right) showing active/recent BullMQ jobs (sprite,
character section, animation). Fed by a shared client store over the existing universal SSE route;
survives navigation; per-job cancel. Directly supports Phase 2's long-running jobs.
Files: `frontend/src/app/components/JobsTray.tsx`, shared SSE store (build on `SpriteJobContext`).

### 4.2 Character AI authoring assist (Gemini, no chat)
- `POST /api/characters/:id/assist` `{ field, mode: 'generate' | 'expand', userHint?, lockedFields[] }`
  — single-turn Gemini; returns proposed text shown as an accept/edit suggestion (target ~2–4s).
- `POST /api/characters/:id/assist-full` `{ seed }` — fill all empty fields coherently from a seed.
- Monster stats↔description in both directions (reuses the 2.1 agents).
- **No** conversational chat panel and **no** consistency-check chat.
Files: `controllers/characterController.ts` (assist routes); Character Editor UI hooks into 2.6.

### 4.3 Tagging / search / favorites
Add `tags: string[]` + `favorite: boolean` to `spriteModel` and `characterModel` (Character
already has `tags`). Search bar + tag filter chips + favorite star on the sprite gallery and the
Characters page. Auto-suggest tags from prompt text on save.
Files: `models/spriteModel.ts`, `models/characterModel.ts`, gallery + character list UI.

### 4.4 Validation + Playtest + Onboarding
- **Quest validation pass** — on-demand checks (reachability from start, leaf nodes without
  rewards/terminal dialogue, orphan NPCs, dangling character refs, non-terminating cycles); side
  panel with "jump to node"; blocks export on errors, warns otherwise.
  `services/validation/questValidator.ts` + panel UI.
- **In-app playtest** — TS graph walker that simulates dialogue/choices/branches and flags dead
  ends & unreachable nodes (text/flow only — no battles/visuals).
  `pages/QuestBuilder/Playtest.tsx`, `services/questEngine.ts`.
- **Wizard→Builder onboarding** — first-run dismissible overlay on QuestBuilder; "suggested next
  step" hint on empty/incomplete nodes; flag stored in user prefs.

---

## Execution order

`Phase 0 → Phase 1 → Phase 2 → Phase 3` (Phase 3 can overlap with late Phase 2) `→ Phase 4`.

Phase 1 is the hard prerequisite (the `Character` model gates everything in Phase 2). Phase 4
items are independent and can be picked up opportunistically once their host pages exist.

## Verification

- **Phase 0:** `cd backend && npm run build` (or `tsc --noEmit`) compiles with zero references to
  `services/bedrock` / `AWS_BEDROCK_REGION`; `npm test` stays green; a search for `bedrock` under
  `backend/src` returns nothing.
- **Phase 1:** run `scripts/migrate-projects.ts` against a seeded dev DB; confirm every questline
  gets a `projectId`, inline characters become `Character` docs, and node `npcIds`/`monsterIds`
  resolve to Character `_id`s. Projects + Characters pages render the migrated data.
- **Phase 2:** create a monster character; Generate lore → appearance → stats (Gemini fills each
  section, locks respected, stats↔lore bidirectional); Generate Sprite several times (candidates
  accumulate, capped 20), "Use this sprite" sets canonical; Generate Animations produces
  spritesheet + JSON in S3; Export `.tres`/`json`/`png` downloads via the questExport dispatcher.
  SSE survives navigating away and back.
- **Phase 3:** load a character's generated PNG+JSON and a hand-uploaded pair; the animations list
  populates from `frameTags`, playback honors per-frame durations, pixels stay crisp, and the
  timeline scrubs.
- **Phase 4:** the jobs tray reflects live Phase 2 jobs across navigation; assist generate/expand
  returns usable text; tag filter + favorites work on both galleries; validation flags a
  deliberately broken questline and playtest detects an unreachable node.

## New dependencies

- **PixelLab API** — account + key needed for Phase 2 animation (`pixelLabService.ts`).
- `sharp` and `jszip`/`archiver` are already pulled in by the sprite pipeline and the export
  branch respectively — no new image/zip deps expected.
- **Removed:** `@aws-sdk/client-bedrock-agent`, `@aws-sdk/client-bedrock-agent-runtime`.
