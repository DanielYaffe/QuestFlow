import mongoose, { Document, Schema } from 'mongoose';

export interface ICheckpoint extends Document {
  filename: string;
  displayName: string;
  baseModel: 'SDXL' | 'SD1.5' | 'Flux';
  source: 'civitai' | 'huggingface' | 'handmade';
  sourceUrl?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CheckpointSchema = new Schema<ICheckpoint>(
  {
    filename:    { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    baseModel:   { type: String, enum: ['SDXL', 'SD1.5', 'Flux'], required: true },
    source:      { type: String, enum: ['civitai', 'huggingface', 'handmade'], required: true },
    sourceUrl:   { type: String },
    description: { type: String },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true },
);

const CheckpointModel = mongoose.model<ICheckpoint>('Checkpoint', CheckpointSchema);
export default CheckpointModel;