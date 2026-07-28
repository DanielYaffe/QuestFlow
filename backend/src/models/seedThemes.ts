import GameThemeModel from './gameThemeModel';
import ThemeConfigModel from './themeConfigModel';
import CheckpointModel from './checkpointModel';
import LoraModel from './loraModel';
import SpriteStyleModel from './spriteStyleModel';
import {
  WORKFLOW_PIXEL_DMD2_LORA,
  WORKFLOW_ANIME_HIRES,
  WORKFLOW_SDXL_STANDARD,
} from '../config/workflowPresets';

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
    defaultStyleId: 'none',
    defaultExportFormat: 'json',
    availableExportFormats: ['json', 'custom'],
    createdBy: 'system',
  },
  {
    themeId: 'cassette_beasts',
    displayName: 'Cassette Beasts',
    description: 'Quest generation grounded in the Cassette Beasts world — New Wirral, monster fusion, and British humor.',
    category: 'game' as const,
    defaultStyleId: 'cb_pixel',
    defaultExportFormat: 'godot_tres',
    availableExportFormats: ['godot_tres', 'json', 'custom'],
    spriteSpecs: {
      battleSize: 64,
      worldSize: 32,
      battleFrames: 34,
      worldFrames: 32,
    },
    createdBy: 'system',
  },
];

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

const CHECKPOINTS = [
  {
    filename: 'sd_xl_base_1.0.safetensors',
    displayName: 'SDXL Base 1.0',
    baseModel: 'SDXL' as const,
    source: 'huggingface' as const,
    sourceUrl: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
    description: 'Stability AI\'s official SDXL base model.',
  },
  {
    filename: 'pixelArtDiffusionXL_spriteShaper.safetensors',
    displayName: 'Pixel Art Diffusion XL — Sprite Shaper',
    baseModel: 'SDXL' as const,
    source: 'civitai' as const,
    sourceUrl: 'https://civitai.com/models/277680/pixel-art-diffusion-xl',
    description: 'SDXL fine-tune specialised for pixel-art sprite generation.',
  },
  {
    filename: 'animagineXL_v3.safetensors',
    displayName: 'Animagine XL v3',
    baseModel: 'SDXL' as const,
    source: 'civitai' as const,
    sourceUrl: 'https://civitai.com/models/260267/animagine-xl-v3',
    description: 'Anime-style SDXL model — good for illustrated creature art.',
  },
  {
    filename: 'juggernautXL_v9.safetensors',
    displayName: 'Juggernaut XL v9',
    baseModel: 'SDXL' as const,
    source: 'civitai' as const,
    sourceUrl: 'https://civitai.com/models/133005/juggernaut-xl',
    description: 'Photorealistic / dark-fantasy SDXL model.',
  },
];

// ---------------------------------------------------------------------------
// LoRAs
// ---------------------------------------------------------------------------

const LORAS = [
  {
    filename: 'cb-000006.safetensors',
    displayName: 'Cassette Beasts Style LoRA',
    triggerWord: 'cbstyle',
    defaultStrength: 0.85,
    defaultStrengthClip: 0.8,
    source: 'handmade' as const,
    description: 'Custom-trained LoRA on Cassette Beasts sprite sheets. Produces retro pixel-art creature sprites matching the CB aesthetic.',
  },
];

// ---------------------------------------------------------------------------
// Workflow templates — shared with the admin style presets (config/workflowPresets)
// ---------------------------------------------------------------------------

const WORKFLOW_CB_PIXEL = WORKFLOW_PIXEL_DMD2_LORA;
const WORKFLOW_ANIME = WORKFLOW_ANIME_HIRES;
const WORKFLOW_SIMPLE_SDXL = WORKFLOW_SDXL_STANDARD;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SPRITE_STYLES = [
  {
    styleId: 'cb_pixel',
    name: 'Cassette Beasts',
    description: 'Retro pixel-art creatures in the Cassette Beasts style.',
    previewImagePath: '/assets/style-previews/cb_pixel.png',
    category: 'pixel' as const,
    baseModel: 'SDXL' as const,
    checkpointFilename: 'pixelArtDiffusionXL_spriteShaper.safetensors',
    loras: [
      { loraFilename: 'cb-000006.safetensors', strength: 0.85, strengthClip: 0.8, triggerWord: 'cbstyle' },
    ],
    promptPrefix: 'cbstyle, monster creature, pixel art, clean outline,',
    negativePrompt: 'photo, realistic, 3d render, blurry, low quality, text, watermark, signature, jpeg artifacts',
    defaultDimensions: { width: 1024, height: 1024 },
    removeBackground: true,
    targetSize: 64,
    sampler: { steps: 4, cfg: 1.2, sampler: 'euler' as const, scheduler: 'simple' as const },
    workflowTemplate: WORKFLOW_CB_PIXEL,
    workflowPatchMap: {
      checkpointNode: '1',
      positivePromptNode: '3',
      negativePromptNode: '4',
      dimensionsNode: '5',
      seedNodes: ['6'],
      loraNode: '2',
      samplerParamsNode: '6',
      saveImageNode: '8',
    },
    isDefault: false,
    sortOrder: 0,
  },
  {
    styleId: 'anime_mon',
    name: 'Anime Monster',
    description: 'Stylised creature art — Pokémon-style illustration with two-pass hires fix.',
    previewImagePath: '/assets/style-previews/anime_mon.png',
    category: 'illustrated' as const,
    baseModel: 'SDXL' as const,
    checkpointFilename: 'animagineXL_v3.safetensors',
    loras: [],
    // Animagine works best with Danbooru-style quality tags; subject is appended after
    promptPrefix: 'creature, monster, full body, white background, masterpiece, best quality, very aesthetic, absurdres,',
    negativePrompt: 'nsfw, wings, low quality, worst quality, normal quality, text, watermark, signature, jpeg artifacts, blurry, bad anatomy, extra limbs',
    // Dimensions match the workflow natively — upscale node (9) scales proportionally
    defaultDimensions: { width: 896, height: 1152 },
    sampler: { steps: 28, cfg: 7, sampler: 'euler' as const, scheduler: 'normal' as const },
    workflowTemplate: WORKFLOW_ANIME,
    workflowPatchMap: {
      checkpointNode: '1',
      positivePromptNode: '3',
      negativePromptNode: '4',
      dimensionsNode: '6',
      seedNodes: ['5', '10'],
      saveImageNode: '8',
      // No loraNode — no LoRA in this workflow
      // No samplerParamsNode — params are baked into the workflow
    },
    isDefault: false,
    sortOrder: 1,
  },
  {
    styleId: 'dark_fantasy',
    name: 'Dark Fantasy',
    description: 'Gritty, realistic creature design for dark RPG settings.',
    previewImagePath: '/assets/style-previews/dark_fantasy.png',
    category: 'realistic' as const,
    baseModel: 'SDXL' as const,
    checkpointFilename: 'juggernautXL_v9.safetensors',
    loras: [],
    promptPrefix: 'fantasy creature, detailed, dramatic lighting, dark atmosphere, cinematic, highly detailed, 8k uhd,',
    negativePrompt: 'cartoon, anime, pixel art, nsfw, blurry, low quality, text, watermark, signature, jpeg artifacts',
    defaultDimensions: { width: 1024, height: 1024 },
    sampler: { steps: 20, cfg: 7, sampler: 'dpmpp_2m' as const, scheduler: 'karras' as const },
    workflowTemplate: { ...WORKFLOW_SIMPLE_SDXL, '1': { inputs: { ckpt_name: 'juggernautXL_v9.safetensors' }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'Load Checkpoint' } } },
    workflowPatchMap: {
      checkpointNode: '1',
      positivePromptNode: '2',
      negativePromptNode: '3',
      dimensionsNode: '4',
      seedNodes: ['5'],
      samplerParamsNode: '5',
      saveImageNode: '7',
    },
    isDefault: false,
    sortOrder: 2,
  },
  {
    styleId: 'none',
    name: 'No Style',
    description: 'Vanilla SDXL — useful for testing prompts without a style LoRA.',
    previewImagePath: '/assets/style-previews/none.png',
    category: 'raw' as const,
    baseModel: 'SDXL' as const,
    checkpointFilename: 'sd_xl_base_1.0.safetensors',
    loras: [],
    promptPrefix: '',
    negativePrompt: 'blurry, low quality, text, watermark, signature, jpeg artifacts',
    defaultDimensions: { width: 1024, height: 1024 },
    sampler: { steps: 20, cfg: 7, sampler: 'dpmpp_2m' as const, scheduler: 'karras' as const },
    workflowTemplate: WORKFLOW_SIMPLE_SDXL,
    workflowPatchMap: {
      checkpointNode: '1',
      positivePromptNode: '2',
      negativePromptNode: '3',
      dimensionsNode: '4',
      seedNodes: ['5'],
      samplerParamsNode: '5',
      saveImageNode: '7',
    },
    isDefault: true,
    sortOrder: 3,
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

  for (const checkpoint of CHECKPOINTS) {
    await CheckpointModel.updateOne(
      { filename: checkpoint.filename },
      { $setOnInsert: checkpoint },
      { upsert: true },
    );
  }

  for (const lora of LORAS) {
    await LoraModel.updateOne(
      { filename: lora.filename },
      { $setOnInsert: lora },
      { upsert: true },
    );
  }

  // $setOnInsert only: styles are admin-managed after first boot — re-seeding
  // with $set would clobber edits made through the admin styles page
  for (const style of SPRITE_STYLES) {
    await SpriteStyleModel.updateOne(
      { styleId: style.styleId },
      { $setOnInsert: style },
      { upsert: true },
    );
  }

  // One-off migration: pre-existing cb_pixel docs have rembg baked into their
  // workflow template — mark them removeBackground so the composer keeps
  // appending the flat-background phrase that gives RMBG a clean cut
  await SpriteStyleModel.updateOne(
    { styleId: 'cb_pixel', removeBackground: { $exists: false } },
    { $set: { removeBackground: true } },
  );

  console.log('[seed] themes, checkpoints, loras, and styles seeded');
}
