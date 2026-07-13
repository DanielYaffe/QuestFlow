import mongoose, { Document, Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Base variants — hardcoded, never stored in DB
// ---------------------------------------------------------------------------
export const BASE_VARIANTS = ['story', 'combat', 'dialogue', 'treasure'] as const;
export type BaseVariant = typeof BASE_VARIANTS[number];

// ---------------------------------------------------------------------------
// Sub-document interfaces
// ---------------------------------------------------------------------------

export interface IQuestNode {
  _id: mongoose.Types.ObjectId;
  nodeId: string;
  type: string;
  title: string;
  body: string;
  variant: string;
  npcIds: string[];
  monsterIds: string[];
  rewardIds: string[];
  exportFields: IQuestNodeExportFields;
  templateValues: Record<string, unknown>;
}

export interface IQuestExportTarget {
  id: number;
  amount: number;
}

export interface IQuestExportCollectTarget {
  itemId: number;
  amount: number;
}

export interface IQuestExportRewardItem {
  id: number;
  amount: number;
}

export interface IQuestNodeExportFields {
  questId?: number;
  silent: boolean;
  preQuest: number[];
  daily: boolean;
  toKill: IQuestExportTarget[];
  toCollect: IQuestExportCollectTarget[];
  rewardItems: IQuestExportRewardItem[];
}

export interface IQuestEdge {
  _id: mongoose.Types.ObjectId;
  edgeId: string;
  source: string;
  target: string;
}

export interface IQuestlineVariant {
  _id: mongoose.Types.ObjectId;
  name: string;
  color: string;
}

export interface IObjective {
  _id: mongoose.Types.ObjectId;
  objectiveId: string;
  title: string;
  description: string;
}

export interface IReward {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// Root document interface
// ---------------------------------------------------------------------------

export interface IQuestline extends Document {
  title: string;
  description: string;
  genre: string;
  storyPrompt: string;
  styleId: string;
  themeId: string;
  exportFormat: string;
  templateId?: string;
  templateName?: string;
  templateSnapshot?: unknown;
  ownerId: string;
  projectId: string;
  characterIds: string[];
  nodes: IQuestNode[];
  edges: IQuestEdge[];
  variants: IQuestlineVariant[];
  objectives: IObjective[];
  rewards: IReward[];
}

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const QuestNodeSchema = new Schema<IQuestNode>({
  nodeId:     { type: String, required: true },
  type:       { type: String, default: 'questNode' },
  title:      { type: String, required: true },
  body:       { type: String, required: true },
  variant:    { type: String, default: 'story' },
  npcIds:     { type: [String], default: [] },
  monsterIds: { type: [String], default: [] },
  rewardIds:  { type: [String], default: [] },
  templateValues: { type: Schema.Types.Mixed, default: {} },
  exportFields: {
    questId:     { type: Number },
    silent:      { type: Boolean, default: true },
    preQuest:    { type: [Number], default: [-1] },
    daily:       { type: Boolean, default: false },
    toKill:      { type: [{ id: Number, amount: Number, _id: false }], default: [] },
    toCollect:   { type: [{ itemId: Number, amount: Number, _id: false }], default: [] },
    rewardItems: { type: [{ id: Number, amount: Number, _id: false }], default: [] },
  },
});

const QuestEdgeSchema = new Schema<IQuestEdge>({
  edgeId: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
});

const QuestlineVariantSchema = new Schema<IQuestlineVariant>({
  name:  { type: String, required: true },
  color: { type: String, default: '#6366f1' },
});

const ObjectiveSchema = new Schema<IObjective>({
  objectiveId: { type: String, required: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
});

const RewardSchema = new Schema<IReward>({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  rarity:      { type: String, enum: ['common', 'rare', 'epic'], default: 'common' },
  imageUrl:    { type: String, default: '' },
});

// ---------------------------------------------------------------------------
// Root schema
// ---------------------------------------------------------------------------

/**
 * @swagger
 * components:
 *   schemas:
 *     Questline:
 *       type: object
 *       required:
 *         - title
 *         - ownerId
 *       properties:
 *         _id:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         ownerId:
 *           type: string
 *         nodes:
 *           type: array
 *           items:
 *             type: object
 *         edges:
 *           type: array
 *           items:
 *             type: object
 *         variants:
 *           type: array
 *           items:
 *             type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const QuestlineSchema = new Schema<IQuestline>(
  {
    title:        { type: String, required: true },
    description:  { type: String, default: '' },
    genre:        { type: String, default: '' },
    storyPrompt:  { type: String, default: '' },
    styleId:      { type: String, default: '' },
    themeId:      { type: String, default: 'generic_rpg' },
    exportFormat: { type: String, default: 'json' },
    templateId:       { type: String, default: '' },
    templateName:     { type: String, default: '' },
    templateSnapshot: { type: Schema.Types.Mixed },
    ownerId:      { type: String, required: true, index: true },
    projectId:    { type: String, default: '', index: true },
    characterIds: { type: [String], default: [] },
    nodes:       { type: [QuestNodeSchema], default: [] },
    edges:       { type: [QuestEdgeSchema], default: [] },
    variants:    { type: [QuestlineVariantSchema], default: [] },
    objectives:  { type: [ObjectiveSchema], default: [] },
    rewards:     { type: [RewardSchema], default: [] },
  },
  { timestamps: true },
);

const QuestlineModel = mongoose.model<IQuestline>('Questline', QuestlineSchema);
export default QuestlineModel;
