import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  ownerId: string;
  name: string;
  description: string;
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
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
const ProjectSchema = new Schema<IProject>(
  {
    ownerId:     { type: String, required: true, index: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

const ProjectModel = mongoose.model<IProject>('Project', ProjectSchema);
export default ProjectModel;
