import { KbType } from '../../api/gameApi';

// ---------------------------------------------------------------------------
// Shared presentation config for the KB categories: labels, badge colors and
// per-category format guidance. Ingestion is plain-text — any shape works —
// but a consistent structure per entry retrieves better, and these recommended
// shapes are what Part 2's structured parsing will recognize.
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<KbType, string> = {
  monsters: 'Monsters',
  maps: 'Maps',
  items: 'Items',
  general: 'General',
};

export const TYPE_BADGES: Record<KbType, string> = {
  monsters: 'bg-red-500/15 text-red-300',
  maps: 'bg-sky-500/15 text-sky-300',
  items: 'bg-amber-500/15 text-amber-300',
  general: 'bg-purple-500/15 text-purple-300',
};

export interface KbFormatHelp {
  /** What belongs in this category. */
  blurb: string;
  /** Bullet points on how to structure entries. */
  tips: string[];
  /** Insertable example the user can start from. */
  template: string;
}

export const FORMAT_HELP: Record<KbType, KbFormatHelp> = {
  monsters: {
    blurb:
      'Your bestiary — one entry per monster or enemy. Quest generation uses these to feature real creatures instead of inventing lookalikes.',
    tips: [
      'One heading per monster, details underneath.',
      'Include where it lives and how dangerous it is — that helps quests pick level-appropriate enemies.',
      'Stats, abilities and drops are free-form; keep the field names consistent across entries.',
    ],
    template: `## Goblin Scout
Zone: Whispering Caves (early game)
Stats: HP 30, ATK 5, DEF 2
Abilities: throws rocks, flees below half health
Drops: rusty dagger (common), goblin ear, copper coins
Notes: cowardly, roams in packs of 3-5

## Ember Drake
Zone: Cinder Peaks (late game)
Stats: HP 900, ATK 60, DEF 35
Abilities: fire breath (cone), wing gust knockback
Drops: drake scale (rare), ember heart (epic)
Notes: territorial; nests hold unhatched eggs
`,
  },
  maps: {
    blurb:
      'Zones, regions and dungeons — the geography of your world. Quests use these to place objectives in real locations and respect how areas connect.',
    tips: [
      'One heading per zone or area.',
      'Say what it connects to and when players typically reach it.',
      'List inhabitants and points of interest — great hooks for quest objectives.',
    ],
    template: `## Whispering Caves
Region: northern foothills
Progression: early game (levels 1-5)
Connects to: Greenfield Village (west), Deep Warrens (down)
Inhabitants: goblin scouts, cave bats
Points of interest: collapsed mineshaft, hidden shrine of the Pale Saint
Notes: echoes carry sound — stealth is hard here
`,
  },
  items: {
    blurb:
      'Items, gear and rewards. Quest generation references these so rewards match your actual loot tables instead of making up gear that does not exist.',
    tips: [
      'One heading per item.',
      'Include rarity and where it comes from — that keeps rewards progression-appropriate.',
      'Works for weapons, armor, consumables, quest items and currency alike.',
    ],
    template: `## Rusty Dagger
Type: weapon (dagger)
Rarity: common
Stats: +3 ATK
Source: goblin scouts, starter chests
Notes: vendor price 5 copper

## Ember Heart
Type: crafting material
Rarity: epic
Source: Ember Drake (guaranteed on first kill)
Notes: required for the Flamebrand forging questline
`,
  },
  general: {
    blurb:
      'Everything else — world lore, factions, story arcs, tone guides, character backstories, dialogue style. Free-form text; no structure required.',
    tips: [
      'Paste it as it is — chapters, wiki pages, design docs all work.',
      'Headings still help retrieval find the right passage.',
      'Good fits: creation myths, faction politics, NPC bios, timeline of events.',
    ],
    template: `## The Sundering of the Pale Saint
Long before the first kingdoms, the Pale Saint shattered the moon to
imprison something older than light. Shards fell across the northern
foothills — the caves still whisper with what leaked out.

## Factions
The Ashen Compact: miners' guild turned militia; controls the foothill trade.
The Moonwrights: scholars who collect shards; distrusted, tolerated, needed.
`,
  },
};
