import mongoose, { Schema, Document } from 'mongoose';

export interface ISprite extends Document {
  ownerId: string;
  userPrompt: string;
  fullPrompt: string;
  imageUrl: string;
  filters: {
    artStyle: string;
    perspective: string;
    aspectRatio: string;
    background: string;
    colorPalette: string;
    detailLevel: string;
    category: string;
  };
  createdAt: Date;
}

const SpriteSchema = new Schema<ISprite>(
  {
    ownerId:    { type: String, required: true, index: true },
    userPrompt: { type: String, required: true },
    fullPrompt: { type: String, required: true },
    imageUrl:   { type: String, required: true },
    filters: {
      artStyle:     { type: String, default: '' },
      perspective:  { type: String, default: '' },
      aspectRatio:  { type: String, default: '' },
      background:   { type: String, default: '' },
      colorPalette: { type: String, default: '' },
      detailLevel:  { type: String, default: '' },
      category:     { type: String, default: '' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.model<ISprite>('Sprite', SpriteSchema);
