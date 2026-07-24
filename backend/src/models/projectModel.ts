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
