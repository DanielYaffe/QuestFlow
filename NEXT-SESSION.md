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

## Part 2 — game-data-aware generation: **DONE** (July 2026, on `RAG` branch)

All of `quest-gen-rag-part2-integration.md` §7 is implemented. Decisions taken (§8):

1. **File set**: `monsters.json` (stats + drops embedded), `maps.json`, `items.json`,
   plus `npcs.json` (stored under the `monsters` category with a `role` field).
2. **Parser**: lenient + heuristics (`structuredParse.ts` — array / wrapper object /
   name-keyed map; name via name|title|id; stat aliases), freeform fallback.
3. **Progression**: continuous 0–1 stats score (level 1.5×, hp/atk/def 1×, min-max
   normalized per file) + early/mid/late buckets; `entity` + `difficultyBucket`
   payload-indexed in Qdrant (ensured idempotently, no re-ingest needed).
4. **Reference strength**: gentle (doc default) — REFERENCE MATERIAL block invites
   use AND invention, never an allowlist.
5. **Dedup/link**: characters gain `kbRef` (`{gameId}:{entityName}`); generation
   reuses an existing materialized Character in the project instead of duplicating.

Key pieces: `structuredParse.ts` (+14 tests), `buildPoints` structured path,
`retrieve()` progression bias (+0.08 re-rank bonus, never a filter),
`generationContext.ts` (`buildReferenceContext`, per-step category mix), all three
prompt builders, `questline.gameId` persisted. The Quest Builder's AI editor
(`/questlines/:id/ai-edit`) is also KB-grounded (questline.gameId → project
fallback). Wizard: the KB is a dedicated step 2 of 6 (`StepKnowledgeBase` — game
cards + stage chips, defaults to the active project's linked game; empty state
offers "Create a game & KB" → #/games or "Continue without"); create page is
page-scrollable; draft key bumped to v2 for the renumbered steps.
(`AISidebar.tsx` is still mock/canned responses — untouched, candidate for Part 3.)

Grounded marks: characters AND rewards carry `kbRef` when they reference a real
KB entity (validated against the offered reference set, hallucinated refs
dropped). The wizard shows an emerald "Grounded" badge (`GroundedBadge.tsx`) on
character cards, reward rows, and output chips; `questline.rewards[].kbRef` is
persisted (same `{gameId}:{name}` tag shape as Character.kbRef). The items KB
category now also feeds the objectives step (where rewards are generated).
The mark also shows in the builder's left sidebar (Characters/Rewards tabs,
compact icon), the project Characters page (grid overlay, list badge, detail
modal), and the project dashboard's new **Items** section — which aggregates
rewards across the project's questlines via `GET /projects/:id/rewards`
(rarity-colored chips, click → source questline, grounded count in the header).
`GroundedBadge` moved to `components/shared/`. Possible follow-up: badge in the
builder's node-edit sidebar pickers.

KB categories expanded to **monsters | characters | maps | items | quests |
lore | general** (merging the original Part 1 set back in; 'dialogue' was NOT
restored — ask Daniel if wanted). `KB_TYPES` in `backend/src/services/qdrant.ts`
is still the single source of truth; every UI (editor tabs, playground,
templates in kbContent.ts) derives from it. lore+general are always-freeform in
`buildPoints`; the other five try the structured parser. Generation step mixes
in `generationContext.ts` updated to draw on the new categories.

Project **Items page** (`#/projects/:id/items`, `Project/Items.tsx`) mirrors
the Characters page: rarity/grounded filter tabs, search, grid/list views,
sprite thumbnails (reward imageUrl), detail modal with edit/delete (usage
check) and open-source-questline link. Dashboard Items section is now a
Characters-style summary strip.

Grounding-quality fixes (after Daniel's tribal-leader KB wasn't used):
1. `structuredParse` now also parses the **markdown shape the in-app templates
   teach** (`## Name` + `Key: value` lines; "HP 30, ATK 5" pairs feed stats;
   Role: → role; prose → description) — previously only JSON became entities,
   so hand-written docs could never produce kbRef. **Docs ingested before this
   need a re-embed (edit the doc and save) to explode into entities.**
   Also fixed JSON gaps: a single entity object (`{"name": "Tribal Leader",…}`)
   and a single-key wrapper around a name-keyed map now parse. The doc editor
   aside lists all accepted formats (`ACCEPTED_FORMATS` in kbContent.ts) and
   warns that lore/general are never entity-parsed; GameDetail rows + the
   editor header now show the ingest outcome ("N entities recognized" vs an
   amber "plain text — no entities recognized" warning for entity categories),
   so a silently-freeform doc is visible at a glance.
2. Reference retrieval threshold lowered to 0.35 in `buildReferenceContext`
   (0.5 silently dropped everything for short story queries).
3. Characters prompt now actively CASTS matching existing entities.
3b. Grounded flag no longer depends on the model emitting kbRef: an exact
   name/title match against the offered entities grounds a character/reward
   server-side (Daniel's rerun cast Balrog but the flag was missing), and the
   prompts now note the optional kbRef/existingId fields right under the JSON
   schema examples. Characters page gained a Grounded filter tab and "used in
   quest X" (rows, cards, detail modal with open-in-builder chips) — the list
   endpoint now returns usedIn[{questlineId,title}].
4. **Project roster feeds generation**: objectives prompt gets existing reward
   titles across the project (reuse exact title or diversify — stops the
   same-rewards-every-run loop); characters prompt gets existing project
   characters with `existingId` reuse (validated; generateQuestline links the
   doc instead of inserting). Wizard shows a blue "Project" chip on reused
   characters. Follow-up idea: same roster context for the builder's ai-edit.

Not yet runtime-verified end-to-end (needs live stack + AI keys + a seeded KB):
upload a mobs.json, generate with the game attached, confirm references + kbRef
dedup on a second generation.

## After that: Part 3 — whole-app UI renovation

See `part3-ui-renovation.md` (extracted from this file). Load the ui-ux +
frontend-design skills first, present style directions, user picks, dashboard first.

## Loose ends (small)

- 2 pre-existing questExport snapshot test failures (unrelated, also fail on main).
- Server Redis: eviction policy should be `noeviction` (BullMQ warning); Redis+Mongo
  are on public ports — consider firewalling to known IPs.
- OCI: port 6333 can be closed now that Caddy fronts Qdrant on 443.
