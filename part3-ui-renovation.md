# Part 3 — Whole-app UI renovation

Extracted from `NEXT-SESSION.md` (July 2026) so Parts 2 and 3 can be scheduled
independently. This is the big visual overhaul; it deliberately comes **after**
RAG Part 2 (`quest-gen-rag-part2-integration.md`).

## User feedback driving this (verbatim intent)

- The app feels **too generic / "AI feel"** — wants a distinctive style
- The **dashboard is not good**
- Wants to **view different style directions** before committing

## Ground rules

Two skills are installed for this — check the available-skills list and invoke
via the Skill tool **before proposing anything**:

- a **ui ux** skill (`ui-ux-pro-max`)
- a **frontend design** skill (`frontend-design`)

Do not restyle anything unprompted; the user picks a direction first.

## Plan

1. Load both skills FIRST, before proposing anything.
2. Produce several distinct style directions (mood/theme boards or sample
   screens — e.g. as Artifacts or mock pages) for the user to choose from.
   QuestFlow is a game-dev tool (quests, sprites, pixel art) — directions could
   lean into that (pixel/retro, editorial, brutalist, warm parchment/fantasy,
   pro-tool dense like Linear/Blender, etc.). Let the user pick.
3. After a direction is chosen: **dashboard first**, then the Games/KB pages,
   then the rest.

## Scope notes

- The Games/KB **flows** were already reworked in July 2026 (full-page document
  editor at `#/games/:gameId/docs/...`, KB playground at
  `#/games/:gameId/playground`) but kept the current zinc/purple styling on
  purpose — Part 3 restyles them, it does not need to rethink their UX again.
- Current stack/style for reference: Tailwind 4, shadcn/radix components in
  `frontend/src/app/components/ui/`, dark zinc-950/900 + purple-600 accent
  everywhere, lucide icons, sonner toasts, motion/react modals. Nav is
  `components/layout/TopNav.tsx`; dashboard page is
  `pages/Dashboard/Dashboard.tsx`.
