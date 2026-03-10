import mongoose, { Document, Schema } from 'mongoose';

export interface IExportTemplate extends Document {
  ownerId: string | null;
  name: string;
  engine: string;
  isBuiltIn: boolean;
  structure: object;
}

const ExportTemplateSchema = new Schema<IExportTemplate>(
  {
    ownerId:   { type: String, default: null },
    name:      { type: String, required: true },
    engine:    { type: String, required: true },
    isBuiltIn: { type: Boolean, default: false },
    structure: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

const ExportTemplateModel = mongoose.model<IExportTemplate>('ExportTemplate', ExportTemplateSchema);

// ---------------------------------------------------------------------------
// Seed built-in templates (idempotent — upsert by name + isBuiltIn)
// ---------------------------------------------------------------------------

const BUILT_IN_TEMPLATES = [
  {
    name: 'QuestFlow',
    engine: 'questflow',
    isBuiltIn: true,
    structure: {
      questline: {
        id: '{{id}}',
        title: '{{title}}',
        genre: '{{genre}}',
        nodes: '{{nodes}}',
        edges: '{{edges}}',
        objectives: '{{objectives}}',
        rewards: '{{rewards}}',
      },
    },
  },
  {
    name: 'Unity ScriptableObject',
    engine: 'unity',
    isBuiltIn: true,
    structure: {
      QuestData: {
        questId: '{{id}}',
        displayName: '{{title}}',
        genre: '{{genre}}',
        objectives: '{{objectives}}',
        rewards: '{{rewards}}',
        nodes: '{{nodes}}',
      },
    },
  },
  {
    name: 'Unreal Engine',
    engine: 'unreal',
    isBuiltIn: true,
    structure: {
      QuestAsset: {
        QuestID: '{{id}}',
        QuestName: '{{title}}',
        Genre: '{{genre}}',
        Tasks: '{{objectives}}',
        LootTable: '{{rewards}}',
        DialogueGraph: {
          Nodes: '{{nodes}}',
          Edges: '{{edges}}',
        },
      },
    },
  },
  {
    name: 'Godot',
    engine: 'godot',
    isBuiltIn: true,
    structure: {
      quest_resource: {
        quest_id: '{{id}}',
        quest_name: '{{title}}',
        genre: '{{genre}}',
        objectives: '{{objectives}}',
        rewards: '{{rewards}}',
        nodes: '{{nodes}}',
        connections: '{{edges}}',
      },
    },
  },
];

async function seedBuiltInTemplates() {
  for (const t of BUILT_IN_TEMPLATES) {
    await ExportTemplateModel.updateOne(
      { name: t.name, isBuiltIn: true },
      { $set: t },
      { upsert: true },
    );
  }
}

// Run seed whenever this module is imported (server startup)
seedBuiltInTemplates().catch((err) => console.error('ExportTemplate seed error:', err));

export default ExportTemplateModel;
