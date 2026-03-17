import mongoose, { Document, Schema } from 'mongoose';

export interface INodeVariantConfig extends Document {
  key: string;        // e.g. "combat" — unique identifier used in node.variant
  label: string;      // display name e.g. "Combat"
  iconKey: string;    // maps to a Lucide icon on the frontend e.g. "swords"
  borderColor: string;
  bgColor: string;
  iconColor: string;
  shadowColor: string;
  isBase: boolean;    // true = shipped with the app, false = AI-created
}

const NodeVariantConfigSchema = new Schema<INodeVariantConfig>(
  {
    key:         { type: String, required: true, unique: true },
    label:       { type: String, required: true },
    iconKey:     { type: String, required: true, default: 'star' },
    borderColor: { type: String, required: true },
    bgColor:     { type: String, required: true },
    iconColor:   { type: String, required: true },
    shadowColor: { type: String, required: true },
    isBase:      { type: Boolean, default: false },
  },
  { timestamps: true },
);

const NodeVariantConfigModel = mongoose.model<INodeVariantConfig>('NodeVariantConfig', NodeVariantConfigSchema);
export default NodeVariantConfigModel;

// ---------------------------------------------------------------------------
// Base variant seed data — call seedBaseVariants() once on startup
// ---------------------------------------------------------------------------

export const BASE_VARIANT_SEEDS = [
  {
    key: 'story',
    label: 'Story',
    iconKey: 'scroll',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
    shadowColor: 'shadow-purple-500/50',
    isBase: true,
  },
  {
    key: 'combat',
    label: 'Combat',
    iconKey: 'swords',
    borderColor: 'border-red-500',
    bgColor: 'bg-red-500/10',
    iconColor: 'text-red-400',
    shadowColor: 'shadow-red-500/50',
    isBase: true,
  },
  {
    key: 'dialogue',
    label: 'Dialogue',
    iconKey: 'message-circle',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    shadowColor: 'shadow-blue-500/50',
    isBase: true,
  },
  {
    key: 'treasure',
    label: 'Treasure',
    iconKey: 'gem',
    borderColor: 'border-amber-500',
    bgColor: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
    shadowColor: 'shadow-amber-500/50',
    isBase: true,
  },
];

export async function seedBaseVariants(): Promise<void> {
  for (const seed of BASE_VARIANT_SEEDS) {
    await NodeVariantConfigModel.updateOne(
      { key: seed.key },
      { $setOnInsert: seed },
      { upsert: true },
    );
  }
}
