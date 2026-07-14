import { Response } from 'express';
import { Model } from 'mongoose';
import BaseController from './baseController';
import ProjectModel, { ensureInboxProject } from '../models/projectModel';
import QuestlineModel from '../models/questlineModel';
import SpriteModel from '../models/spriteModel';
import CharacterModel from '../models/characterModel';
import { AuthRequest } from '../middlewares/authMiddleware';
import { ownsGame } from '../services/gameService';

interface CountRow {
  _id: string;
  n: number;
}

class ProjectController extends BaseController {
  constructor() {
    super(ProjectModel);
  }

  // GET /projects — list projects owned by the user, with questline/sprite/character
  // counts. Guarantees the auto-created "Inbox" project exists so the list is never empty.
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

      const countBy = (model: Model<any>) =>
        model.aggregate<CountRow>([
          { $match: { ownerId: userId, projectId: { $in: ids } } },
          { $group: { _id: '$projectId', n: { $sum: 1 } } },
        ]);

      const [qlCounts, spriteCounts, charCounts] = await Promise.all([
        countBy(QuestlineModel),
        countBy(SpriteModel),
        countBy(CharacterModel),
      ]);
      const qlMap = new Map(qlCounts.map((c) => [c._id, c.n]));
      const spriteMap = new Map(spriteCounts.map((c) => [c._id, c.n]));
      const charMap = new Map(charCounts.map((c) => [c._id, c.n]));

      res.json(
        projects.map((p) => ({
          ...p,
          questlineCount: qlMap.get(p._id.toString()) ?? 0,
          spriteCount: spriteMap.get(p._id.toString()) ?? 0,
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
      const { name, description, defaultThemeId, defaultExportFormat, gameId } = req.body as {
        name?: string;
        description?: string;
        defaultThemeId?: string;
        defaultExportFormat?: string;
        gameId?: string;
      };
      if (name !== undefined) project.name = name;
      if (description !== undefined) project.description = description;
      if (defaultThemeId !== undefined) project.defaultThemeId = defaultThemeId;
      if (defaultExportFormat !== undefined) project.defaultExportFormat = defaultExportFormat;
      if (gameId !== undefined) {
        // '' clears the link; a non-empty id must be a Game the user owns.
        if (gameId !== '' && !(userId && await ownsGame(userId, gameId))) {
          res.status(403).json({ error: 'Game not found or not owned by you' });
          return;
        }
        project.gameId = gameId;
      }
      await project.save();
      res.json(project);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /projects/:id — owner only. The Inbox cannot be deleted; deleting a normal
  // project reassigns its questlines + sprites + characters to the Inbox (no data loss).
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
        SpriteModel.updateMany({ projectId }, { projectId: inboxId }),
        CharacterModel.updateMany({ projectId }, { projectId: inboxId }),
      ]);
      await ProjectModel.findByIdAndDelete(projectId);

      return res.json({ message: 'Project deleted; its questlines, sprites and characters moved to Inbox' });
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
        ownerId:             userId,
        name:                req.body.name?.trim() || `${source.name} (copy)`,
        description:         source.description,
        defaultThemeId:      source.defaultThemeId,
        defaultExportFormat: source.defaultExportFormat,
        isInbox:             false,
      });
      const newProjectId = copy._id.toString();
      const sourceId = source._id.toString();

      // Strip identity/timestamp fields so Mongo assigns fresh ones on insert.
      const stripForClone = (doc: Record<string, unknown>) => {
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        return { ...rest, projectId: newProjectId };
      };

      const cloneInto = async (model: Model<any>) => {
        const docs = await model.find({ ownerId: userId, projectId: sourceId }).lean();
        if (docs.length > 0) {
          await model.insertMany(docs.map((d: Record<string, unknown>) => stripForClone(d)));
        }
      };

      await Promise.all([
        cloneInto(QuestlineModel),
        cloneInto(SpriteModel),
        cloneInto(CharacterModel),
      ]);

      res.status(201).json(copy);
    } catch (error) {
      this.handleError(res, error);
    }
  }
}

/**
 * Backward-compat migration: ensure every owner with content has an Inbox project
 * and reassign any orphaned questlines / sprites / characters (missing or empty
 * projectId) to it. Runs once on startup so the multi-project feature is
 * compatible with data created before projects existed.
 */
export async function ensureDefaultProjects(): Promise<void> {
  const [questlineOwners, spriteOwners, characterOwners] = await Promise.all([
    QuestlineModel.distinct('ownerId'),
    SpriteModel.distinct('ownerId'),
    CharacterModel.distinct('ownerId'),
  ]);
  const owners = [...new Set([...questlineOwners, ...spriteOwners, ...characterOwners])].filter(Boolean) as string[];

  for (const ownerId of owners) {
    const inbox = await ensureInboxProject(ownerId);
    const projectId = inbox._id.toString();
    const orphanFilter = { ownerId, $or: [{ projectId: { $exists: false } }, { projectId: '' }] };

    await Promise.all([
      QuestlineModel.updateMany(orphanFilter, { $set: { projectId } }),
      SpriteModel.updateMany(orphanFilter, { $set: { projectId } }),
      CharacterModel.updateMany(orphanFilter, { $set: { projectId } }),
    ]);
  }
}

export default new ProjectController();
