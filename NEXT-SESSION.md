# Next session — KB category rework + UI renovation

State: RAG Part 1 backend + Games UI are done, verified E2E, uncommitted on `RAG` branch.
See `RAG-README.md` for what exists. This file is the to-do for the next session.

## 1. Change KB categories (backend + frontend)

Replace the current `lore | quests | characters | dialogue` types with:

- `monsters`
- `maps`
- `items` (items/rewards)
- `general` (freeform catch-all)

Touch points (grep for the old union values):
- `backend/src/services/qdrant.ts` — `KbType` + `KB_TYPES` (single source of truth;
  collection names are `kb_{gameId}_{type}` so new types = new collections, no migration
  needed — Qdrant is currently empty, no real docs exist yet)
- `backend/src/models/kbDocumentModel.ts` — schema enum comes from KB_TYPES (auto)
- `backend/src/queues/kbQueue.ts` — uses KbType (auto)
- `backend/src/controllers/gameController.ts` — zod kbTypeSchema (auto via KB_TYPES),
  swagger comments mention the old enum in `gameRoute.ts` — update docs strings
- `frontend/src/app/api/gameApi.ts` — `KbType`, `KB_TYPES`
- `frontend/src/app/pages/Games/KbDocumentDialog.tsx` — TYPE_LABELS
- `frontend/src/app/pages/Games/KbTestSearch.tsx` — TYPE_LABELS
- `frontend/src/app/pages/Games/GameDetail.tsx` — TYPE_BADGES colors
- `RAG-README.md` + `quest-gen-rag-plan.md` mention the old four types — update

Default type for new docs should become `general`.

## 2. Redesign document creation + KB testing UX (user dislikes current version)

Current: modal dialog with paste/load-file + a sidebar test-search panel with type pills.
User feedback: "I don't like how we did the testing and the creation of documents."
Redesign both flows as part of the overall UI renovation (below) — don't just restyle,
rethink the flow. Ideas to explore with the user:
- Document creation: full-page editor instead of a modal? Drag-drop file zone?
  Per-category guided forms (e.g. monsters: name/stats fields) — ties into Part 2's
  structured ingestion (`mobs.json` etc., see `quest-gen-rag-part2-integration.md` §3)
- Testing: maybe a dedicated "playground" view, chat-like query history, side-by-side
  category comparison, show which docs matched and why

## 3. Whole-app UI renovation (the big one)

User feedback, verbatim intent:
- The app feels **too generic / "AI feel"** — wants a distinctive style
- The **dashboard is not good**
- Wants to **view different style directions** before committing

Two skills are now installed for this (were NOT available last session — check the
available-skills list and invoke via the Skill tool):
- a **ui ux** skill
- a **frontend design** skill

Plan:
1. Load both skills FIRST, before proposing anything.
2. Produce several distinct style directions (mood/theme boards or sample screens —
   e.g. as Artifacts or mock pages) for the user to choose from. QuestFlow is a
   game-dev tool (quests, sprites, pixel art) — directions could lean into that
   (pixel/retro, editorial, brutalist, warm parchment/fantasy, pro-tool dense like
   Linear/Blender, etc.). Let the user pick; don't restyle everything unprompted.
3. After a direction is chosen: dashboard first, then the Games/KB pages (combining
   with item 2), then the rest.

Current stack/style for reference: Tailwind 4, shadcn/radix components in
`frontend/src/app/components/ui/`, dark zinc-950/900 + purple-600 accent everywhere,
lucide icons, sonner toasts, motion/react modals. Nav is `components/layout/TopNav.tsx`;
dashboard page is `pages/Dashboard/Dashboard.tsx`.

## Loose ends from last session (small)

- 2 pre-existing questExport snapshot test failures (unrelated, also fail on main).
- Server Redis: eviction policy should be `noeviction` (BullMQ warning); Redis+Mongo
  are on public ports — consider firewalling to known IPs.
- OCI: port 6333 can be closed now that Caddy fronts Qdrant on 443.
- Everything on `RAG` branch is uncommitted — user commits manually.
