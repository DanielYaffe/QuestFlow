import mongoose, { Schema, Document } from 'mongoose';

export interface ISprite extends Document {
  ownerId: string;
  userPrompt: string;
  positivePrompt: string;
  negativePrompt: string;
  styleId: string;       // ThemeConfig._id or '' for no style
  imageUrl: string;
  createdAt: Date;
}

const SpriteSchema = new Schema<ISprite>(
  {
    ownerId:        { type: String, required: true, index: true },
    userPrompt:     { type: String, required: true },
    positivePrompt: { type: String, default: '' },
    negativePrompt: { type: String, default: '' },
    styleId:        { type: String, default: '' },
    imageUrl:       { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.model<ISprite>('Sprite', SpriteSchema);
