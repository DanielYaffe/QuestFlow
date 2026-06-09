import { Response } from 'express';
import BaseController from './baseController';
import ProjectModel, { ensureInboxProject } from '../models/projectModel';
import QuestlineModel from '../models/questlineModel';
import CharacterModel from '../models/characterModel';
import { AuthRequest } from '../middlewares/authMiddleware';

interface CountRow {
  _id: string;
  n: number;
}

class ProjectController extends BaseController {
  constructor() {
    super(ProjectModel);
  }

  // GET /projects — list projects owned by the user, with questline/character counts.
  // Guarantees the auto-created "Inbox" project exists so the list is never empty.
  async get(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      await ensureInboxProject(userId);
      const projects = await ProjectModel.find({ ownerId: userId })
        .sort({ isInbox: -1, updatedAt: -1 })
        .lean();
      const ids = projects.map((p) => p._id.toString());

      const [qlCounts, charCounts] = await Promise.all([
        QuestlineModel.aggregate<CountRow>([
          { $match: { ownerId: userId, projectId: { $in: ids } } },
          { $group: { _id: '$projectId', n: { $sum: 1 } } },
        ]),
        CharacterModel.aggregate<CountRow>([
          { $match: { ownerId: userId, projectId: { $in: ids } } },
          { $group: { _id: '$projectId', n: { $sum: 1 } } },
        ]),
      ]);
      const qlMap = new Map(qlCounts.map((c) => [c._id, c.n]));
      const charMap = new Map(charCounts.map((c) => [c._id, c.n]));

      res.json(
        projects.map((p) => ({
          ...p,
          questlineCount: qlMap.get(p._id.toString()) ?? 0,
          characterCount: charMap.get(p._id.toString()) ?? 0,
        })),
      );
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // GET /projects/:id — single project (owner only)
  async getById(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const project = await ProjectModel.findById(req.params.id).lean();
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

  // POST /projects — create a project (ownerId from JWT; isInbox is never user-settable)
  async create(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { name, description, defaultThemeId, defaultExportFormat } = req.body as {
        name?: string;
        description?: string;
        defaultThemeId?: string;
        defaultExportFormat?: string;
      };
      if (!name?.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const project = await ProjectModel.create({
        ownerId: userId,
        name: name.trim(),
        description: description ?? '',
        defaultThemeId: defaultThemeId ?? 'generic_rpg',
        defaultExportFormat: defaultExportFormat ?? 'json',
        isInbox: false,
      });
      res.status(201).json(project);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PUT /projects/:id — update name/description/defaults (owner only)
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
      const { name, description, defaultThemeId, defaultExportFormat } = req.body as {
        name?: string;
        description?: string;
        defaultThemeId?: string;
        defaultExportFormat?: string;
      };
      if (name !== undefined) project.name = name;
      if (description !== undefined) project.description = description;
      if (defaultThemeId !== undefined) project.defaultThemeId = defaultThemeId;
      if (defaultExportFormat !== undefined) project.defaultExportFormat = defaultExportFormat;
      await project.save();
      res.json(project);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /projects/:id — owner only. The Inbox cannot be deleted; deleting a
  // normal project reassigns its questlines + characters to the Inbox (no data loss).
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
      if (project.isInbox) {
        return res.status(400).json({ error: 'The Inbox project cannot be deleted' });
      }

      const inbox = await ensureInboxProject(userId);
      const inboxId = inbox._id.toString();
      const projectId = project._id.toString();

      await Promise.all([
        QuestlineModel.updateMany({ projectId }, { projectId: inboxId }),
        CharacterModel.updateMany({ projectId }, { projectId: inboxId }),
      ]);
      await ProjectModel.findByIdAndDelete(projectId);

      return res.json({ message: 'Project deleted; its questlines and characters moved to Inbox' });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}

export default new ProjectController();
