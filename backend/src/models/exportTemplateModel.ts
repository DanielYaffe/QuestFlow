import mongoose, { Document, Schema } from 'mongoose';
import { parseTemplate } from '../services/exportTemplates/templateParser';

export type ExportTemplateFormat = 'json' | 'yaml' | 'xml';

export interface IExportTemplate extends Document {
  ownerId?: string;
  name: string;
  engine: string;
  isBuiltIn: boolean;
  description: string;
  rawTemplate: string;
  acceptedInputFormat: ExportTemplateFormat;
  targetScope: 'quest-node';
  defaultOutputFormat: ExportTemplateFormat;
  structure: unknown;
  templateAst?: unknown;
  fieldSchema: unknown[];
  templateSchema: unknown;
  schemaSummary: {
    requirementFields: string[];
    rewardFields: string[];
    dialogFields: string[];
    promptFields: string[];
    structureSummary: string;
  };
  analysisStatus: 'pending' | 'ready' | 'fallback' | 'failed';
  analysisError: string;
  analyzedAt?: Date;
  inferredAiGuidance: {
    objectiveFields: string[];
    rewardFields: string[];
    promptFields: string[];
    structureSummary: string;
  };
  output: {
    extension: string;
    mimeType: string;
    mode: ExportTemplateFormat;
  };
}

const ExportTemplateSchema = new Schema<IExportTemplate>(
  {
    ownerId:              { type: String, index: true },
    name:                 { type: String, required: true },
    engine:               { type: String, default: 'custom-template' },
    isBuiltIn:            { type: Boolean, default: false },
    description:          { type: String, default: '' },
    rawTemplate:          { type: String, required: true },
    acceptedInputFormat:  { type: String, enum: ['json', 'yaml', 'xml'], default: 'json' },
    targetScope:          { type: String, enum: ['quest-node'], default: 'quest-node' },
    defaultOutputFormat:  { type: String, enum: ['json', 'yaml', 'xml'], default: 'yaml' },
    structure:            { type: Schema.Types.Mixed, required: true },
    templateAst:          { type: Schema.Types.Mixed },
    fieldSchema:          { type: [Schema.Types.Mixed], default: [] },
    templateSchema:       { type: Schema.Types.Mixed, default: {} },
    schemaSummary: {
      requirementFields: { type: [String], default: [] },
      rewardFields:      { type: [String], default: [] },
      dialogFields:      { type: [String], default: [] },
      promptFields:      { type: [String], default: [] },
      structureSummary:  { type: String, default: '' },
    },
    analysisStatus:       { type: String, enum: ['pending', 'ready', 'fallback', 'failed'], default: 'fallback' },
    analysisError:        { type: String, default: '' },
    analyzedAt:           { type: Date },
    inferredAiGuidance: {
      objectiveFields:   { type: [String], default: [] },
      rewardFields:      { type: [String], default: [] },
      promptFields:      { type: [String], default: [] },
      structureSummary:  { type: String, default: '' },
    },
    output: {
      extension: { type: String, default: '.yaml' },
      mimeType:  { type: String, default: 'application/x-yaml' },
      mode:      { type: String, enum: ['json', 'yaml', 'xml'], default: 'yaml' },
    },
  },
  { timestamps: true },
);

const ExportTemplateModel = mongoose.model<IExportTemplate>('ExportTemplate', ExportTemplateSchema);
export default ExportTemplateModel;

const FREE_TIER_3_TEMPLATE = `{
  "name": "Free Tier 3",
  "quest_id": 2,
  "silent": "true",
  "pre_quest": [-1],
  "daily": "false",
  "to_kill": [
    { "id": 100134, "amount": 200 }
  ],
  "to_collect": [
    { "item_id": 4000002, "amount": 80 }
  ],
  "rewards": {
    "items": [
      { "id": 4000006, "amount": 100 },
      { "id": 5072000, "amount": 20 }
    ]
  }
}`;

type BuiltInTemplateSeed = {
  name: string;
  engine: string;
  description: string;
  rawTemplate: string;
  acceptedInputFormat: ExportTemplateFormat;
  defaultOutputFormat: ExportTemplateFormat;
  output: {
    extension: string;
    mimeType: string;
    mode: ExportTemplateFormat;
  };
};

const BUILT_IN_EXPORT_TEMPLATES: BuiltInTemplateSeed[] = [
  {
    name: 'Free Tier 3',
    engine: 'custom-template',
    description: 'Maple-style one-file quest-node export template',
    rawTemplate: FREE_TIER_3_TEMPLATE,
    acceptedInputFormat: 'json',
    defaultOutputFormat: 'yaml',
    output: {
      extension: '.yaml',
      mimeType: 'application/x-yaml',
      mode: 'yaml',
    },
  },
];

export async function seedBuiltInExportTemplates(): Promise<void> {
  const builtInNames = BUILT_IN_EXPORT_TEMPLATES.map((seed) => seed.name);
  await ExportTemplateModel.deleteMany({
    isBuiltIn: true,
    name: { $nin: builtInNames },
  });

  for (const seed of BUILT_IN_EXPORT_TEMPLATES) {
    const parsed = parseTemplate(seed.rawTemplate, seed.acceptedInputFormat);
    await ExportTemplateModel.updateOne(
      { isBuiltIn: true, name: seed.name },
      {
        $set: {
          name: seed.name,
          engine: seed.engine,
          isBuiltIn: true,
          description: seed.description,
          rawTemplate: seed.rawTemplate,
          acceptedInputFormat: seed.acceptedInputFormat,
          targetScope: 'quest-node',
          defaultOutputFormat: seed.defaultOutputFormat,
          structure: parsed.structure,
          templateAst: parsed.templateAst,
          fieldSchema: parsed.fieldSchema,
          templateSchema: parsed.templateSchema,
          schemaSummary: parsed.schemaSummary,
          analysisStatus: 'fallback',
          analysisError: '',
          analyzedAt: new Date(),
          inferredAiGuidance: parsed.inferredAiGuidance,
          output: seed.output,
        },
      },
      { upsert: true },
    );
  }
}
