import mongoose, { Document, Schema } from 'mongoose';
import { parseTemplate, TemplateSchema } from '../services/exportTemplates/templateParser';

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

const MAPLE_CUSTOM_QUEST_TEMPLATE = `# Reference custom quest YAML showing every supported requirement and reward.
# This is intentionally overloaded as documentation; a real quest should usually
# include only the requirements and rewards it actually needs.

id: 10001
name: "Example Quest With Every Requirement And Reward"
description: "Template quest for the custom YAML quest engine."

dialogue:
  # QuestLines can use these pages to auto-generate NPC conversations.
  # Each page has a stable id for branching/tracking, the NPC that speaks, and
  # the prompt text shown to the player.
  # Optional page controls:
  # - type: ok|next|prev|nextPrev|yesNo  explicit built-in NPC dialogue style
  # - prev: "page_id"      show a Prev button and jump to that page
  # - next: "page_id"      show a Next button and jump to that page
  # - yes: "page_id"       show Yes/No and jump here on Yes
  # - no: "page_id"        show Yes/No and jump here on No
  # - accept: true         Yes starts the custom quest on this page
  # - complete: true       Yes completes the custom quest on this page
  # - end: true            OK closes the custom dialogue
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
    # Start requirements should only use current player state checks.
    # Do not put custom progress requirements here, because the player has not
    # started this custom quest yet.

    # JOB: player must be one of these jobs or in one of these job branches.
    job:
      - 100
      - 110
      - 111
      - 112

    # ITEMS: player must have all listed items.
    items:
      - itemId: 4031234
        quantity: 5
        removeOnComplete: false

    # ONGOING_QUEST: player must have these vanilla quests started.
    ongoingQuest:
      all:
        - 20001
        - any:
            - 20002
            - all:
                - 20003
                - 20004
            - any:
                - 20005
                - 20006
    # MIN_LEVEL / MAX_LEVEL: player level bounds.
    lvmin: 30
    lvmax: 120

    # START_DATE / END_DATE: quest availability window.
    start: "2026-01-01"
    end: "2026-12-31"

    # PET: player must have any listed pet summoned. Empty itemIds means any pet.
    pet:
      itemIds:
        - 5000000
        - 5000001

    # MONSTER_BOOK: require total cards, or a specific mob/card when mobId is set.
    mbmin:
      mobId: 100100
      count: 1

    # COMPLETED_QUEST: player must have these vanilla quests completed.
    completedQuest:
      any:
        - 21001
        - all:
            - 21002
            - 21003

    # MESO: player must currently have this amount.
    meso:
      amount: 10000
      removeOnComplete: false

    # BUFF: player must currently have a buff from this skill id.
    buff:
      skillId: 2301004

  complete:
    # Complete requirements may use custom quest progress stored in the DB,
    # because progress starts being tracked after the quest is started.

    # KILL_MOB: tracked by mob kill events.
    killMob:
      mobs:
        - mobId: 100100
          count: 30
        - mobId: 100101
          count: 10

    # HIT_MOB: tracked by mob hit events, counting hits rather than kills.
    hitMob:
      mobs:
        - mobId: 100100
          count: 20

    # DAMAGE_MOB: tracked by player damage dealt to specific mobs.
    damageMob:
      mobs:
        - mobId: 100100
          damage: 50000

    # DAMAGE: tracked by damage taken by the player.
    damage:
      amount: 10000

    # TALK_TO_NPC: tracked when the player talks to this NPC.
    npc:
      npcId: 1012100

    # FIELD_ENTER: tracked when the player enters each listed map.
    fieldEnter:
      maps:
        - 100000000
        - 101000000

    # INTERVAL: repeat cooldown. Stamped when questDone is processed.
    # If you want interval to block starting a repeatable quest, handle it as a
    # special pre-start availability check in the loader/service rather than as
    # a normal start requirement.
    interval:
      hours: 24
      minutes: 0

rewards:
  start:
    # EXP: gives EXP, using the server quest EXP rate setting.
    exp: 1000

    # MESO: gives mesos when positive, removes mesos when negative.
    meso: 5000

    # BUFF: applies an item effect or skill effect.
    buff:
      itemId: 2022179
      # skillId: 2301004
      # level: 20

    # SCRIPT: opens an NPC script.
    script:
      npcId: 9010000
      name: "custom_quest_start"

  complete:
    # GAIN_ITEM: gives one or more items after checking inventory space.
    gainItem:
      - itemId: 4000000
        quantity: 10
      - itemId: 1002001
        quantity: 1
        period: 1440

    # LOSE_ITEM: removes one or more items; fails if not enough are present.
    loseItem:
      - itemId: 4031234
        quantity: 5

    # QUEST: sets vanilla quest statuses. 0 = not started, 1 = started, 2 = completed.
    quest:
      - questId: 22001
        state: 1
      - questId: 22002
        state: 2

    # FIELD_ENTER: warps the player to a specific map and optional portal.
    fieldEnter:
      mapId: 100000000
      portal: 0

    # FIELD_LEAVE: warps to the current map's return map, or to mapId if provided.
    fieldLeave:
      mapId: 100000000
      portal: "sp"

    # PET: gives a pet item.
    pet:
      itemId: 5000000
      quantity: 1
      period: 43200

    # MONSTER_BOOK: adds monster book cards.
    monsterBook:
      - mobId: 100100
        count: 1
      - cardId: 100101
        count: 2

    # AP: gives available ability points. Negative values remove AP down to 0.
    ap: 5

    # SP: gives available skill points. skillBook is optional.
    sp:
      amount: 3
      skillBook: 2

    # SCRIPT: opens an NPC script after completion.
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
  generationContract?: Partial<TemplateSchema['generationContract']>;
  output: {
    extension: string;
    mimeType: string;
    mode: ExportTemplateFormat;
  };
};

const MAPLE_CUSTOM_QUEST_GENERATION_CONTRACT: Partial<TemplateSchema['generationContract']> = {
  dialogRoles: [
    'dialogue.start.pages',
    'dialogue.inProgress.pages',
    'dialogue.complete.pages',
  ],
  fieldHints: [
    {
      path: 'id',
      meaning: 'Unique quest identifier.',
      generationUse: 'Use the quest node id/export quest id, not placeholder values from the template.',
    },
    {
      path: 'name',
      meaning: 'Player-facing quest name.',
      generationUse: 'Use the generated quest node title.',
    },
    {
      path: 'description',
      meaning: 'Short player-facing quest summary.',
      generationUse: 'Summarize the node story and goal in one or two sentences.',
    },
    {
      path: 'dialogue.start.pages[].id',
      meaning: 'Stable page identifier used by other page-link fields in the same start dialogue list.',
      generationUse: 'Generate unique ids for each start dialogue page.',
    },
    {
      path: 'dialogue.start.pages[].npcId',
      meaning: 'NPC id speaking on this start dialogue page.',
      generationUse: 'Use a known NPC id when available; otherwise leave the default/manual value.',
    },
    {
      path: 'dialogue.start.pages[].type',
      meaning: 'Built-in dialogue control style for the page.',
      generationUse: 'Choose a style that matches the links and flags on the page.',
    },
    {
      path: 'dialogue.start.pages[].prompt',
      meaning: 'Player-facing text shown during quest start dialogue.',
      generationUse: 'Generate natural dialogue that introduces the quest and explains what the player should do.',
    },
    {
      path: 'dialogue.start.pages[].accept',
      meaning: 'Marks the page where the player accepts and starts the quest.',
      generationUse: 'Set true only on the page that starts the quest.',
    },
    {
      path: 'dialogue.start.pages[].end',
      meaning: 'Marks a terminal page that closes the dialogue.',
      generationUse: 'Set true only on refusal or closing pages.',
    },
    {
      path: 'dialogue.inProgress.pages[].id',
      meaning: 'Stable page identifier used by other page-link fields in the same in-progress dialogue list.',
      generationUse: 'Generate unique ids for each in-progress dialogue page.',
    },
    {
      path: 'dialogue.inProgress.pages[].prompt',
      meaning: 'Player-facing reminder text shown while the quest is active.',
      generationUse: 'Generate a short hint that reminds the player what remains to do.',
    },
    {
      path: 'dialogue.complete.pages[].id',
      meaning: 'Stable page identifier used by other page-link fields in the same completion dialogue list.',
      generationUse: 'Generate unique ids for each completion dialogue page.',
    },
    {
      path: 'dialogue.complete.pages[].prompt',
      meaning: 'Player-facing quest completion dialogue text.',
      generationUse: 'Generate dialogue that acknowledges completion and delivers the reward.',
    },
    {
      path: 'dialogue.complete.pages[].complete',
      meaning: 'Marks the page where the quest is completed.',
      generationUse: 'Set true only on the page that completes the quest.',
    },
    {
      path: 'requirements.start.ongoingQuest',
      meaning: 'Recursive condition group for quests that must be ongoing before this quest can start.',
      generationUse: 'Usually use graph-derived or manual prerequisite state; do not copy sample ids.',
    },
    {
      path: 'requirements.start.completedQuest',
      meaning: 'Recursive condition group for quests that must be completed before this quest can start.',
      generationUse: 'Use graph prerequisites when possible; otherwise leave empty/manual.',
    },
    {
      path: 'requirements.complete.killMob.mobs',
      meaning: 'Rows of monsters the player must kill to complete the quest.',
      generationUse: 'Fill only when the node objective is combat and exact monster ids are known.',
    },
    {
      path: 'requirements.complete.hitMob.mobs',
      meaning: 'Rows of monsters the player must hit as a completion requirement.',
      generationUse: 'Fill only when the quest requires hitting rather than killing.',
    },
    {
      path: 'requirements.complete.damageMob.mobs',
      meaning: 'Rows of monsters and damage amounts required for completion.',
      generationUse: 'Fill only when the quest requires dealing damage to specific monsters.',
    },
    {
      path: 'requirements.complete.fieldEnter.maps',
      meaning: 'Map ids the player must enter to satisfy the completion requirement.',
      generationUse: 'Fill only when exact map ids are known.',
    },
    {
      path: 'rewards.complete.gainItem',
      meaning: 'Item rewards granted when the quest is completed.',
      generationUse: 'Fill only when exact reward item ids are known; otherwise keep manual.',
    },
    {
      path: 'rewards.complete.loseItem',
      meaning: 'Items removed from the player when the quest is completed.',
      generationUse: 'Fill only for collection or turn-in objectives with exact item ids.',
    },
    {
      path: 'rewards.start.exp',
      meaning: 'Experience reward granted at quest start.',
      generationUse: 'Use a reasonable amount only when this exact field exists.',
    },
    {
      path: 'rewards.start.script.name',
      meaning: 'NPC script to trigger at quest start.',
      generationUse: 'Usually manual; do not invent script names unless the user provides conventions.',
    },
    {
      path: 'rewards.complete.script.name',
      meaning: 'NPC script to trigger after quest completion.',
      generationUse: 'Usually manual; do not invent script names unless the user provides conventions.',
    },
  ],
  relationshipHints: [
    {
      kind: 'sequence',
      from: 'dialogue.start.pages[].next',
      to: 'dialogue.start.pages[].id',
      meaning: 'The next field points to the following page id in the same start dialogue list.',
    },
    {
      kind: 'sequence',
      from: 'dialogue.start.pages[].prev',
      to: 'dialogue.start.pages[].id',
      meaning: 'The prev field points to the previous page id in the same start dialogue list.',
    },
    {
      kind: 'branch',
      from: 'dialogue.start.pages[].yes',
      to: 'dialogue.start.pages[].id',
      meaning: 'The yes field points to the page used when the player chooses Yes.',
    },
    {
      kind: 'branch',
      from: 'dialogue.start.pages[].no',
      to: 'dialogue.start.pages[].id',
      meaning: 'The no field points to the page used when the player chooses No.',
    },
    {
      kind: 'sequence',
      from: 'dialogue.inProgress.pages[].next',
      to: 'dialogue.inProgress.pages[].id',
      meaning: 'The next field points to the following page id in the same in-progress dialogue list.',
    },
    {
      kind: 'sequence',
      from: 'dialogue.inProgress.pages[].prev',
      to: 'dialogue.inProgress.pages[].id',
      meaning: 'The prev field points to the previous page id in the same in-progress dialogue list.',
    },
    {
      kind: 'branch',
      from: 'dialogue.inProgress.pages[].yes',
      to: 'dialogue.inProgress.pages[].id',
      meaning: 'The yes field points to the page used when the player chooses Yes.',
    },
    {
      kind: 'branch',
      from: 'dialogue.inProgress.pages[].no',
      to: 'dialogue.inProgress.pages[].id',
      meaning: 'The no field points to the page used when the player chooses No.',
    },
    {
      kind: 'sequence',
      from: 'dialogue.complete.pages[].next',
      to: 'dialogue.complete.pages[].id',
      meaning: 'The next field points to the following page id in the same completion dialogue list.',
    },
    {
      kind: 'sequence',
      from: 'dialogue.complete.pages[].prev',
      to: 'dialogue.complete.pages[].id',
      meaning: 'The prev field points to the previous page id in the same completion dialogue list.',
    },
    {
      kind: 'branch',
      from: 'dialogue.complete.pages[].yes',
      to: 'dialogue.complete.pages[].id',
      meaning: 'The yes field points to the page used when the player chooses Yes.',
    },
    {
      kind: 'branch',
      from: 'dialogue.complete.pages[].no',
      to: 'dialogue.complete.pages[].id',
      meaning: 'The no field points to the page used when the player chooses No.',
    },
  ],
  generationHints: [
    'Generate dialogue pages as a coherent conversation flow, not isolated prompt rows.',
    'Use id fields as local page anchors and relationship fields as links to those anchors.',
    'For simple linear dialogue, connect pages forward and backward when both fields exist.',
    'For yes/no dialogue, use branch relationship fields and make each target page distinct.',
    'Use accept only for accepting/starting the quest, complete only for completing the quest, and end only for closing/refusal pages.',
    'Do not copy sample ids, item ids, monster ids, map ids, amounts, or placeholder script names from the template.',
  ],
  userExamples: [],
};

function withGenerationContract(
  schema: TemplateSchema,
  override?: Partial<TemplateSchema['generationContract']>,
): TemplateSchema {
  if (!override) return schema;
  return {
    ...schema,
    generationContract: {
      ...schema.generationContract,
      ...override,
      requirementRoles: override.requirementRoles ?? schema.generationContract.requirementRoles,
      rewardRoles: override.rewardRoles ?? schema.generationContract.rewardRoles,
      dialogRoles: override.dialogRoles ?? schema.generationContract.dialogRoles,
      fieldHints: override.fieldHints ?? schema.generationContract.fieldHints,
      relationshipHints: override.relationshipHints ?? schema.generationContract.relationshipHints,
      generationHints: override.generationHints ?? schema.generationContract.generationHints,
      userExamples: override.userExamples ?? schema.generationContract.userExamples,
      promptSummary: [
        schema.generationContract.promptSummary,
        ...(override.generationHints ?? []),
      ].filter(Boolean).join('\n'),
    },
  };
}

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
    name: 'Maple Custom Quest YAML',
    engine: 'custom-template',
    description: 'Built-in Maple custom quest YAML template with dialogue, requirements, and rewards',
    rawTemplate: MAPLE_CUSTOM_QUEST_TEMPLATE,
    acceptedInputFormat: 'yaml',
    defaultOutputFormat: 'yaml',
    generationContract: MAPLE_CUSTOM_QUEST_GENERATION_CONTRACT,
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
    const templateSchema = withGenerationContract(parsed.templateSchema, seed.generationContract);
    const schemaSummary = {
      ...parsed.schemaSummary,
      requirementFields: templateSchema.generationContract.requirementRoles,
      rewardFields: templateSchema.generationContract.rewardRoles,
      dialogFields: templateSchema.generationContract.dialogRoles,
      structureSummary: templateSchema.generationContract.promptSummary,
    };
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
          templateSchema,
          schemaSummary,
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
