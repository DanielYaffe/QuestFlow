import mongoose, { Document, Schema } from 'mongoose';
import { KbType, KB_TYPES } from '../services/qdrant';

export type TemplateKbMappingValueType = 'string' | 'number' | 'boolean' | 'array' | 'object';
export type TemplateKbMappingStatus = 'proposed' | 'validated' | 'disabled';

export interface ITemplateKbMappingEntry {
  templatePath: string;
  kbType: KbType;
  kbFieldPath: string;
  valueType: TemplateKbMappingValueType;
  purpose: string;
  status: TemplateKbMappingStatus;
  confidence: number;
  explanation: string;
}

export interface ITemplateKbMapping extends Document {
  ownerId: string;
  gameId: string;
  templateId: string;
  entries: ITemplateKbMappingEntry[];
  analyzedAt?: Date;
}

const TemplateKbMappingEntrySchema = new Schema<ITemplateKbMappingEntry>(
  {
    templatePath: { type: String, required: true },
    kbType:       { type: String, enum: KB_TYPES, required: true },
    kbFieldPath:  { type: String, required: true },
    valueType:    { type: String, enum: ['string', 'number', 'boolean', 'array', 'object'], required: true },
    purpose:      { type: String, default: '' },
    status:       { type: String, enum: ['proposed', 'validated', 'disabled'], default: 'proposed' },
    confidence:   { type: Number, default: 0 },
    explanation:  { type: String, default: '' },
  },
  { _id: false },
);

const TemplateKbMappingSchema = new Schema<ITemplateKbMapping>(
  {
    ownerId:    { type: String, required: true, index: true },
    gameId:     { type: String, required: true, index: true },
    templateId: { type: String, required: true, index: true },
    entries:    { type: [TemplateKbMappingEntrySchema], default: [] },
    analyzedAt: { type: Date },
  },
  { timestamps: true },
);

TemplateKbMappingSchema.index({ ownerId: 1, gameId: 1, templateId: 1 }, { unique: true });

const TemplateKbMappingModel = mongoose.model<ITemplateKbMapping>('TemplateKbMapping', TemplateKbMappingSchema);
export default TemplateKbMappingModel;
