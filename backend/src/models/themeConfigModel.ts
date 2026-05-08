import mongoose, { Document, Schema } from 'mongoose';

export interface ISpriteSpecs {
  battleSize: number;
  worldSize: number;
  battleFrames: number;
  worldFrames: number;
  battleAnims: Record<string, unknown>;
  worldAnims: Record<string, unknown>;
}

export interface IThemeConfig extends Document {
  themeId: string;
  displayName: string;
  description: string;
  category: 'game' | 'style';
  bedrockAgentId: string;
  bedrockAliasId: string;
  knowledgeBaseId: string;
  s3KBPath: string;
  loraModelPath: string;
  loraTriggerWord: string;
  defaultExportFormat: string;
  availableExportFormats: string[];
  spriteSpecs: ISpriteSpecs;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const ThemeConfigSchema = new Schema<IThemeConfig>(
  {
    themeId:     { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    description: { type: String, default: '' },
    category:    { type: String, enum: ['game', 'style'], default: 'style' },

    bedrockAgentId:  { type: String, default: '' },
    bedrockAliasId:  { type: String, default: '' },
    knowledgeBaseId: { type: String, default: '' },
    s3KBPath:        { type: String, default: '' },

    loraModelPath:   { type: String, default: '' },
    loraTriggerWord: { type: String, default: '' },

    defaultExportFormat:     { type: String, default: 'json' },
    availableExportFormats:  { type: [String], default: ['json'] },

    spriteSpecs: {
      battleSize:   { type: Number, default: 64 },
      worldSize:    { type: Number, default: 32 },
      battleFrames: { type: Number, default: 34 },
      worldFrames:  { type: Number, default: 32 },
      battleAnims:  { type: Schema.Types.Mixed, default: {} },
      worldAnims:   { type: Schema.Types.Mixed, default: {} },
    },

    isActive:  { type: Boolean, default: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

const ThemeConfigModel = mongoose.model<IThemeConfig>('ThemeConfig', ThemeConfigSchema);
export default ThemeConfigModel;
