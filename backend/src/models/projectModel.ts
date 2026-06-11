import mongoose, { Document, Schema } from 'mongoose';

export interface IProjectGitSettings {
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export interface IProject extends Document {
  ownerId: string;
  name: string;
  description: string;
  git?: IProjectGitSettings;
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
    ownerId:     { type: String, required: true, index: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    git:         { type: ProjectGitSettingsSchema, default: undefined },
  },
  { timestamps: true },
);

const ProjectModel = mongoose.model<IProject>('Project', ProjectSchema);
export default ProjectModel;
