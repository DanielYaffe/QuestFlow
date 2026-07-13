import mongoose, { Schema, Document } from 'mongoose';

export interface ISpriteFilters {
  artStyle: string;
  perspective: string;
  aspectRatio: string;
  background: string;
  colorPalette: string;
  detailLevel: string;
  category: string;
}

export interface ISprite extends Document {
  ownerId: string;
  projectId: string;
  userPrompt: string;
  // Style-driven ComfyUI pipeline (architecture-phase1)
  positivePrompt: string;
  negativePrompt: string;
  styleId: string;       // ThemeConfig._id or '' for no style
  // Filter-driven generator (multi-project export flow)
  fullPrompt: string;
  filters: ISpriteFilters;
  imageUrl: string;
  createdAt: Date;
}

const SpriteSchema = new Schema<ISprite>(
  {
    ownerId:        { type: String, required: true, index: true },
    projectId:      { type: String, default: '', index: true },
    userPrompt:     { type: String, required: true },
    positivePrompt: { type: String, default: '' },
    negativePrompt: { type: String, default: '' },
    styleId:        { type: String, default: '' },
    fullPrompt:     { type: String, default: '' },
    filters: {
      artStyle:     { type: String, default: '' },
      perspective:  { type: String, default: '' },
      aspectRatio:  { type: String, default: '' },
      background:   { type: String, default: '' },
      colorPalette: { type: String, default: '' },
      detailLevel:  { type: String, default: '' },
      category:     { type: String, default: '' },
    },
    imageUrl:       { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.model<ISprite>('Sprite', SpriteSchema);
