import GameThemeModel from './gameThemeModel';
import ThemeConfigModel from './themeConfigModel';

const GAME_THEMES = [
  {
    themeId: 'generic_rpg',
    questTone: 'Classic high-fantasy adventure. Earnest heroes, clear stakes, satisfying arcs. Can range from lighthearted to grim depending on the story.',
    namingStyle: 'Fantasy names — evocative compound words (Shadowmere, Ironhold) or simple descriptive titles (The Lost Temple). Monster names match their nature (Dire Wolf, Flame Elemental).',
    rewardTypes: [
      { name: 'Weapon',       description: 'Equippable weapon',    rarity: 'common-legendary' },
      { name: 'Armor',        description: 'Equippable defense',   rarity: 'common-legendary' },
      { name: 'Skill Scroll', description: 'Learnable ability',    rarity: 'rare-epic' },
      { name: 'Gold',         description: 'Currency reward',      rarity: 'common' },
      { name: 'Artifact',     description: 'Unique story item',    rarity: 'legendary' },
    ],
    questTypes: [
      { name: 'Main Quest',  description: 'Story-critical progression' },
      { name: 'Side Quest',  description: 'Optional adventure with unique rewards' },
      { name: 'Bounty',      description: 'Hunt a specific target' },
      { name: 'Escort',      description: 'Protect someone on a journey' },
    ],
    locationRules: 'Standard fantasy settings: medieval towns, dark forests, ancient ruins, mountain passes, coastal harbors, underground dungeons, magical academies.',
    dialogueStyle: 'Fantasy RPG dialogue. NPCs speak with personality — innkeepers are chatty, guards are gruff, sages are cryptic. Match the tone to the quest mood.',
  },
  {
    themeId: 'cassette_beasts',
    questTone: 'Lighthearted adventure with British humor, puns, and pop culture references. Occasional darker undertones involving the Archangels.',
    namingStyle: 'Monster names are portmanteau puns combining an animal/object with a concept (Traffikrab, Bansheep, Dominoth). Quest names are short and punny.',
    rewardTypes: [
      { name: 'Sticker',       description: 'Equippable move/ability',         rarity: 'common-epic' },
      { name: 'Remaster Form', description: 'Upgraded version of a monster',   rarity: 'epic' },
      { name: 'Fused Material',description: 'Fusion crafting component',        rarity: 'rare' },
    ],
    questTypes: [
      { name: 'Ranger Quest',    description: 'Tasks from the ranger station' },
      { name: 'Archangel Hunt',  description: 'Boss encounters with reality-warping beings' },
      { name: 'Companion Quest', description: 'Personal story for a party member' },
    ],
    locationRules: 'Set in New Wirral, a UK-inspired island with towns (Harbourtown, New London), wilderness areas (Autumn Hill, Cherry Meadow), and mysterious dungeons.',
    dialogueStyle: 'Casual and warm. Characters often subtly break the fourth wall. Pop culture references are common. NPCs speak in recognisable British dialects.',
  },
];

const THEME_CONFIGS = [
  {
    themeId: 'generic_rpg',
    displayName: 'Generic RPG',
    description: 'Classic high-fantasy quest generation grounded in standard RPG archetypes and tropes.',
    category: 'style' as const,
    defaultExportFormat: 'json',
    availableExportFormats: ['json', 'custom'],
    createdBy: 'system',
  },
  {
    themeId: 'cassette_beasts',
    displayName: 'Cassette Beasts',
    description: 'Quest generation grounded in the Cassette Beasts world — New Wirral, monster fusion, and British humor.',
    category: 'game' as const,
    defaultExportFormat: 'godot_tres',
    availableExportFormats: ['godot_tres', 'json', 'custom'],
    loraTriggerWord: 'cbstyle',
    loraModelPath: 'cb-000006.safetensors',
    spriteSpecs: {
      battleSize: 64,
      worldSize: 32,
      battleFrames: 34,
      worldFrames: 32,
    },
    createdBy: 'system',
  },
];

export async function seedThemes(): Promise<void> {
  for (const theme of GAME_THEMES) {
    await GameThemeModel.updateOne(
      { themeId: theme.themeId },
      { $setOnInsert: theme },
      { upsert: true },
    );
  }

  for (const config of THEME_CONFIGS) {
    await ThemeConfigModel.updateOne(
      { themeId: config.themeId },
      { $setOnInsert: config },
      { upsert: true },
    );
  }

  console.log('[seed] themes seeded');
}
