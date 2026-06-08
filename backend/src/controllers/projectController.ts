import { Response } from 'express';
import BaseController from './baseController';
import ProjectModel from '../models/projectModel';
import QuestlineModel from '../models/questlineModel';
import SpriteModel from '../models/spriteModel';
import { AuthRequest } from '../middlewares/authMiddleware';

class ProjectController extends BaseController {
  constructor() {
    super(ProjectModel);
  }

  // GET /projects — only projects owned by the authenticated user
  async get(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const projects = await ProjectModel.find({ ownerId: userId })
        .select('name description ownerId createdAt updatedAt')
        .sort({ updatedAt: -1 });
      res.json(projects);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // GET /projects/:id — owner only
  async getById(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const project = await ProjectModel.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (project.ownerId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.json(project);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /projects — set ownerId from JWT
  async create(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const project = await ProjectModel.create({
        ownerId:     userId,
        name:        req.body.name,
        description: req.body.description ?? '',
      });
      res.status(201).json(project);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PUT /projects/:id — owner only (rename / edit description)
  async put(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const project = await ProjectModel.findById(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (project.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (typeof req.body.name === 'string') project.name = req.body.name;
      if (typeof req.body.description === 'string') project.description = req.body.description;
      await project.save();
      res.json(project);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /projects/:id — owner only; cascades to questlines and sprites
  async delete(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const project = await ProjectModel.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (project.ownerId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Refuse to delete the user's last project — there must always be one.
      const count = await ProjectModel.countDocuments({ ownerId: userId });
      if (count <= 1) {
        return res.status(400).json({ error: 'Cannot delete your only project' });
      }

      const projectId = project._id.toString();
      await Promise.all([
        QuestlineModel.deleteMany({ ownerId: userId, projectId }),
        SpriteModel.deleteMany({ ownerId: userId, projectId }),
      ]);
      await ProjectModel.findByIdAndDelete(projectId);

      return res.json({ message: 'Project deleted' });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /projects/:id/duplicate — deep-clone a project and all its content
  async duplicate(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const source = await ProjectModel.findById(req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (source.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const copy = await ProjectModel.create({
        ownerId:     userId,
        name:        req.body.name?.trim() || `${source.name} (copy)`,
        description: source.description,
      });
      const newProjectId = copy._id.toString();

      // Strip identity/timestamp fields so Mongo assigns fresh ones on insert.
      const stripForClone = (doc: Record<string, unknown>) => {
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        return { ...rest, projectId: newProjectId };
      };

      // Clone questlines
      const questlines = await QuestlineModel.find({ ownerId: userId, projectId: source._id.toString() }).lean();
      if (questlines.length > 0) {
        await QuestlineModel.insertMany(questlines.map((q) => stripForClone(q as unknown as Record<string, unknown>)));
      }

      // Clone sprites
      const sprites = await SpriteModel.find({ ownerId: userId, projectId: source._id.toString() }).lean();
      if (sprites.length > 0) {
        await SpriteModel.insertMany(sprites.map((s) => stripForClone(s as unknown as Record<string, unknown>)));
      }

      res.status(201).json(copy);
    } catch (error) {
      this.handleError(res, error);
    }
  }
}

/**
 * Ensure every owner with content has at least one project, and backfill the
 * `projectId` of any orphaned questlines / sprites. Runs once on startup so the
 * multi-project feature is backward-compatible with pre-existing data.
 */
export async function ensureDefaultProjects(): Promise<void> {
  // Owners that have content but no project at all.
  const questlineOwners = await QuestlineModel.distinct('ownerId');
  const spriteOwners = await SpriteModel.distinct('ownerId');
  const owners = [...new Set([...questlineOwners, ...spriteOwners])].filter(Boolean) as string[];

  for (const ownerId of owners) {
    let project = await ProjectModel.findOne({ ownerId }).sort({ createdAt: 1 });
    if (!project) {
      project = await ProjectModel.create({ ownerId, name: 'My Project', description: '' });
    }
    const projectId = project._id.toString();

    await Promise.all([
      QuestlineModel.updateMany(
        { ownerId, $or: [{ projectId: { $exists: false } }, { projectId: '' }] },
        { $set: { projectId } },
      ),
      SpriteModel.updateMany(
        { ownerId, $or: [{ projectId: { $exists: false } }, { projectId: '' }] },
        { $set: { projectId } },
      ),
    ]);
  }
}

export default new ProjectController();
