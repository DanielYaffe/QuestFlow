import { KbType } from '../../api/gameApi';

// ---------------------------------------------------------------------------
// Shared presentation config for the KB categories: labels, badge colors and
// per-category format guidance. Ingestion is plain-text — any shape works —
// but a consistent structure per entry retrieves better, and these recommended
// shapes are what Part 2's structured parsing will recognize.
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<KbType, string> = {
  monsters: 'Monsters',
  characters: 'Characters',
  maps: 'Maps',
  items: 'Items',
  quests: 'Quests',
  lore: 'Lore',
  general: 'General',
};

export const TYPE_BADGES: Record<KbType, string> = {
  monsters: 'bg-red-500/15 text-red-300',
  characters: 'bg-blue-500/15 text-blue-300',
  maps: 'bg-sky-500/15 text-sky-300',
  items: 'bg-amber-500/15 text-amber-300',
  quests: 'bg-emerald-500/15 text-emerald-300',
  lore: 'bg-violet-500/15 text-violet-300',
  general: 'bg-purple-500/15 text-purple-300',
};

// Formats the entity parser understands (monsters/characters/maps/items/quests
// categories). Anything else is still indexed as plain text — searchable, but
// not as individual entities, so it can't produce grounded links.
export interface AcceptedFormat {
  label: string;
  example: string;
}

export const ACCEPTED_FORMATS: AcceptedFormat[] = [
  { label: 'JSON — array of entities',        example: '[{ "name": "Cave Troll", "hp": 450 }, …]' },
  { label: 'JSON — wrapper object',           example: '{ "mobs": [ { "name": "Cave Troll" }, … ] }' },
  { label: 'JSON — name-keyed map',           example: '{ "Cave Troll": { "hp": 450 }, … }' },
  { label: 'JSON — a single entity',          example: '{ "name": "Tribal Leader", "role": "chief" }' },
  { label: 'Markdown — one heading per entity', example: '## Cave Troll\nStats: HP 450, ATK 38\nNotes: …' },
];

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
  characters: {
    blurb:
      'NPCs and named figures — quest givers, merchants, allies, villains. Generation references these so quests feature your real cast instead of inventing near-duplicates.',
    tips: [
      'One heading per character.',
      'Include their role and where they are found — that helps quests cast the right person.',
      'A motivation line gives dialogue and quest hooks something to build on.',
    ],
    template: `## Elder Maren
Role: quest giver
Location: Riverhollow (village square)
Appearance: silver-braided hair, moth-eaten ceremonial robes
Motivation: keeper of the old shrine; wants the moon shards returned
Notes: distrusts the Moonwrights, pays in blessings and barter

## Grok the Vault-Keeper
Role: merchant
Location: Deep Warrens (sealed vault gate)
Appearance: hulking, lantern bolted to his shoulder plate
Motivation: guards the vault; trades only with those who bring ember hearts
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
  quests: {
    blurb:
      'Quests that already exist in your game. Generation uses these for tone, scale and precedent — and to avoid re-creating a quest you already have.',
    tips: [
      'One heading per quest.',
      'Note the giver, the goal and the reward — the shape matters more than the prose.',
      'Include the progression stage so new quests slot in at the right difficulty.',
    ],
    template: `## Rats in the Cellar
Giver: Innkeeper Bess (Greenfield Village)
Stage: early game
Goal: clear 8 cave rats from the inn's cellar
Reward: 20 copper, free room for a night
Notes: tutorial-style kill quest; introduces the caves entrance

## The Flamebrand Forging
Giver: Grok the Vault-Keeper
Stage: late game
Goal: collect an ember heart and reforge the Flamebrand at the shrine
Reward: Flamebrand (epic sword)
Notes: multi-step chain; requires Ember Drake kill
`,
  },
  lore: {
    blurb:
      'The deep background of your world — myths, history, factions, cosmology. Generation leans on this for tone and consistency across everything it writes.',
    tips: [
      'Paste it as it is — chapters, wiki pages, design docs all work.',
      'Headings still help retrieval find the right passage.',
      'Good fits: creation myths, faction politics, timelines, religions.',
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
  general: {
    blurb:
      'Everything else — tone guides, dialogue style, design notes, mechanics. Free-form text; no structure required.',
    tips: [
      'Paste it as it is — any document works.',
      'Headings still help retrieval find the right passage.',
      'Good fits: writing style guides, game mechanics, house rules, todo-lore.',
    ],
    template: `## Writing tone
Grounded low fantasy. Dialogue is terse and regional — no modern slang,
no exclamation marks. Death is permanent and treated seriously.

## Economy notes
Copper is the everyday coin; silver is meaningful, gold is plot-worthy.
Quest rewards should rarely exceed 50 copper before mid game.
`,
  },
};
