import { z } from 'zod';
import CheckpointModel, { ICheckpoint } from '../../models/checkpointModel';
import LoraModel, { ILora } from '../../models/loraModel';
import SpriteStyleModel from '../../models/spriteStyleModel';
import { HttpError } from '../../utils/httpError';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const filenameSchema = z
  .string()
  .min(1)
  .regex(/\.(safetensors|ckpt|pt)$/, 'filename must end in .safetensors, .ckpt or .pt');

export const createCheckpointSchema = z.object({
  filename: filenameSchema,
  displayName: z.string().min(1),
  baseModel: z.enum(['SDXL', 'SD1.5', 'Flux']),
  source: z.enum(['civitai', 'huggingface', 'handmade']),
  sourceUrl: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateCheckpointSchema = createCheckpointSchema.omit({ filename: true }).partial();

export const createLoraSchema = z.object({
  filename: filenameSchema,
  displayName: z.string().min(1),
  triggerWord: z.string().optional(),
  defaultStrength: z.number().min(-4).max(4).default(0.8),
  defaultStrengthClip: z.number().min(-4).max(4).default(0.8),
  source: z.enum(['civitai', 'huggingface', 'handmade']),
  sourceUrl: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateLoraSchema = createLoraSchema.omit({ filename: true }).partial();

export type CreateCheckpointInput = z.infer<typeof createCheckpointSchema>;
export type UpdateCheckpointInput = z.infer<typeof updateCheckpointSchema>;
export type CreateLoraInput = z.infer<typeof createLoraSchema>;
export type UpdateLoraInput = z.infer<typeof updateLoraSchema>;

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

export async function listCheckpoints(): Promise<ICheckpoint[]> {
  return CheckpointModel.find().sort({ displayName: 1 });
}

export async function createCheckpoint(input: CreateCheckpointInput): Promise<ICheckpoint> {
  const exists = await CheckpointModel.exists({ filename: input.filename });
  if (exists) {
    throw new HttpError(409, `Checkpoint "${input.filename}" is already registered`);
  }
  return CheckpointModel.create(input);
}

export async function updateCheckpoint(filename: string, input: UpdateCheckpointInput): Promise<ICheckpoint> {
  const checkpoint = await CheckpointModel.findOneAndUpdate(
    { filename },
    { $set: input },
    { new: true },
  );
  if (!checkpoint) {
    throw new HttpError(404, `Checkpoint "${filename}" not found`);
  }
  return checkpoint;
}

export async function deleteCheckpoint(filename: string): Promise<void> {
  const usedBy = await SpriteStyleModel.findOne({ checkpointFilename: filename }).select('styleId').lean();
  if (usedBy) {
    throw new HttpError(409, `Checkpoint "${filename}" is used by style "${usedBy.styleId}"`);
  }
  const result = await CheckpointModel.deleteOne({ filename });
  if (result.deletedCount === 0) {
    throw new HttpError(404, `Checkpoint "${filename}" not found`);
  }
}

// ---------------------------------------------------------------------------
// LoRAs
// ---------------------------------------------------------------------------

export async function listLoras(): Promise<ILora[]> {
  return LoraModel.find().sort({ displayName: 1 });
}

export async function createLora(input: CreateLoraInput): Promise<ILora> {
  const exists = await LoraModel.exists({ filename: input.filename });
  if (exists) {
    throw new HttpError(409, `LoRA "${input.filename}" is already registered`);
  }
  return LoraModel.create(input);
}

export async function updateLora(filename: string, input: UpdateLoraInput): Promise<ILora> {
  const lora = await LoraModel.findOneAndUpdate(
    { filename },
    { $set: input },
    { new: true },
  );
  if (!lora) {
    throw new HttpError(404, `LoRA "${filename}" not found`);
  }
  return lora;
}

export async function deleteLora(filename: string): Promise<void> {
  const usedBy = await SpriteStyleModel.findOne({ 'loras.loraFilename': filename }).select('styleId').lean();
  if (usedBy) {
    throw new HttpError(409, `LoRA "${filename}" is used by style "${usedBy.styleId}"`);
  }
  const result = await LoraModel.deleteOne({ filename });
  if (result.deletedCount === 0) {
    throw new HttpError(404, `LoRA "${filename}" not found`);
  }
}
