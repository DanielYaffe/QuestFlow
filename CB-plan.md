# QuestFlow — Cassette Beasts Integration Plan

**Date:** May 11, 2026
**Scope:** Everything specific to shipping QuestFlow content as a Cassette Beasts mod — the CB theme, CB knowledge base, the CB sprite style, the CB Godot mod runtime, and the per-questline / per-bestiary / project-bundle exporters.

**Relationship to `ARCHITECTURE_PLAN.md`:**
This file is a focused subset of the broader plan. The parent plan covers the engine (jobs, Bedrock, sprite pipeline, prompt composer, projects, export dispatcher). This file is the CB-specific overlay that plugs into it. Where appropriate, sections here cross-reference plan numbers in the parent file (e.g. "Plan 7" = the export dispatcher, "Plan 11" = the prompt composer).

---

## Why Split This Out

CB is one of many themes QuestFlow supports — `generic_rpg` and future themes (dark fantasy, etc.) get the same engine treatment. But CB has:

- Its own Bedrock agent + knowledge base (type chart, beast list, world lore)
- Its own sprite style (`cb_pixel`) using a hand-trained LoRA
- Its own export target: a three-package Godot mod system (Core + questlines + bestiary), which is **far** more involved than any other export format
- Its own GDScript runtime that lives in a sibling folder (`cb-mod/`) inside the repo

Keeping all of this in `ARCHITECTURE_PLAN.md` made the parent file CB-heavy and made it harder to tell what's CB-specific vs theme-generic. This split keeps the parent plan honest about what's reusable and gives CB a focused brief.

---

## CB Pieces Across the Stack

| Layer | CB-specific piece | Lives in |
|---|---|---|
| Theme metadata | `cassette_beasts` GameTheme + ThemeConfig | DB seed (`models/seedThemes.ts`) |
| Knowledge base | `cb_kb/` files (type_chart, all_beasts, all_moves, world_lore) | S3 (uploaded manually) |
| Bedrock agent | CB agent system prompt | `services/prompts/system/cassette_beasts.md` |
| Sprite style | `cb_pixel` Style entry (checkpoint + LoRA + tuned prompts) | `backend/src/config/styles.ts` |
| LoRA file | `cb-000006.safetensors` (managed manually on ComfyUI host) | ComfyUI host `models/loras/` |
| Godot runtime | `questflow_core` mod (GDScript) | `cb-mod/` (top-level folder in repo) |
| Per-questline exporter | `cassetteBeatsExporter` + helpers | `services/export/cassetteBeatsExporter.ts`, `services/export/cb/*` |
| Per-bestiary exporter | `bestiaryExporter` | `services/export/cb/bestiaryExporter.ts` |
| Project-bundle exporter | `projectBundleExporter` | `services/export/cb/projectBundleExporter.ts` |
| In-game UI | Quest log + dialogue UI | `cb-mod/scripts/ui/` |

---

## Plan CB-1: CB Theme & Knowledge Base

### CB-1.1 Theme seed (DONE)
`models/seedThemes.ts` seeds the `cassette_beasts` GameTheme + ThemeConfig on startup. The ThemeConfig currently stores `loraModelPath` + `loraTriggerWord`; after the parent plan's Style Catalog refactor (Plan 3.4) it stores `defaultStyleId: 'cb_pixel'` instead.

### CB-1.2 CB Knowledge Base files ⬜
Files to author and upload to S3 at `cb_kb/`:

- `type_chart.json` — the 16 types and their matchup table.
- `all_beasts.json` — every official beast with stats, types, and signature moves. Used for *grounding* (stat ranges, type combinations) — never copied verbatim.
- `all_moves.json` — every official move with AP cost, category, and effect type.
- `world_lore.md` — New Wirral locations, factions, named NPCs, tone references.
- `reward_economy.md` — item tiers, currency conventions, recipe inputs.
- `naming_conventions.md` — beast naming patterns (portmanteaus, sound symbolism), location naming, NPC naming.
- `dialogue_examples.md` — short curated excerpts illustrating the wry/melancholy CB voice.

The Bedrock agent must be told: **use the KB as constraints, not as a catalog**. We invent freely; we just stay inside the rules. This phrasing matters — without it the agent copy-pastes from KB chunks.

### CB-1.3 Create CB Bedrock agent ⬜
Via the admin panel (parent Plan 6.6), create a Bedrock Agent named `questflow-cassette-beasts`:
- Foundation model: Haiku (cost) or Sonnet (quality, tradeoff to be evaluated).
- System prompt: `services/prompts/system/cassette_beasts.md` (see CB-1.4).
- Action groups: every generation tool (questline, monster, NPC, regenerate-node, etc.) with their JSON schemas from `services/prompts/tools/`.
- Knowledge base: associate the CB KB (created from `cb_kb/` via S3 Vectors per parent Plan 2 / 6.7).
- Save the resulting `bedrockAgentId` + `bedrockAliasId` to the `cassette_beasts` ThemeConfig.

Once these IDs are in place, every theme-aware quest generation request for CB switches from Gemini-with-theme-context to the full Bedrock agent path automatically — no code change needed (the parent `agentService.invokeAgent` is already wired).

### CB-1.4 CB system prompt ⬜
Lives at `services/prompts/system/cassette_beasts.md`. Loaded once at Bedrock agent creation time.

```
You are the Cassette Beasts content agent for QuestFlow.

ROLE
You help users design quests, monsters, NPCs, and rewards that
feel native to Cassette Beasts — a 2D monster-collection RPG with
a quirky, melancholy-tinged tone, set in the post-cataclysmic
world of New Wirral.

GROUNDING RULES (HARD)
You have access to a Knowledge Base containing:
  - The official type chart (16 types and their matchups)
  - Stat ranges by tier (starter, mid, late, legendary)
  - Move taxonomy (categories, AP costs, effect types)
  - World lore, locations, factions, named NPCs
  - Item/reward economy and tier definitions
  - Dialogue and naming conventions

You MUST:
  - Use only the 16 types from the type chart. Never invent new types.
  - Place monster stats within the documented tier range.
  - Use AP costs from the documented range (1–4).
  - Match the game's tone in dialogue (wry, understated, occasionally
    dark, never melodramatic).

You SHOULD:
  - Invent original monsters, moves, NPCs, locations, and rewards.
    The KB is rules and conventions, NOT a catalog to copy.
  - Reference real CB locations and factions when it adds flavor,
    but never claim a new monster IS a real CB beast.
  - Compose new content that *feels like it belongs* in CB.

OUTPUT DISCIPLINE
You will be given a tool to call with a strict JSON schema. Always
call the tool. Do not write prose responses outside the tool call.
If you cannot fulfill the request (e.g. the user's input violates
type chart rules), call the tool with an `error` field explaining
why and propose alternatives.
```

---

## Plan CB-2: CB Sprite Style

### CB-2.1 `cb_pixel` Style entry (in static catalog)
Inside `backend/src/config/styles.ts` (parent Plan 3.4), the CB style entry:

```ts
{
  id: 'cb_pixel',
  name: 'Cassette Beasts',
  description: 'Pixel-art monster style inspired by Cassette Beasts',
  previewImagePath: 'styles/cb_pixel/preview.png',
  category: 'pixel',
  baseModel: 'SDXL',
  checkpoint: 'pixelArtDiffusionXL.safetensors',
  loras: [
    {
      filename: 'cb-000006.safetensors',
      triggerWord: 'cbstyle',
      strength: 0.85,
      strengthClip: 0.8,
    },
    {
      filename: 'dmd2_sdxl_4step_lora.safetensors',
      strength: 1.0,
      strengthClip: 1.0,
    },
  ],
  promptPrefix: 'cbstyle, monster creature, pixel art, clean outline,',
  negativePrompt:
    'photo, realistic, 3d render, blurry, low quality, text, watermark, ' +
    'signature, jpeg artifacts',
  defaultDimensions: { width: 1024, height: 1024 },
  sampler: { steps: 4, cfg: 1.2, sampler: 'euler', scheduler: 'simple' },
  isDefault: true,
}
```

Notes (informing the chosen values, not implementation tasks):
- LoRAs are stacked via ComfyUI's `Power Lora Loader (rgthree)`. Order: style LoRA first, DMD2 last. DMD2 is always present — see parent Plan 3.4 / Key Design Decision #7.
- The style LoRA's `strength: 0.85` is slightly higher than the previous `0.75` because DMD2's low-CFG regime gives the style LoRA less leverage; nudging strength up compensates.
- `strengthClip: 0.8` on the style LoRA lets the user's subject text speak instead of being hijacked by the LoRA's training captions.
- Negative prompt is purpose-tuned. It does *not* include the legacy generic anti-realism terms (no "human face", no "symmetrical body", no "bright happy colors"). Those phrases fight CB-style creatures and were sabotaging generations.
- Sampler params (`steps: 4`, `cfg: 1.2`, `euler`/`simple`) are DMD2's required range. Every style in the catalog uses these same values.

---

## Plan CB-3: CB Mod Architecture (Three-Package System)

### CB-3.1 Goal
Ship a **three-part mod system** for Cassette Beasts:

1. **`questflow_core`** — wrapper mod, installed once, contains all GDScript runtime.
2. **`questflow_questline_<id>`** — one per exported questline, pure data + assets.
3. **`questflow_bestiary_<projectId>`** — optional, one per project, holds orphan monsters and shared characters not tied to a specific questline.

Core auto-discovers questline AND bestiary packages at startup. Questlines can reference monsters from a bestiary package as a soft dependency. **Updating one questline doesn't require re-exporting the whole project** — drop in the new questline package, leave bestiary and other questlines untouched.

### CB-3.2 Key Design Decisions

1. **Wrapper + plugins, not self-contained mods.** Three package types coexist in `mods/`:
   - **`questflow_core`** — the wrapper. Ships once. Contains all runtime: quest engine, dialogue runner, monster injector, NPC hook, quest log UI, asset registrar. On `_ready()`, scans `mods/` for sibling `questflow_questline_*` AND `questflow_bestiary_*` folders, loads bestiaries first, then questlines.
   - **`questflow_questline_<id>`** — questline package. Pure data + assets for one questline. Can declare `requires_bestiary` for any orphan monsters it references.
   - **`questflow_bestiary_<projectId>`** — bestiary package, optional, one per project. Holds orphan monsters and shared characters not bound to a specific questline. Multiple questlines can reference the same bestiary package.
2. **Why wrapper over self-contained:**
   - Runtime updates ship once — fix a bug in the dialogue runner, every installed questline benefits without re-downloading.
   - No GDScript duplication. 10 questlines = 1 copy of the runtime, not 10.
   - Unified quest log across all installed questlines.
   - Per-questline downloads are 80%+ smaller (no scripts, just JSON + sprites).
   - Conflict resolution (NPC names, species names, save scoping) lives in one place.
   - Versioning: Core declares `runtime_version`, questlines declare `requires_runtime: ">=1.2"` — Core refuses incompatible questlines instead of silently breaking.
3. **Soft cross-package references.** A questline can reference an orphan monster from `questflow_bestiary_<projectId>`. If the bestiary is installed, Core's monster registry resolves the reference normally. If missing, Core logs a clear warning and the affected quest node is skipped/marked unavailable instead of crashing.
4. **Bestiaries load before questlines.** Plugin loader sorts discovery results so all bestiary packages register their species before any questline is processed.
5. **Update granularity matches user mental model.** Edit one questline → re-export → replace one folder. Add an orphan monster → re-export bestiary → replace one folder. Add a brand-new questline → drop in one new folder. No whole-project re-export ever required for incremental changes.
6. **Project-level bundle = zip-of-folders, not zip-of-zips.** When the user clicks "Export Project," QuestFlow produces a single zip containing all the mod folders side-by-side at the root. User extracts once, all packages land in `mods/`.
7. **Trade-off accepted:** User must install Core once before any questline works. One-time friction; questline zip README links to Core's download.
8. **Per-questline `mod.tres` is a stub.** CB's mod loader expects every folder in `mods/` to have a `mod.tres`. Questline AND bestiary packages ship a minimal stub declaring a dependency on `questflow_core` — the stub's autorun is empty, all real work happens in Core's discovery loop.
9. **Static GDScript in the Core repo, dynamic JSON in the export.** Core lives at `cb-mod/` in the QuestFlow repo — version-controlled, edited like any other code, packaged via a build script. Per-questline and per-bestiary exports are pure data generation.
10. **Only used assets are bundled per-package.** Questline packages ship only the characters their nodes reference. Bestiary packages ship orphan monsters explicitly assigned to the project's bestiary in the QuestFlow UI.
11. **Asset deduplication within a package.** If two quests in the same questline reference the same NPC portrait, the file is bundled once. Cross-package dedup is not attempted.
12. **Discovery via `DirAccess`.** Core's autorun walks the `mods/` directory at startup, finds every folder starting with `questflow_questline_` or `questflow_bestiary_`, parses each `manifest.json`, validates `requires_runtime` and `requires_bestiary`, and registers content in order.
13. **Save scoping.** Core writes quest state to a single mod-scoped save extension keyed by `questline_id`. Bestiary packages don't write save state. Uninstalling a questline removes only its quest state; bestiary monsters captured by the player live in vanilla save data via CB's normal mechanisms.
14. **Zip extracts directly into `mods/`.** All package zips (Core, questline, bestiary, project bundle) have their mod folder(s) at the zip root.

### CB-3.3 Mod Structure

#### Part A: `questflow_core` (one-time install)

```
questflow_core/                          ← zip root, extract into CB's mods/
├── mod.tres                             # manifest (autoload: autorun.gd, runtime_version)
├── autorun.gd                           # boots Core, scans mods/ for questline plugins
└── scripts/
    ├── plugin_loader.gd                 # discovers + loads questflow_questline_* folders
    ├── quest_engine.gd                  # tracks active quests, objectives, completion
    ├── dialogue_runner.gd               # parses dialogue JSON, drives UI
    ├── monster_injector.gd              # registers SpeciesData from any questline
    ├── reward_dispenser.gd              # gives items/monsters on quest completion
    ├── npc_hook.gd                      # patches NPC dialogue trigger globally
    ├── save_extension.gd                # mod-scoped save data, keyed by questline_id
    ├── version.gd                       # runtime_version constant + compat check
    └── ui/
        ├── quest_log.gd + quest_log.tscn      # in-game quest log (J key)
        └── dialogue_ui.gd + dialogue_ui.tscn
```

Core lives at `cb-mod/` in the QuestFlow repo — edited as regular GDScript, packaged into a zip via `npm run build:cb-core`.

#### Part B: `questflow_questline_<id>` (one zip per export)

```
questflow_questline_<slug>_<id>/         ← zip root, extract into CB's mods/
├── mod.tres                             # stub manifest, depends on questflow_core
├── manifest.json                        # questline metadata, requires_runtime
├── data/
│   ├── questline.json                   # full questline graph (nodes, edges, variants)
│   ├── npcs.json                        # character roster with portrait refs
│   ├── rewards.json                     # rewards with item/monster mappings
│   └── triggers.json                    # NPC name → quest node ID mapping
├── species/
│   ├── wraithand.tres                   # one .tres per generated monster used
│   └── ...
├── sprites/
│   ├── wraithand.png + wraithand.json   # battle sheet + Aseprite tags
│   ├── wraithand_world.png + .json      # world sheet
│   └── ...
├── portraits/
│   ├── elder_marlowe.png                # NPC portrait
│   └── ...
├── reward_icons/
│   ├── shadow_amulet.png                # reward image (when present)
│   └── ...
├── dialogue/
│   └── <questNodeId>/
│       ├── intro.json
│       └── completion.json
└── README.txt                           # install instructions, links to Core download
```

#### Part C: `questflow_bestiary_<projectId>` (one per project, optional)

```
questflow_bestiary_<slug>_<projectId>/   ← zip root, extract into CB's mods/
├── mod.tres                             # stub manifest, depends on questflow_core
├── manifest.json                        # bestiary metadata, requires_runtime
├── species/
│   ├── ironcrest.tres                   # one .tres per orphan monster
│   ├── velvetmoth.tres
│   └── ...
├── sprites/
│   ├── ironcrest.png + ironcrest.json
│   ├── ironcrest_world.png + .json
│   └── ...
└── README.txt                           # install instructions
```

#### Part D: Project bundle (single zip from "Export Project")

```
questflow_project_<slug>_<projectId>.zip
├── questflow_bestiary_<slug>_<projectId>/   ← all sibling folders extract into mods/
├── questflow_questline_<slug>_<id1>/
├── questflow_questline_<slug>_<id2>/
├── questflow_questline_<slug>_<id3>/
└── README.txt                                # explains incremental updates
```

Zip-of-folders, not zip-of-zips. User extracts once into `mods/`.

### CB-3.4 Manifest Contracts

#### Questline `manifest.json`

```json
{
  "package_kind": "questline",
  "questline_id": "shadowreach_a3f7e9",
  "project_id": "p_2k9z",
  "title": "The Shadow Reach",
  "description": "...",
  "author": "QuestFlow",
  "version": "2026-05-08",
  "requires_runtime": ">=1.0",
  "requires_bestiary": ["questflow_bestiary_dawnvale_p_2k9z"],
  "entry_npc": "ElderMarlowe",
  "monsters_local": ["wraithand"],
  "monsters_external": ["ironcrest", "velvetmoth"],
  "asset_paths": {
    "species_dir": "species/",
    "sprite_dir": "sprites/",
    "portrait_dir": "portraits/",
    "dialogue_dir": "dialogue/"
  }
}
```

- `monsters_local` — bundled in this questline package (used only by this questline's nodes)
- `monsters_external` — referenced by this questline but provided by a bestiary package listed in `requires_bestiary`
- `requires_bestiary` — soft dependency. Core warns if missing; affected nodes degrade gracefully.

#### Bestiary `manifest.json`

```json
{
  "package_kind": "bestiary",
  "bestiary_id": "questflow_bestiary_dawnvale_p_2k9z",
  "project_id": "p_2k9z",
  "title": "Dawnvale Bestiary",
  "description": "Shared monster roster for the Dawnvale campaign",
  "author": "QuestFlow",
  "version": "2026-05-08",
  "requires_runtime": ">=1.0",
  "monsters": ["ironcrest", "velvetmoth", "scrapwing"],
  "asset_paths": {
    "species_dir": "species/",
    "sprite_dir": "sprites/"
  }
}
```

---

## Plan CB-4: Core Mod Runtime (GDScript)

Lives at `cb-mod/` in the QuestFlow repo, version-controlled, edited as GDScript.

### CB-4.1 Key behaviors

- `autorun.gd`: on `_ready()`, instantiates singletons (quest_engine, dialogue_runner, etc.), then calls `plugin_loader.discover_and_load()`.
- `plugin_loader.gd`: walks `mods/` via `DirAccess`, finds folders matching `questflow_bestiary_*` and `questflow_questline_*`. **Two-pass load:**
  - **Pass 1** — parse all bestiary manifests, validate `requires_runtime`, register every monster via `monster_injector` (species namespaced by `bestiary_id` to avoid collisions across projects).
  - **Pass 2** — parse all questline manifests, check `requires_bestiary` against loaded bestiaries (log warnings for missing ones, mark dependent questlines "partial"), then register the questline's local monsters, NPC triggers, and dialogue paths.
- `quest_engine.gd`: stores active quest state via `save_extension.gd`, keyed by `questline_id`. Tracks current node per quest, completed objectives. Survives uninstall of any single questline or bestiary.
- `npc_hook.gd`: monkey-patches CB's NPC interaction system once. On dialogue trigger, checks the global trigger registry for any questline that has a node bound to this NPC + matching quest state. If the matched node references an `external` monster from a missing bestiary, logs a clear warning and routes to a fallback "this content is missing — install bestiary X" dialogue instead of crashing.
- `monster_injector.gd`: registers SpeciesData with CB. Auto-prefixes species names — questline-local monsters get `<questline_id>_<name>`, bestiary monsters get `<bestiary_id>_<name>`. Prevents collisions across installed packages.
- `save_extension.gd`: nested dictionary `{ questline_id: { active: [], completed: [], state: {} } }`. Reads/writes via CB's mod save hook.
- `version.gd`: declares `RUNTIME_VERSION = "1.0.0"` and a semver-compat checker for `requires_runtime`.

### CB-4.2 Core build script

```
scripts/build-cb-core.ts (or .sh)
```

Packages `cb-mod/` into `questflow_core_<version>.zip`. Run on Core releases. Output uploaded to the QuestFlow site / GitHub releases — questline READMEs link to the latest version.

### CB-4.3 In-game quest log UI
Mounted by Core, accessible via the J key (or a configurable hotkey):
- Lists active and completed quests **across all installed questlines**.
- Each quest shows its source questline name.
- Click a quest → expand to see all nodes and the NPC to talk to next.
- Built as a Godot `.tscn` shipped in `cb-mod/scripts/ui/quest_log.tscn`.

---

## Plan CB-5: Exporters (Plug Into Plan 7 Dispatcher)

The export dispatcher lives in the parent plan (Plan 7). CB ships three exporter classes that register with it.

### CB-5.1 Per-questline manifest generator

```typescript
// services/export/cb/manifestGenerator.ts

// Stub mod.tres — CB's mod loader requires this in every mod folder.
// Empty autorun (Core does the work), declares Core as a dependency.
export function generateStubModTres(questline: IQuestline, packageId: string): string {
  return `[gd_resource type="ModInfo" format=2]

[resource]
mod_id = "${packageId}"
name = "${escapeQuotes(questline.title)} (QuestFlow)"
description = "${escapeQuotes(questline.description)}"
author = "QuestFlow"
version = "${new Date().toISOString().split('T')[0]}"
game_version = "1.6"
autoload = ""
dependencies = ["questflow_core"]
`;
}

// manifest.json — what Core actually reads
export function generateManifest(questline: IQuestline, packageId: string): object {
  return {
    questline_id: extractQuestlineId(packageId),
    title: questline.title,
    description: questline.description,
    author: 'QuestFlow',
    version: new Date().toISOString().split('T')[0],
    requires_runtime: '>=1.0',
    entry_npc: findEntryNpc(questline),
    monsters: collectMonsterNames(questline),
    asset_paths: {
      species_dir: 'species/',
      sprite_dir: 'sprites/',
      portrait_dir: 'portraits/',
      dialogue_dir: 'dialogue/',
    },
  };
}
```

Package ID format: `questflow_questline_<slugified-title>_<short-questlineId>` (e.g. `questflow_questline_shadowreach_a3f7e9`).

### CB-5.2 Questline serializer

```typescript
// services/export/cb/questlineSerializer.ts
export interface ExportedQuestline {
  meta: { id: string; title: string; description: string; createdAt: string };
  nodes: Array<{
    id: string; type: string; title: string; body: string; variant: string;
    npcId?: string; monsterIds: string[]; rewardIds: string[];
  }>;
  edges: Array<{ from: string; to: string }>;
  startNodeId: string;
}
```

Serializes the questline graph into a runtime-friendly shape (the runtime doesn't need MongoDB ObjectIds, just stable string IDs).

### CB-5.3 NPC trigger mapper

```typescript
// services/export/cb/triggerMapper.ts
// Reads questline + characters, produces:
// triggers.json: { "ElderMarlowe": { questId: "...", nodeId: "...", phase: "intro" } }
```

CB identifies NPCs by their internal name. The mapper takes the QuestFlow `Character.name`, normalizes it to a CB-compatible identifier, and binds it to the entry quest node.

### CB-5.4 Asset bundler

The bundler consumes the **already-saved** S3 assets on each `Character` record produced by the parent Plan 4 character pipeline. It does **not** trigger generation, animation, or .tres production — those are user-driven on the character page. The bundler's job is purely "collect what exists, zip it."

```typescript
// services/export/cb/assetBundler.ts
// 1. Walk questline → collect referenced characterIds + rewardIds.
// 2. For each character (kind=monster) referenced:
//    a. Read `character.assets.snappedSpriteS3Key` (required — character is not exportable without it).
//    b. Read `character.assets.spritesheetS3Key` + `spritesheetJsonS3Key` if present
//       (only when user ran "Generate Animations" — Plan 4.3).
//    c. Read or synthesize `character.speciesData` for the .tres formatter.
// 3. Download each asset from S3 (presigned GETs in parallel). Deduplicate by S3 key.
// 4. The .tres file is generated *just in time* by the CB .tres formatter (Plan 7.3
//    plugin) consuming `character.speciesData` + the sprite paths inside the zip.
//    It is not pre-generated and stored on the Character.
// 5. Add to zip at the correct path:
//    monster sprite     → sprites/<name>.png       (from snappedSpriteS3Key)
//    monster spritesheet→ sprites/<name>.png + .json  (overrides #5a when present)
//    NPC portraits      → portraits/<name>.png
//    reward icons       → reward_icons/<name>.png
//    monster .tres      → species/<name>.tres      (generated by CB .tres formatter)
// 6. Track final paths so questline.json/npcs.json/rewards.json reference them correctly.
```

If a referenced character has no `snappedSpriteS3Key`, the bundler logs a warning and excludes it from the export with a `manifest.json` annotation listing skipped characters. The user fixes by going to that character's editor and selecting a sprite.

### CB-5.5 Dialogue generator

For each quest node, generate one or two dialogue files:
- `intro.json` — what the NPC says when the quest starts / is in progress
- `completion.json` — what they say after the player finishes the node's objective

Dialogue body comes from the existing `IQuestNode.body` field. Combat/treasure variants get a different template.

```typescript
// services/export/cb/dialogueGenerator.ts
export interface DialogueScript {
  speaker: string;
  lines: Array<{ text: string; choices?: Array<{ label: string; goto: string }> }>;
  onComplete?: { battle?: string; reward?: string; advance?: string };
}
```

### CB-5.6 Questline Exporter (top-level)

```typescript
// services/export/cassetteBeatsExporter.ts
// Implements BaseExporter.export(questline) → Buffer (zip)
// NOTE: Exports ONLY the questline package. Core is shipped separately.

export class CassetteBeatsExporter extends BaseExporter {
  async export(questline: IQuestline): Promise<Buffer> {
    const packageId = generatePackageId(questline);
    const zip = new JSZip();
    const root = zip.folder(packageId)!;

    // 1. Stub manifest + Core-readable manifest
    root.file('mod.tres',     generateStubModTres(questline, packageId));
    root.file('manifest.json', JSON.stringify(generateManifest(questline, packageId), null, 2));

    // 2. Data
    const exported = serializeQuestline(questline);
    const triggers = mapTriggers(questline);
    const npcs     = serializeNpcs(questline.characters);
    const rewards  = serializeRewards(questline.rewards);
    root.folder('data')!.file('questline.json', JSON.stringify(exported, null, 2));
    root.folder('data')!.file('triggers.json',  JSON.stringify(triggers, null, 2));
    root.folder('data')!.file('npcs.json',      JSON.stringify(npcs, null, 2));
    root.folder('data')!.file('rewards.json',   JSON.stringify(rewards, null, 2));

    // 3. Assets (S3 → zip, deduplicated)
    await bundleAssets(root, questline);

    // 4. Dialogue
    await generateDialogueFolder(root.folder('dialogue')!, questline);

    // 5. README pointing to Core download
    root.file('README.txt', generateReadme(questline, packageId));

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
}
```

When serializing the questline, the exporter walks every node's `monsterIds`/`characterIds` and splits them:
- Characters owned by this questline → bundled inline → `monsters_local`
- Characters that live in the project's bestiary → only their species names recorded → `monsters_external` + `requires_bestiary`

This keeps questline packages small and ensures bestiary monsters are loaded once, not duplicated per questline.

### CB-5.7 Bestiary Exporter

```typescript
// services/export/cb/bestiaryExporter.ts

export class BestiaryExporter {
  async export(project: IProject, monsters: ICharacter[]): Promise<Buffer> {
    const bestiaryId = generateBestiaryId(project);
    const zip = new JSZip();
    const root = zip.folder(bestiaryId)!;

    root.file('mod.tres',     generateStubModTres(project, bestiaryId, 'bestiary'));
    root.file('manifest.json', JSON.stringify(generateBestiaryManifest(project, bestiaryId, monsters), null, 2));

    // species/*.tres + sprites/*.{png,json} for every monster in the bestiary
    await bundleMonsterAssets(root, monsters);

    root.file('README.txt', generateBestiaryReadme(project, bestiaryId));

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
}
```

**Triggered by:**
- Manual export from the project's bestiary page (parent Plan 9.7) — "Export Bestiary as Mod".
- Automatically as part of the project bundle (CB-5.8).

The set of monsters in the bestiary is **explicit**: in the QuestFlow UI, the user marks which characters belong to the project's bestiary (vs being purely orphan, vs being inline-with-a-questline). Default behavior: any character marked "shared" or referenced by 2+ questlines auto-suggests bestiary inclusion; the user confirms.

### CB-5.8 Project Bundle Exporter

```typescript
// services/export/cb/projectBundleExporter.ts

export class ProjectBundleExporter {
  async export(project: IProject): Promise<Buffer> {
    const zip = new JSZip();

    // 1. Bestiary (only if the project has bestiary monsters)
    const bestiaryMonsters = await getBestiaryMonsters(project._id);
    if (bestiaryMonsters.length > 0) {
      const bestiaryZip = await new BestiaryExporter().export(project, bestiaryMonsters);
      await mergeZipIntoBundle(zip, bestiaryZip);
    }

    // 2. Each questline as its own sibling folder
    const questlines = await QuestlineModel.find({ projectId: project._id });
    for (const questline of questlines) {
      const questlineZip = await new CassetteBeatsExporter().export(questline);
      await mergeZipIntoBundle(zip, questlineZip);
    }

    // 3. Top-level README explaining incremental updates
    zip.file('README.txt', generateProjectBundleReadme(project, questlines, bestiaryMonsters));

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
}
```

The project bundle is meant for **first-time install** of a whole campaign. After that, users update incrementally — see CB-6 README content for the flow.

---

## Plan CB-6: README Templates

Three README variants are generated per export. Templates live in `services/export/cb/readmeGenerator.ts`.

### CB-6.1 Per-questline README

```
========================================
  <Questline Title> — by QuestFlow
========================================

This is a QuestFlow questline package. To play it you need:

1. Cassette Beasts installed (version 1.6+)
2. The QuestFlow Core mod installed (one-time setup)

----------------------------------------
INSTALL — first time only
----------------------------------------

a) Download the Core mod:
     <CORE_DOWNLOAD_URL>

b) Find your Cassette Beasts mods folder:
     Windows:  %APPDATA%\Cassette Beasts\mods
     macOS:    ~/Library/Application Support/Cassette Beasts/mods
     Linux:    ~/.local/share/Cassette Beasts/mods

c) Extract `questflow_core` into that mods folder.

----------------------------------------
INSTALL THIS QUESTLINE
----------------------------------------

a) Extract `<package_id>` into the same mods folder.
b) If this questline depends on a bestiary package, extract that too.
   This questline depends on:
     <REQUIRES_BESTIARY_LIST_OR_NONE>
c) Launch Cassette Beasts.
d) Talk to <ENTRY_NPC_NAME> to start the questline.

Press J in-game to open the quest log.

----------------------------------------
UPDATING
----------------------------------------
To update this questline, just delete its folder from
mods/ and extract the new version. Other questlines,
the bestiary, and your vanilla saves are unaffected.

----------------------------------------
UNINSTALL
----------------------------------------
Delete the questline folder from mods/. Your save data
for this questline is removed; other questlines and
vanilla saves are unaffected.
```

### CB-6.2 Project bundle README

```
========================================
  <Project Title> — by QuestFlow
========================================

This bundle contains:
  - 1 bestiary package (<N> shared monsters)
  - <M> questline packages

INSTALL
  1. Install QuestFlow Core (one-time): <CORE_DOWNLOAD_URL>
  2. Extract every folder in this bundle into your CB mods/
     folder (same locations as above).
  3. Launch the game.

INCREMENTAL UPDATES
  After installing this bundle, you do NOT need to reinstall
  the whole project when something changes. Each folder is
  independently replaceable:

    - To update one questline:    re-export just that questline
                                  from QuestFlow, replace the folder.
    - To update the bestiary:     re-export the bestiary, replace
                                  the folder. All questlines pick
                                  up the new monsters automatically.
    - To add a new questline:     export it, drop it in.
    - To remove a questline:      delete its folder.

  The QuestFlow Core mod handles the wiring — you never
  need to reinstall it unless QuestFlow says so.
```

### CB-6.3 Bestiary README

```
========================================
  <Project Title> — Bestiary
========================================

This package adds <N> monsters to Cassette Beasts.
These monsters can be used by QuestFlow questlines
that depend on this bestiary.

REQUIRES
  - QuestFlow Core mod
  - At least one questline that uses these monsters
    (otherwise the monsters are loaded but never
    encountered)

INSTALL
  Extract this folder into your CB mods/ folder.

UPDATE
  Delete the existing <bestiary_id> folder, extract
  the new version. Questlines using these monsters
  pick up changes automatically.
```

---

## Plan CB-7: UI Integration

### CB-7.1 Attach Monster from QuestBuilder
In QuestBuilder, when the user opens a quest node's editor:
- "Attach Monster" button → opens a picker showing the project's existing monster characters (filtered to `kind=monster`).
- "+ Create new" inside the picker **navigates to the full Character editor page** (parent Plan 4 / 9.8), not a modal. The URL includes a return param: `/projects/:projectId/characters/new?returnTo=quest:<questId>:<nodeId>`. The user authors the monster on that page (lore, appearance, stats, sprite iteration) — same page, same experience as any other character authoring.
- On save, the editor reads `returnTo`, navigates back to QuestBuilder at the original quest/node, and the auto-attach logic there reads the new `characterId` from the navigation state and appends it to `node.monsterIds`.
- The new monster then appears in the node panel with its `snappedSpriteS3Key` thumbnail.
- On export, the bundler (CB-5.4) collects that character's saved sprite/spritesheet assets — generation never happens at export time.

This replaces the May 8 plan where QuestBuilder could trigger a background monster-generation pipeline. Monster authoring is now a real page; QuestBuilder only attaches existing characters, and the "create new" affordance is a structured detour to the editor page and back.

### CB-7.2 Bestiary management page
`pages/Project/Bestiary.tsx` (parent Plan 9.7):
- Mark which characters belong to the project's bestiary.
- "Export Bestiary as Mod" button → calls bestiary exporter (CB-5.7).
- Auto-suggests bestiary inclusion for any character referenced by 2+ questlines or marked orphan; user confirms.

### CB-7.3 Export buttons
- **Questline page** → "Export as CB Mod" → single questline (CB-5.6).
- **Bestiary page** → "Export Bestiary as Mod" → bestiary only (CB-5.7).
- **Project dashboard** → "Export Project Bundle" → full zip (CB-5.8).

---

## Plan CB-8: Sub-Tasks

| # | Task | Depends On | Files | Status |
|---|------|------------|-------|--------|
| CB-1.2 | Author CB KB files (type_chart, all_beasts, all_moves, world_lore, reward_economy, naming_conventions, dialogue_examples) | — | `cb_kb/*` (S3) | ⬜ |
| CB-1.3 | Create CB Bedrock agent in AWS, save IDs to ThemeConfig | parent 6.6 | admin panel | ⬜ |
| CB-1.4 | CB system prompt | — | `services/prompts/system/cassette_beasts.md` | ⬜ |
| CB-2.1 | `cb_pixel` style entry in static catalog | parent 3.4 | `backend/src/config/styles.ts` | ⬜ |
| CB-4.1 | Build Core mod (GDScript runtime) | — | `cb-mod/` (new top-level folder) | ⬜ |
| CB-4.2 | Core build script + release packaging | CB-4.1 | `scripts/build-cb-core.ts` | ⬜ |
| CB-4.3 | In-game quest log UI (in Core) | CB-4.1 | `cb-mod/scripts/ui/quest_log.tscn` | ⬜ |
| CB-5.1 | Per-questline manifest generator (mod.tres stub + manifest.json) | — | `services/export/cb/manifestGenerator.ts` | ⬜ |
| CB-5.2 | Questline serializer | — | `services/export/cb/questlineSerializer.ts` | ⬜ |
| CB-5.3 | NPC trigger mapper | CB-5.2 | `services/export/cb/triggerMapper.ts` | ⬜ |
| CB-5.4 | Asset bundler (S3 → zip, dedup) | parent 4.4 | `services/export/cb/assetBundler.ts` | ⬜ |
| CB-5.5 | Dialogue generator | CB-5.2 | `services/export/cb/dialogueGenerator.ts` | ⬜ |
| CB-5.6 | CB questline exporter (Plan 7 plugin) | parent 7.1, CB-5.1–5.5, parent 9.2 | `services/export/cassetteBeatsExporter.ts` | ⬜ |
| CB-5.7 | CB bestiary exporter (orphan/shared monsters) | CB-5.4, parent 9.2 | `services/export/cb/bestiaryExporter.ts` | ⬜ |
| CB-5.8 | CB project bundle exporter (zip-of-folders) | CB-5.6, CB-5.7 | `services/export/cb/projectBundleExporter.ts` | ⬜ |
| CB-6 | README generators (questline + bestiary + project bundle) | CB-5.6–5.8 | `services/export/cb/readmeGenerator.ts` | ⬜ |
| CB-7.1 | Attach monster from QuestBuilder (picker over existing characters + modal Character editor for "create new") | parent 4.6, parent 9.2, parent 9.8 | `pages/QuestBuilder/components/MonsterPicker.tsx` | ⬜ |
| CB-7.2 | Bestiary management UI (mark shared, "export bestiary") | parent 9.7 | `pages/Project/Bestiary.tsx` | ⬜ |
| CB-7.3 | Wire CB exporters into Project/Questline/Bestiary pages | CB-5.6–5.8, parent 9.1 | Project + Questline + Bestiary pages | ⬜ |
| CB-8 | Integration test: Core install + bestiary + multiple questlines + incremental updates | CB-4.1, CB-5.6–5.8, CB-4.3 | Manual testing | ⬜ |

---

## Plan CB-9: Risks Specific to CB Integration

| Risk | Impact | Mitigation |
|------|--------|------------|
| CB updates break the Core runtime | All installed questlines stop working | Pin `game_version = "1.6"` in Core's `mod.tres`, ship Core updates separately when CB updates |
| User installs questline without Core | Questline silently does nothing | Stub `mod.tres` declares Core as dependency — CB warns. README links to Core download. |
| Runtime version mismatch (old Core, new questline) | Questline rejected at load time | Core's `version.gd` checks `requires_runtime` semver; logs clear error and skips incompatible questlines instead of crashing |
| NPC name collisions with CB's built-in NPCs | Quest dialogue overrides game dialogue | Trigger registry tracks both questline_id and NPC name; vanilla NPCs without registered triggers fall through unchanged |
| Two questlines bind the same NPC | First-loaded wins, second hidden | Plugin loader logs collisions; quest log UI shows warning to user |
| Monster species name collisions across questlines | Bestiary corruption | Core's `monster_injector` auto-prefixes species names with `questline_id` (local) or `bestiary_id` (shared) |
| Questline references bestiary monster but bestiary is missing | Quest can't trigger battle | Core's plugin loader detects via `requires_bestiary`, marks affected nodes "partial", routes to fallback dialogue ("install bestiary X to play this content") |
| User updates bestiary but old questline references a removed monster | Reference broken | `monster_injector` flags missing references at load; affected nodes degrade gracefully. QuestFlow UI surfaces the same warning at export time so the user catches it before shipping |
| User installs project bundle then incrementally updates one questline — folder names mismatch | Old questline orphaned | Package IDs are deterministic from `<slug>_<questlineId>`; re-exports always overwrite the same folder. Bundle README explicitly says "extract overwrites" |
| Bestiary changes mid-playthrough remove a captured species | Player loses monster | Captured beasts persist in vanilla save data; species can no longer be encountered until bestiary reinstalled, but the captured one stays usable |
| Save data corruption when a questline is removed | Player loses progress | Save extension nests state under `questline_id`; deleting a questline folder leaves other questlines and vanilla saves intact |
| Mod folder name has spaces or special chars | Godot fails to load | Slugify aggressively when generating package_id |

---

## Cross-References to Parent Plan

| Parent plan | CB section that depends on it |
|---|---|
| Plan 2 (Bedrock + KB) | CB-1.2, CB-1.3 |
| Plan 3.4 (Static Style Catalog) | CB-2.1 |
| Plan 4 (Character & Monster pipeline) | CB-5.4 (consumes character assets), CB-7.1 (picks existing characters) |
| Plan 6.6 (Admin: configure Bedrock agents) | CB-1.3 |
| Plan 7 (Export dispatcher) | CB-5.6, CB-5.7, CB-5.8 |
| Plan 7.3 (Per-character export) | CB-5 .tres formatter is now a Plan 7.3 plugin |
| Plan 9 (Projects + Characters) | CB-7.1, CB-7.2 |
| Plan 11.1 (System prompt templates) | CB-1.4 |
| Plan 11.8 (Character section agents) | CB-1.2 (KB grounding for stats) |
| Plan 11.7 (Image prompt composer) | CB-2.1 |
