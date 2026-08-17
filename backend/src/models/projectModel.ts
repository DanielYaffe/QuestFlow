import mongoose, { Document, Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Project — top-level container. Owns many questlines, sprites and characters
// and carries the default theme / export format inherited by its questlines.
// Every user has exactly one auto-created "Inbox" project (isInbox: true) that
// holds questlines/sprites/characters created before/without an explicit project.
// ---------------------------------------------------------------------------

export interface IProjectGitSettings {
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export interface IProjectGitTarget {
  id: string;
  name: string;
  encryptedToken?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export interface IMapleIdRange {
  min: number;
  max: number;
}

export type ProjectAssetFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'object'
  | 'list'
  | 'image'
  | 'enum'
  | 'reference';

export interface IProjectValuePoolOption {
  label: string;
  value: string | number | boolean;
  metadata?: Record<string, unknown>;
}

export interface IProjectValuePool {
  key: string;
  name: string;
  description?: string;
  valueType: 'text' | 'number' | 'boolean';
  options: IProjectValuePoolOption[];
  ranges: IMapleIdRange[];
}

export interface IProjectAssetField {
  key: string;
  label: string;
  type: ProjectAssetFieldType;
  required: boolean;
  nullable: boolean;
  description?: string;
  poolKey?: string;
  itemType?: ProjectAssetFieldType;
  fields?: IProjectAssetField[];
}

export interface IProjectAssetTypeSchema {
  key: string;
  name: string;
  description?: string;
  fields: IProjectAssetField[];
}

export interface IProjectAssetSchema {
  assetTypes: IProjectAssetTypeSchema[];
  valuePools: IProjectValuePool[];
}

export interface IProjectMapleSettings {
  enabled: boolean;
  targetVersion: 'v83';
  defaultExportMode: 'changed-only' | 'full-snapshot';
  npcIdRanges: IMapleIdRange[];
  itemIdRanges: IMapleIdRange[];
}

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  ownerId: string;
  name: string;
  description: string;
  defaultThemeId: string;
  defaultExportFormat: string;
  // Optional link to a Game whose knowledge base grounds this project's
  // generation. Shared: many projects may reference the same Game. '' = none.
  gameId: string;
  isInbox: boolean;
  // Optional GitHub repository this project's questlines export to. The auth
  // token stays shared at the user level.
  git?: IProjectGitSettings;
  gitTargets: IProjectGitTarget[];
  defaultQuestExportTargetId: string;
  defaultAssetExportTargetId: string;
  assetSchema: IProjectAssetSchema;
  mapleSettings: IProjectMapleSettings;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Project:
 *       type: object
 *       required:
 *         - name
 *         - ownerId
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         ownerId:
 *           type: string
 *         defaultThemeId:
 *           type: string
 *         defaultExportFormat:
 *           type: string
 *         isInbox:
 *           type: boolean
 *         git:
 *           type: object
 *           description: GitHub repository this project's questlines export to. The auth token is shared at the user level.
 *           properties:
 *             repoOwner:
 *               type: string
 *             repoName:
 *               type: string
 *             defaultBranch:
 *               type: string
 *             defaultFilePath:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const ProjectGitSettingsSchema = new Schema<IProjectGitSettings>(
  {
    repoOwner:       { type: String, default: undefined },
    repoName:        { type: String, default: undefined },
    defaultBranch:   { type: String, default: 'main' },
    defaultFilePath: { type: String, default: '' },
  },
  { _id: false },
);

const ProjectGitTargetSchema = new Schema<IProjectGitTarget>(
  {
    id:              { type: String, required: true },
    name:            { type: String, required: true },
    encryptedToken:  { type: String, default: undefined },
    repoOwner:       { type: String, default: undefined },
    repoName:        { type: String, default: undefined },
    defaultBranch:   { type: String, default: 'main' },
    defaultFilePath: { type: String, default: '' },
  },
  { _id: false },
);

const MapleIdRangeSchema = new Schema<IMapleIdRange>(
  {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  { _id: false },
);

const ProjectValuePoolOptionSchema = new Schema<IProjectValuePoolOption>(
  {
    label:    { type: String, required: true },
    value:    { type: Schema.Types.Mixed, required: true },
    metadata: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

const ProjectValuePoolSchema = new Schema<IProjectValuePool>(
  {
    key:         { type: String, required: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    valueType:   { type: String, enum: ['text', 'number', 'boolean'], default: 'text' },
    options:     { type: [ProjectValuePoolOptionSchema], default: [] },
    ranges:      { type: [MapleIdRangeSchema], default: [] },
  },
  { _id: false },
);

const ProjectAssetFieldSchema = new Schema<IProjectAssetField>(
  {
    key:         { type: String, required: true },
    label:       { type: String, required: true },
    type:        {
      type: String,
      enum: ['text', 'number', 'boolean', 'date', 'object', 'list', 'image', 'enum', 'reference'],
      required: true,
    },
    required:    { type: Boolean, default: false },
    nullable:    { type: Boolean, default: true },
    description: { type: String, default: '' },
    poolKey:     { type: String, default: '' },
    itemType:    {
      type: String,
      enum: ['text', 'number', 'boolean', 'date', 'object', 'list', 'image', 'enum', 'reference'],
      default: undefined,
    },
  },
  { _id: false },
);
ProjectAssetFieldSchema.add({
  fields: { type: [ProjectAssetFieldSchema], default: [] },
});

const ProjectAssetTypeSchema = new Schema<IProjectAssetTypeSchema>(
  {
    key:         { type: String, required: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    fields:      { type: [ProjectAssetFieldSchema], default: [] },
  },
  { _id: false },
);

const ProjectAssetSchema = new Schema<IProjectAssetSchema>(
  {
    assetTypes: { type: [ProjectAssetTypeSchema], default: [] },
    valuePools: { type: [ProjectValuePoolSchema], default: [] },
  },
  { _id: false },
);

const ProjectMapleSettingsSchema = new Schema<IProjectMapleSettings>(
  {
    enabled:            { type: Boolean, default: false },
    targetVersion:      { type: String, enum: ['v83'], default: 'v83' },
    defaultExportMode:  { type: String, enum: ['changed-only', 'full-snapshot'], default: 'changed-only' },
    npcIdRanges:        { type: [MapleIdRangeSchema], default: [] },
    itemIdRanges:       { type: [MapleIdRangeSchema], default: [] },
  },
  { _id: false },
);

const ProjectSchema = new Schema<IProject>(
  {
    ownerId:             { type: String, required: true, index: true },
    name:                { type: String, required: true },
    description:         { type: String, default: '' },
    defaultThemeId:      { type: String, default: 'generic_rpg' },
    defaultExportFormat: { type: String, default: 'json' },
    gameId:              { type: String, default: '' },
    isInbox:             { type: Boolean, default: false },
    git:                 { type: ProjectGitSettingsSchema, default: undefined },
    gitTargets:          { type: [ProjectGitTargetSchema], default: [] },
    defaultQuestExportTargetId: { type: String, default: '' },
    defaultAssetExportTargetId: { type: String, default: '' },
    assetSchema:         { type: ProjectAssetSchema, default: () => ({ assetTypes: [], valuePools: [] }) },
    mapleSettings:       { type: ProjectMapleSettingsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const ProjectModel = mongoose.model<IProject>('Project', ProjectSchema);

// ---------------------------------------------------------------------------
// Find-or-create the user's "Inbox" project — the default home for questlines,
// sprites and characters created without an explicit project. Every user has
// exactly one. Shared by the controller (create defaults) and the migration.
// ---------------------------------------------------------------------------
export async function ensureInboxProject(ownerId: string): Promise<IProject> {
  const existing = await ProjectModel.findOne({ ownerId, isInbox: true });
  if (existing) return existing;
  return ProjectModel.create({
    ownerId,
    name: 'Inbox',
    description: 'Default project for questlines, sprites and characters without a home.',
    isInbox: true,
  });
}

// Resolve the project a questline/sprite/character should belong to: the
// requested project when it is owned by the user, otherwise the user's Inbox.
// Returns the project _id as a string.
export async function resolveProjectId(ownerId: string, projectId?: string): Promise<string> {
  if (projectId) {
    const owned = await ProjectModel.exists({ _id: projectId, ownerId });
    if (owned) return projectId;
  }
  const inbox = await ensureInboxProject(ownerId);
  return inbox._id.toString();
}

export default ProjectModel;
