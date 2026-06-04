import mongoose, { Document, Schema } from 'mongoose';

export interface ILora extends Document {
  filename: string;
  displayName: string;
  triggerWord?: string;
  defaultStrength: number;
  defaultStrengthClip: number;
  source: 'civitai' | 'huggingface' | 'handmade';
  sourceUrl?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LoraSchema = new Schema<ILora>(
  {
    filename:          { type: String, required: true, unique: true },
    displayName:       { type: String, required: true },
    triggerWord:       { type: String },
    defaultStrength:   { type: Number, default: 0.8 },
    defaultStrengthClip: { type: Number, default: 0.8 },
    source:            { type: String, enum: ['civitai', 'huggingface', 'handmade'], required: true },
    sourceUrl:         { type: String },
    description:       { type: String },
    isActive:          { type: Boolean, default: true },
  },
  { timestamps: true },
);

const LoraModel = mongoose.model<ILora>('Lora', LoraSchema);
export default LoraModel;