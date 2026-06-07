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
    structureSummary: string;
  };
  analysisStatus: 'pending' | 'ready' | 'fallback' | 'failed';
  analysisError: string;
  analyzedAt?: Date;
  inferredAiGuidance: {
    objectiveFields: string[];
    rewardFields: string[];
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
      structureSummary:  { type: String, default: '' },
    },
    analysisStatus:       { type: String, enum: ['pending', 'ready', 'fallback', 'failed'], default: 'fallback' },
    analysisError:        { type: String, default: '' },
    analyzedAt:           { type: Date },
    inferredAiGuidance: {
      objectiveFields:   { type: [String], default: [] },
      rewardFields:      { type: [String], default: [] },
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

const CONTABO_MAPLE_TEMPLATE = `id: 10001
name: "Example Quest With Every Requirement And Reward"
description: "Template quest for the custom YAML quest engine."

dialogue:
  start:
    pages:
      - id: "start_intro"
        npcId: 9010000
        type: next
        next: "start_details"
        prompt: |
          Hey there. I need help testing a very overloaded example quest.
          If you accept, you will see almost every custom requirement type in action.
      - id: "start_details"
        npcId: 9010000
        type: nextPrev
        prev: "start_intro"
        next: "start_choice"
        prompt: |
          This middle page uses the built-in Next/Prev dialogue so the player can
          go backward before deciding.
      - id: "start_choice"
        npcId: 9010000
        type: yesNo
        yes: "start_accept"
        no: "start_decline"
        prompt: |
          This is a yes/no branch. Do you want to help?
      - id: "start_decline"
        npcId: 9010000
        type: ok
        end: true
        prompt: |
          No worries. Come back if you change your mind.
      - id: "start_accept"
        npcId: 9010000
        type: yesNo
        accept: true
        prompt: |
          Great. Start by collecting the required items, fighting the listed monsters,
          visiting the listed maps, and talking to the target NPC.

  inProgress:
    pages:
      - id: "progress_hint"
        npcId: 9010000
        prompt: |
          Keep going. Your progress is tracked while this custom quest is active.

  complete:
    pages:
      - id: "complete_ready"
        npcId: 9010000
        type: yesNo
        complete: true
        prompt: |
          Looks like everything is done. I can hand over the rewards now.
      - id: "complete_done"
        npcId: 9010000
        type: ok
        prompt: |
          Nice work. The rewards have been delivered.

requirements:
  start:
    job:
      - 100
      - 110
      - 111
      - 112
    items:
      - itemId: 4031234
        quantity: 5
        removeOnComplete: false
    ongoingQuest:
      all:
        - 20001
        - any:
            - 20002
            - 20003
    lvmin: 30
    lvmax: 120
    start: "2026-01-01"
    end: "2026-12-31"
    pet:
      itemIds:
        - 5000000
        - 5000001
    mbmin:
      mobId: 100100
      count: 1
    completedQuest:
      any:
        - 21001
        - all:
            - 21002
            - 21003
    meso:
      amount: 10000
      removeOnComplete: false
    buff:
      skillId: 2301004

  complete:
    killMob:
      mobs:
        - mobId: 100100
          count: 30
        - mobId: 100101
          count: 10
    hitMob:
      mobs:
        - mobId: 100100
          count: 20
    damageMob:
      mobs:
        - mobId: 100100
          damage: 50000
    damage:
      amount: 10000
    npc:
      npcId: 1012100
    fieldEnter:
      maps:
        - 100000000
        - 101000000
    interval:
      hours: 24
      minutes: 0

rewards:
  start:
    exp: 1000
    meso: 5000
    buff:
      itemId: 2022179
    script:
      npcId: 9010000
      name: "custom_quest_start"

  complete:
    gainItem:
      - itemId: 4000000
        quantity: 10
      - itemId: 1002001
        quantity: 1
        period: 1440
    loseItem:
      - itemId: 4031234
        quantity: 5
    quest:
      - questId: 22001
        state: 1
      - questId: 22002
        state: 2
    fieldEnter:
      mapId: 100000000
      portal: 0
    fieldLeave:
      mapId: 100000000
      portal: "sp"
    pet:
      itemId: 5000000
      quantity: 1
      period: 43200
    monsterBook:
      - mobId: 100100
        count: 1
      - cardId: 100101
        count: 2
    ap: 5
    sp:
      amount: 3
      skillBook: 2
    script:
      npcId: 9010000
      name: "custom_quest_complete"
`;

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
  {
    name: 'ContaboMaple',
    engine: 'contabo-maple',
    description: 'Contabo Maple custom YAML quest-node template with dialogue, requirements, and rewards',
    rawTemplate: CONTABO_MAPLE_TEMPLATE,
    acceptedInputFormat: 'yaml',
    defaultOutputFormat: 'yaml',
    output: {
      extension: '.yaml',
      mimeType: 'application/x-yaml',
      mode: 'yaml',
    },
  },
];

export async function seedBuiltInExportTemplates(): Promise<void> {
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
