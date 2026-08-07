import { IWorkflowPatchMap } from '../models/spriteStyleModel';

// Reusable ComfyUI workflow shapes. A style is created from a preset: the
// preset's template + patch map are copied onto the style document, so the
// admin only picks LoRAs / prompts instead of authoring raw workflow JSON.
// Checkpoint names baked into templates are placeholders — patchWorkflow()
// overrides them from the style at generation time.
//
// Output nodes are SaveImage. They used to be PreviewImage so results would not
// pile up on the ComfyUI host's disk, but that reason died with the move to
// RunPod: workers are ephemeral and the container filesystem goes away with
// them. SaveImage writes to ComfyUI/output/, which is the side of the history
// the RunPod handler collects from — PreviewImage lands in temp/ and is not
// returned.

export interface WorkflowPresetSampler {
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
}

export interface WorkflowPreset {
  presetId: string;
  name: string;
  description: string;
  supportsLoras: boolean;
  // false when sampler params are baked into the workflow (no samplerParamsNode)
  samplerEditable: boolean;
  defaultSampler: WorkflowPresetSampler;
  template: Record<string, unknown>;
  patchMap: IWorkflowPatchMap;
}

// DMD2 speed-LoRA is baked into the Power LoRA node as lora_1; style LoRAs are
// injected as lora_2+ by patchWorkflow()
export const WORKFLOW_PIXEL_DMD2_LORA: Record<string, unknown> = {
  '1': { inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'Load Checkpoint' } },
  '2': {
    inputs: {
      PowerLoraLoaderHeaderWidget: { type: 'PowerLoraLoaderHeaderWidget' },
      model: ['1', 0], clip: ['1', 1],
      lora_1: { on: true, lora: 'dmd2_sdxl_4step_lora_fp16.safetensors', strength: 1.0, strengthTwo: 1.0 },
      '➕ Add Lora': '',
    },
    class_type: 'Power Lora Loader (rgthree)',
    _meta: { title: 'Power Lora Loader (rgthree)' },
  },
  '3': { inputs: { text: '', clip: ['2', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Positive)' } },
  '4': { inputs: { text: '', clip: ['2', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Negative)' } },
  '5': { inputs: { width: 1024, height: 1024, batch_size: 1 }, class_type: 'EmptyLatentImage', _meta: { title: 'Empty Latent Image' } },
  '6': { inputs: { seed: 0, steps: 4, cfg: 1.2, sampler_name: 'euler', scheduler: 'simple', denoise: 1, model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] }, class_type: 'KSampler', _meta: { title: 'KSampler' } },
  '7': { inputs: { samples: ['6', 0], vae: ['1', 2] }, class_type: 'VAEDecode', _meta: { title: 'VAE Decode' } },
  '8': { inputs: { images: ['7', 0], filename_prefix: 'questflow' }, class_type: 'SaveImage', _meta: { title: 'Save Image' } },
};

// Standard-sampling SDXL + Power LoRA (no DMD2, no lora_1 — style LoRAs are
// injected as lora_2+; the rgthree loader tolerates the gap)
export const WORKFLOW_SDXL_STANDARD_LORA: Record<string, unknown> = {
  '1': { inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'Load Checkpoint' } },
  '2': {
    inputs: {
      PowerLoraLoaderHeaderWidget: { type: 'PowerLoraLoaderHeaderWidget' },
      model: ['1', 0], clip: ['1', 1],
      '➕ Add Lora': '',
    },
    class_type: 'Power Lora Loader (rgthree)',
    _meta: { title: 'Power Lora Loader (rgthree)' },
  },
  '3': { inputs: { text: '', clip: ['2', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Positive)' } },
  '4': { inputs: { text: '', clip: ['2', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Negative)' } },
  '5': { inputs: { width: 1024, height: 1024, batch_size: 1 }, class_type: 'EmptyLatentImage', _meta: { title: 'Empty Latent Image' } },
  '6': { inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0, model: ['2', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] }, class_type: 'KSampler', _meta: { title: 'KSampler' } },
  '7': { inputs: { samples: ['6', 0], vae: ['1', 2] }, class_type: 'VAEDecode', _meta: { title: 'VAE Decode' } },
  '8': { inputs: { images: ['7', 0], filename_prefix: 'questflow' }, class_type: 'SaveImage', _meta: { title: 'Save Image' } },
};

// Anime — standard Animagine two-pass hires-fix (no LoRA, sampler baked in)
export const WORKFLOW_ANIME_HIRES: Record<string, unknown> = {
  '1':  { inputs: { ckpt_name: 'animagineXL_v3.safetensors' }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'Load Checkpoint' } },
  '2':  { inputs: { stop_at_clip_layer: -1, clip: ['1', 1] }, class_type: 'CLIPSetLastLayer', _meta: { title: 'CLIP Set Last Layer' } },
  '3':  { inputs: { text: '', clip: ['2', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Positive)' } },
  '4':  { inputs: { text: '', clip: ['2', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Negative)' } },
  '5':  { inputs: { seed: 0, steps: 28, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1.0, model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['6', 0] }, class_type: 'KSampler', _meta: { title: 'KSampler (base)' } },
  '6':  { inputs: { width: 896, height: 1152, batch_size: 1 }, class_type: 'EmptyLatentImage', _meta: { title: 'Empty Latent Image' } },
  '7':  { inputs: { samples: ['10', 0], vae: ['12', 0] }, class_type: 'VAEDecode', _meta: { title: 'VAE Decode' } },
  '8':  { inputs: { images: ['7', 0], filename_prefix: 'questflow' }, class_type: 'SaveImage', _meta: { title: 'Save Image' } },
  '9':  { inputs: { upscale_method: 'nearest-exact', width: 1344, height: 1728, crop: 'disabled', samples: ['5', 0] }, class_type: 'LatentUpscale', _meta: { title: 'Latent Upscale' } },
  '10': { inputs: { seed: 0, steps: 15, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 0.55, model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['9', 0] }, class_type: 'KSampler', _meta: { title: 'KSampler (refine)' } },
  '12': { inputs: { vae_name: 'sdxlVAE_sdxlVAE.safetensors' }, class_type: 'VAELoader', _meta: { title: 'VAE Loader' } },
};

// Simple SDXL — standard single-pass, no LoRA
export const WORKFLOW_SDXL_STANDARD: Record<string, unknown> = {
  '1': { inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'Load Checkpoint' } },
  '2': { inputs: { text: '', clip: ['1', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Positive)' } },
  '3': { inputs: { text: '', clip: ['1', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP Text Encode (Negative)' } },
  '4': { inputs: { width: 1024, height: 1024, batch_size: 1 }, class_type: 'EmptyLatentImage', _meta: { title: 'Empty Latent Image' } },
  '5': { inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] }, class_type: 'KSampler', _meta: { title: 'KSampler' } },
  '6': { inputs: { samples: ['5', 0], vae: ['1', 2] }, class_type: 'VAEDecode', _meta: { title: 'VAE Decode' } },
  '7': { inputs: { images: ['6', 0], filename_prefix: 'questflow' }, class_type: 'SaveImage', _meta: { title: 'Save Image' } },
};

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    presetId: 'pixel_dmd2_lora',
    name: 'Pixel / DMD2 fast + LoRAs',
    description: '4-step DMD2 sampling with Power LoRA chain. Best for pixel-art LoRA styles (pair with background removal + pixel snap).',
    supportsLoras: true,
    samplerEditable: true,
    defaultSampler: { steps: 4, cfg: 1.2, sampler: 'euler', scheduler: 'simple' },
    template: WORKFLOW_PIXEL_DMD2_LORA,
    patchMap: {
      checkpointNode: '1',
      positivePromptNode: '3',
      negativePromptNode: '4',
      dimensionsNode: '5',
      seedNodes: ['6'],
      loraNode: '2',
      samplerParamsNode: '6',
    },
  },
  {
    presetId: 'sdxl_standard_lora',
    name: 'SDXL standard + LoRAs',
    description: 'Standard single-pass SDXL sampling with a Power LoRA chain. The go-to preset for new LoRA styles.',
    supportsLoras: true,
    samplerEditable: true,
    defaultSampler: { steps: 20, cfg: 7, sampler: 'dpmpp_2m', scheduler: 'karras' },
    template: WORKFLOW_SDXL_STANDARD_LORA,
    patchMap: {
      checkpointNode: '1',
      positivePromptNode: '3',
      negativePromptNode: '4',
      dimensionsNode: '5',
      seedNodes: ['6'],
      loraNode: '2',
      samplerParamsNode: '6',
    },
  },
  {
    presetId: 'sdxl_standard',
    name: 'SDXL standard',
    description: 'Standard single-pass SDXL sampling, checkpoint only (no LoRAs).',
    supportsLoras: false,
    samplerEditable: true,
    defaultSampler: { steps: 20, cfg: 7, sampler: 'dpmpp_2m', scheduler: 'karras' },
    template: WORKFLOW_SDXL_STANDARD,
    patchMap: {
      checkpointNode: '1',
      positivePromptNode: '2',
      negativePromptNode: '3',
      dimensionsNode: '4',
      seedNodes: ['5'],
      samplerParamsNode: '5',
    },
  },
  {
    presetId: 'anime_hires',
    name: 'Anime two-pass hires-fix',
    description: 'Two-pass hires-fix tuned for Animagine-style checkpoints. Sampler params are baked into the workflow.',
    supportsLoras: false,
    samplerEditable: false,
    defaultSampler: { steps: 28, cfg: 7, sampler: 'euler', scheduler: 'normal' },
    template: WORKFLOW_ANIME_HIRES,
    patchMap: {
      checkpointNode: '1',
      positivePromptNode: '3',
      negativePromptNode: '4',
      dimensionsNode: '6',
      seedNodes: ['5', '10'],
    },
  },
];

export function getWorkflowPreset(presetId: string): WorkflowPreset | undefined {
  return WORKFLOW_PRESETS.find((p) => p.presetId === presetId);
}
