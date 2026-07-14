# Part 2: Using the KB — Game-Data-Aware Generation & UX

**Depends on Part 1** (`quest-gen-rag-plan.md`), which delivers the `Game` entity, KB
ingestion/editing, and status-gated `retrieve()`. Part 1 makes game data *storable and
retrievable*; Part 2 makes generation *draw on it*. **Not mandatory to ship Part 1.**

## 1. Premise — freedom first, KB as guidance (not a cage)

The app's core is **creative generation**. The KB must **guide and inspire**, never
restrict. The AI stays free to invent quests, characters, and objectives; the KB just:

- lets generation **reference existing entities** (feature a real monster/NPC/loot when it fits),
- keeps output **consistent with the world** (tone, factions, lore),
- helps it **avoid duplicating** things the game already has (reference instead of recreate).

This is the opposite of an allowlist. Retrieved game data is presented to the model as
**optional reference material** — "you may use or take inspiration from these, and you may
freely invent new ones that fit the world."

## 2. Additive grounding — fits the existing flow

The current pipeline is multi-step: **objectives → characters → questline graph**, each
step carrying the prior generated data forward. KB grounding is **additive** at each step,
alongside the story and the already-generated objectives/characters — it never replaces
the model's own output:

- **Objectives** — story + (optional) KB reference for tone/scale.
- **Characters** — story + generated objectives + (optional) real monsters/NPCs to reference.
- **Questline graph** — all of the above + (optional) real loot/encounters to weave in.

**Don't re-create existing data:** when the model wants something the KB already has, it
should reference the real entity; when it invents, it creates new. New inventions still
flow into the existing `Character`/reward creation; referenced existing entities link
rather than duplicate (§5.4).

## 3. KB content model — collection files, not a file per entity

Games have many monsters; one document per entity is impractical. Instead the KB accepts
**collection files** holding many entities each, plus freeform docs:

- **Recognized structured files** the system knows how to parse, e.g. `mobs.json`,
  `drops.json`, `stats.json`, `maps.json`, and more. Each is one upload holding many
  entities. The set is **extensible and not exhaustive** — recognized types are a parsing
  convenience, not a restriction.
- **Freeform docs** (lore, arbitrary text) — handled by Part 1's generic text ingestion.

You document the expected shape of the recommended files for your users (a format/template
in the UI). You don't have to cover every type — unknown files fall back to freeform.

### One file → many internal entries

Ingestion **explodes a collection file into per-entity records internally**: upload
`mobs.json` once, and the system creates a retrievable entry per monster (its text + fields
as metadata). That gives per-entity precision (semantic search *and* exact lookup by name)
**without** a file per mob. This is a Part 2 enhancement layered on Part 1's text
ingestion — a structured-file parser in front of the existing chunk/embed/upsert path.

## 4. Progression — inferred, not authored

No manual tiers/levels. Derive a progression signal **from the data itself**, computed at
ingest and stored as derived metadata:

- **Stats** (`stats.json` / `mobs.json`) → a difficulty score (normalize/weight the stat
  fields; higher → later game).
- **Maps** (`maps.json`) → zone/area order or reachability → relative progression.
- **Drops** (`drops.json`) → loot value/rarity correlates with tier.

The system combines these into an inferred ordering (a continuous score and/or
early/mid/late buckets). Generation uses it **softly** — "this looks like an early-game
quest, lean toward lower-difficulty references" — never as a hard filter. The exact
inference (which fields, how weighted) is an open decision (§8); start simple (one
difficulty score from stats) and refine.

> This is what the Qdrant payload index Part 1 deferred is for: index the *computed*
> difficulty/tier field, added with no re-ingest.

## 5. Backend changes

### 5.1 Structured-file ingestion (new, in front of Part 1's text path)
- Detect recognized files (by name/shape); parse into entities.
- Per entity: build a text representation to embed, store its fields as `metadata`, and
  attach the **inferred** progression score (§4).
- Unknown files → Part 1's freeform text ingestion unchanged.

### 5.2 Retrieval for reference (not restriction)
- Semantic search + exact-by-name over the entity entries; return a handful as **optional
  reference**, biased (not filtered) by the inferred progression.
- Extend `retrieve()` callers to pass the soft progression bias.

### 5.3 Context assembly — new
```ts
// src/services/generationContext.ts
// Assemble optional reference material for a generation step. Never an allowlist.
export async function buildReferenceContext(args: {
  gameId?: string; step: 'objectives' | 'characters' | 'questline'; query: string;
}): Promise<{ referenceBlock: string }>;   // "" when no game/KB — generation runs free
```

### 5.4 Light prompt changes (preserve freedom)
- Add an **optional** `REFERENCE MATERIAL` block to the existing builders, with wording
  like *"You may use or take inspiration from the following; you may also invent new
  elements that fit the world. Prefer referencing an existing entity over re-creating one."*
- **Do not** convert the prompts to allowlists or required-ID lists.
- When the model references an existing entity, link to it instead of creating a duplicate
  `Character`/reward.

## 6. Frontend changes

### 6.1 New: Game creation & editing page
- Route under HashRouter (`#/games`, `#/games/:gameId`); Game CRUD.
- **KB document manager**: upload recognized files (`mobs.json`, …) or paste freeform;
  list with `status`; edit `originalText`/metadata; delete.
- **Format help/templates** for the recommended files so users know the expected shape.
- **Test search** panel (Part 1's `/kb/search`).
- **Linking**: attach a Game to one or more Projects.

### 6.2 Quest-gen dialog — attach the KB
- **Game / KB selector** (optional — no selection = today's free generation). Show the
  active KB; allow the per-questline override (`questline.gameId`).

### 6.3 Wiring
- API hooks for Game + KB endpoints; generation request carries optional `gameId`.
- Surface `status: 'failed'` documents for retry.

## 7. Build order (Part 2)
1. Settle §8 decisions (recognized file set, progression inference, dedup/link).
2. Structured-file ingestion + per-entity explosion (on top of Part 1).
3. Inferred progression scoring; index the computed field.
4. Reference retrieval + context assembly (optional, progression-biased).
5. Light prompt changes, one builder at a time; keep generation free; verify node IDs.
6. Link referenced existing entities (no duplicates).
7. Frontend: Game page + format templates → quest-gen KB attach.

## 8. Open decisions
1. **Recognized file set** — beyond `mobs.json` / `drops.json` / `stats.json` /
   `maps.json`, what else? (Unknowns fall back to freeform, so this is just the
   convenience set.)
2. **Progression inference** — which fields and weighting drive the difficulty score?
   Stats only to start, or combine maps/drops? Continuous score, buckets, or both?
3. **Reference strength** — how strongly should the prompt nudge toward existing entities
   vs. inventing? (Default: gentle — reference *available*, invention *encouraged*.)
4. **Dedup/link** — auto-link a referenced existing entity to the questline, or just name
   it in the text?
5. **File format** — confirm the JSON shapes you'll document for users (name/stats/drops
   keys), so the parser and the inferred progression know what to read.
