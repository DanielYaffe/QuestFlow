export interface StyleSamplerParams {
  steps: number;
  cfg: number;
  sampler: 'euler' | 'dpmpp_2m' | 'dpmpp_sde' | 'lcm';
  scheduler: 'simple' | 'karras' | 'normal' | 'sgm_uniform';
}

export interface StyleLora {
  filename: string;
  strength: number;
  strengthClip: number;
  triggerWord?: string;
}

export interface Style {
  id: string;
  name: string;
  description: string;
  previewImagePath: string;
  category: 'pixel' | 'illustrated' | 'realistic' | 'raw';
  baseModel: 'SDXL';
  checkpoint: string;
  loras: StyleLora[];
  promptPrefix: string;
  negativePrompt: string;
  defaultDimensions: { width: number; height: number };
  targetSize?: number;
  sampler: StyleSamplerParams;
  isDefault?: boolean;
}

// DMD2 is baked into the workflow template (lora_1) — not listed in style loras[]
const DMD2_SAMPLER: StyleSamplerParams = {
  steps: 4,
  cfg: 1.2,
  sampler: 'euler',
  scheduler: 'simple',
};

export const STYLES: Style[] = [
  {
    id: 'cb_pixel',
    name: 'Cassette Beasts',
    description: 'Retro pixel-art creatures in the Cassette Beasts style.',
    previewImagePath: '/assets/style-previews/cb_pixel.png',
    category: 'pixel',
    baseModel: 'SDXL',
    checkpoint: 'pixelArtDiffusionXL.safetensors',
    loras: [
      {
        filename: 'cb-000006.safetensors',
        strength: 0.85,
        strengthClip: 0.8,
        triggerWord: 'cbstyle',
      },
    ],
    promptPrefix: 'cbstyle, monster creature, pixel art, clean outline,',
    negativePrompt:
      'photo, realistic, 3d render, blurry, low quality, text, watermark, signature, jpeg artifacts',
    defaultDimensions: { width: 1024, height: 1024 },
    targetSize: 64,
    sampler: DMD2_SAMPLER,
  },
  {
    id: 'anime_mon',
    name: 'Anime Monster',
    description: 'Stylised creature art — Pokémon-style illustration.',
    previewImagePath: '/assets/style-previews/anime_mon.png',
    category: 'illustrated',
    baseModel: 'SDXL',
    checkpoint: 'animagineXL_v3.safetensors',
    loras: [],
    promptPrefix: 'anime style, creature, full body, white background,',
    negativePrompt:
      'photo, realistic, 3d render, blurry, low quality, text, watermark, signature, jpeg artifacts',
    defaultDimensions: { width: 1024, height: 1024 },
    sampler: DMD2_SAMPLER,
  },
  {
    id: 'dark_fantasy',
    name: 'Dark Fantasy',
    description: 'Gritty, realistic creature design for dark RPG settings.',
    previewImagePath: '/assets/style-previews/dark_fantasy.png',
    category: 'realistic',
    baseModel: 'SDXL',
    checkpoint: 'juggernautXL_v9.safetensors',
    loras: [],
    promptPrefix: 'fantasy creature, detailed, dramatic lighting, dark background,',
    negativePrompt:
      'cartoon, anime, pixel art, blurry, low quality, text, watermark, signature, jpeg artifacts',
    defaultDimensions: { width: 1024, height: 1024 },
    sampler: DMD2_SAMPLER,
  },
  {
    id: 'none',
    name: 'No Style',
    description: 'Vanilla SDXL — useful for testing prompts without a style LoRA.',
    previewImagePath: '/assets/style-previews/none.png',
    category: 'raw',
    baseModel: 'SDXL',
    checkpoint: 'sd_xl_base_1.0.safetensors',
    loras: [],
    promptPrefix: '',
    negativePrompt:
      'blurry, low quality, text, watermark, signature, jpeg artifacts',
    defaultDimensions: { width: 1024, height: 1024 },
    sampler: DMD2_SAMPLER,
    isDefault: true,
  },
];

export function getStyle(id: string): Style | undefined {
  return STYLES.find((s) => s.id === id);
}

export function getDefaultStyle(): Style {
  return STYLES.find((s) => s.isDefault) ?? STYLES[0];
}
