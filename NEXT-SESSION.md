# Next session — RAG Part 2 (KB-aware generation)

State (July 2026): RAG Part 1 is committed on the `RAG` branch (`c27db88` + follow-up).
The former items 1 & 2 of this file are **done**:

1. ~~KB category rework~~ — types are now `monsters | maps | items | general`
   (default `general`); `KB_TYPES` in `backend/src/services/qdrant.ts` is the single
   source of truth.
2. ~~Document creation + KB testing UX redo~~ — the modal and sidebar panel were
   replaced by a full-page editor (`#/games/:gameId/docs/new`, `.../docs/:docId`,
   drag-drop + per-category format templates) and a KB playground
   (`#/games/:gameId/playground`, all-category parallel search + query history).
   Styling deliberately stayed zinc/purple — the restyle is Part 3.

## Up next: Part 2 — game-data-aware generation

Follow `quest-gen-rag-part2-integration.md`. Build order (§7 there):

1. Settle the §8 open decisions (recognized file set, progression inference,
   dedup/link). The category rework already fixed the file set direction:
   monsters / maps / items (+ general fallback).
2. Structured-file ingestion + per-entity explosion (on top of Part 1's text path).
3. Inferred progression scoring; index the computed field.
4. Reference retrieval + context assembly (`buildReferenceContext`, optional,
   progression-biased).
5. Light prompt changes, one builder at a time; KB guides, never restricts.
6. Link referenced existing entities (no duplicates).
7. Frontend: quest-gen dialog Game/KB selector (`questline.gameId` override —
   the model field already exists).

## After that: Part 3 — whole-app UI renovation

See `part3-ui-renovation.md` (extracted from this file). Load the ui-ux +
frontend-design skills first, present style directions, user picks, dashboard first.

## Loose ends (small)

- 2 pre-existing questExport snapshot test failures (unrelated, also fail on main).
- Server Redis: eviction policy should be `noeviction` (BullMQ warning); Redis+Mongo
  are on public ports — consider firewalling to known IPs.
- OCI: port 6333 can be closed now that Caddy fronts Qdrant on 443.
