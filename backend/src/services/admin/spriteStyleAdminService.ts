import { z } from 'zod';
import SpriteStyleModel, { ISpriteStyle } from '../../models/spriteStyleModel';
import { WORKFLOW_PRESETS, getWorkflowPreset } from '../../config/workflowPresets';
import { validateModelFiles } from './comfyModelService';
import { HttpError } from '../../utils/httpError';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const styleLoraSchema = z.object({
  loraFilename: z.string().min(1),
  strength: z.number().min(-4).max(4),
  strengthClip: z.number().min(-4).max(4),
  triggerWord: z.string().optional(),
});

// sampler/scheduler validity is ComfyUI-version-dependent — the UI offers the
// live /object_info options, so the API just requires non-empty names
const samplerSchema = z.object({
  steps: z.number().int().min(1).max(150),
  cfg: z.number().min(0).max(30),
  sampler: z.string().min(1),
  scheduler: z.string().min(1),
});

export const createStyleSchema = z.object({
  styleId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/, 'styleId must be a lowercase slug'),
  name: z.string().min(1),
  description: z.string().default(''),
  previewImagePath: z.string().default(''),
  category: z.enum(['pixel', 'illustrated', 'realistic', 'raw']),
  baseModel: z.enum(['SDXL', 'SD1.5', 'Flux']).default('SDXL'),
  checkpointFilename: z.string().min(1),
  loras: z.array(styleLoraSchema).default([]),
  promptPrefix: z.string().default(''),
  negativePrompt: z.string().default(''),
  defaultDimensions: z
    .object({ width: z.number().int().min(64).max(4096), height: z.number().int().min(64).max(4096) })
    .default({ width: 1024, height: 1024 }),
  removeBackground: z.boolean().default(false),
  targetSize: z.number().int().min(8).max(512).nullish().transform((v) => v ?? undefined),
  sampler: samplerSchema.optional(),
  presetId: z.string().min(1),
  isActive: z.boolean().default(true),
});

export const updateStyleSchema = createStyleSchema.omit({ styleId: true }).partial();

export type CreateStyleInput = z.infer<typeof createStyleSchema>;
export type UpdateStyleInput = z.infer<typeof updateStyleSchema>;

export interface StyleMutationResult {
  style: ISpriteStyle;
  // Non-fatal issues (e.g. model file missing on the ComfyUI host)
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export function listPresets() {
  return WORKFLOW_PRESETS.map(({ presetId, name, description, supportsLoras, samplerEditable, defaultSampler }) => ({
    presetId,
    name,
    description,
    supportsLoras,
    samplerEditable,
    defaultSampler,
  }));
}

// ---------------------------------------------------------------------------
// Styles CRUD
// ---------------------------------------------------------------------------

export async function listStyles(): Promise<ISpriteStyle[]> {
  return SpriteStyleModel.find().sort({ sortOrder: 1, createdAt: 1 });
}

export async function createStyle(input: CreateStyleInput): Promise<StyleMutationResult> {
  const preset = getWorkflowPreset(input.presetId);
  if (!preset) {
    throw new HttpError(400, `Unknown workflow preset "${input.presetId}"`);
  }
  if (input.loras.length > 0 && !preset.supportsLoras) {
    throw new HttpError(400, `Preset "${preset.name}" does not support LoRAs`);
  }

  const exists = await SpriteStyleModel.exists({ styleId: input.styleId });
  if (exists) {
    throw new HttpError(409, `Style "${input.styleId}" already exists`);
  }

  const last = await SpriteStyleModel.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const style = await SpriteStyleModel.create({
    ...input,
    sampler: input.sampler ?? preset.defaultSampler,
    workflowTemplate: preset.template,
    workflowPatchMap: preset.patchMap,
    presetId: preset.presetId,
    isDefault: false,
    sortOrder,
  });

  const warnings = await validateModelFiles(
    input.checkpointFilename,
    input.loras.map((l) => l.loraFilename),
  );
  return { style, warnings };
}

export async function updateStyle(styleId: string, input: UpdateStyleInput): Promise<StyleMutationResult> {
  const style = await SpriteStyleModel.findOne({ styleId });
  if (!style) {
    throw new HttpError(404, `Style "${styleId}" not found`);
  }

  if (input.presetId !== undefined) {
    const preset = getWorkflowPreset(input.presetId);
    if (!preset) {
      throw new HttpError(400, `Unknown workflow preset "${input.presetId}"`);
    }
    style.workflowTemplate = preset.template;
    style.workflowPatchMap = preset.patchMap;
    style.presetId = preset.presetId;
    style.markModified('workflowTemplate');
  }

  const { presetId: _presetId, loras, ...rest } = input;
  if (loras !== undefined) {
    // Capability comes from the (possibly just-replaced) patch map, so styles
    // created outside presets are handled correctly too
    if (loras.length > 0 && !style.workflowPatchMap.loraNode) {
      throw new HttpError(400, 'This style\'s workflow has no LoRA node — pick a LoRA-capable preset first');
    }
    style.loras = loras;
  }
  Object.assign(style, rest);

  if (input.isActive === false && style.isDefault) {
    throw new HttpError(400, 'Cannot deactivate the default style — set another default first');
  }

  await style.save();

  const warnings = await validateModelFiles(
    style.checkpointFilename,
    style.loras.map((l) => l.loraFilename),
  );
  return { style, warnings };
}

export async function setDefaultStyle(styleId: string): Promise<ISpriteStyle> {
  const style = await SpriteStyleModel.findOne({ styleId });
  if (!style) {
    throw new HttpError(404, `Style "${styleId}" not found`);
  }
  if (!style.isActive) {
    throw new HttpError(400, 'Cannot make an inactive style the default');
  }
  await SpriteStyleModel.updateMany({ isDefault: true }, { $set: { isDefault: false } });
  style.isDefault = true;
  await style.save();
  return style;
}

export async function reorderStyles(styleIds: string[]): Promise<void> {
  await Promise.all(
    styleIds.map((styleId, index) =>
      SpriteStyleModel.updateOne({ styleId }, { $set: { sortOrder: index } }),
    ),
  );
}

export async function deleteStyle(styleId: string): Promise<void> {
  const style = await SpriteStyleModel.findOne({ styleId });
  if (!style) {
    throw new HttpError(404, `Style "${styleId}" not found`);
  }
  if (style.isDefault) {
    throw new HttpError(400, 'Cannot delete the default style — set another default first');
  }
  await style.deleteOne();
}
