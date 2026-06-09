import { Response } from 'express';
import BaseController from './baseController';
import CharacterModel, { CharacterKind } from '../models/characterModel';
import QuestlineModel from '../models/questlineModel';
import { resolveProjectId } from '../models/projectModel';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getPresignedUrl } from '../utils/s3Helper';

const KINDS: CharacterKind[] = ['npc', 'monster'];

// S3 keys never start with http — presigned URLs always do.
function isS3Key(value: string): boolean {
  return !!value && !value.startsWith('http');
}

interface PreviewSource {
  portraitUrl?: string;
  assets?: { snappedSpriteS3Key?: string; rawSpriteCandidates?: string[] };
}

// Resolve a display image for a character: explicit portrait, else the canonical
// snapped sprite, else the most recent raw candidate. Presign S3 keys.
async function signPreview(c: PreviewSource): Promise<string> {
  const candidates = c.assets?.rawSpriteCandidates ?? [];
  const candidate =
    c.portraitUrl ||
    c.assets?.snappedSpriteS3Key ||
    candidates[candidates.length - 1] ||
    '';
  if (!candidate) return '';
  return isS3Key(candidate) ? getPresignedUrl(candidate) : candidate;
}

class CharacterController extends BaseController {
  constructor() {
    super(CharacterModel);
  }

  // GET /characters?projectId=&kind= — list characters owned by the user.
  // Each result carries a presigned previewUrl and an isOrphan flag (true when
  // no questline references the character).
  async get(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { projectId, kind } = req.query as { projectId?: string; kind?: string };

      const filter: Record<string, unknown> = { ownerId: userId };
      if (projectId) filter.projectId = projectId;
      if (kind === 'npc' || kind === 'monster') filter.kind = kind;

      const characters = await CharacterModel.find(filter).sort({ updatedAt: -1 }).lean();

      // Build the set of character ids referenced by questlines (scoped to the
      // same project when filtering) to flag orphans.
      const qlFilter: Record<string, unknown> = { ownerId: userId };
      if (projectId) qlFilter.projectId = projectId;
      const questlines = await QuestlineModel.find(qlFilter).select('characterIds nodes').lean();
      const referenced = new Set<string>();
      for (const ql of questlines) {
        (ql.characterIds ?? []).forEach((id) => referenced.add(id));
        for (const n of ql.nodes ?? []) {
          (n.npcIds ?? []).forEach((id) => referenced.add(id));
          (n.monsterIds ?? []).forEach((id) => referenced.add(id));
        }
      }

      const results = await Promise.all(
        characters.map(async (c) => ({
          ...c,
          previewUrl: await signPreview(c),
          isOrphan: !referenced.has(c._id.toString()),
        })),
      );
      res.json(results);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // GET /characters/:id — single character (owner only) with presigned previewUrl
  async getById(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const character = await CharacterModel.findById(req.params.id).lean();
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }
      if (character.ownerId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.json({ ...character, previewUrl: await signPreview(character) });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /characters — create a character (ownerId from JWT)
  async create(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const body = req.body as {
        kind?: string;
        name?: string;
        projectId?: string;
        appearance?: string;
        lore?: string;
        tags?: string[];
        portraitUrl?: string;
        dialogueTraits?: string[];
        speciesData?: unknown;
        assets?: unknown;
      };

      if (!body.name?.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      if (body.kind !== 'npc' && body.kind !== 'monster') {
        res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });
        return;
      }

      const projectId = await resolveProjectId(userId, body.projectId);

      const character = await CharacterModel.create({
        ownerId: userId,
        projectId,
        kind: body.kind,
        name: body.name.trim(),
        appearance: body.appearance ?? '',
        lore: body.lore ?? '',
        tags: body.tags ?? [],
        portraitUrl: body.portraitUrl ?? '',
        dialogueTraits: body.dialogueTraits ?? [],
        ...(body.speciesData ? { speciesData: body.speciesData } : {}),
        ...(body.assets ? { assets: body.assets } : {}),
      });

      res.status(201).json({ ...character.toObject(), previewUrl: await signPreview(character) });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PUT /characters/:id — update editable fields (owner only)
  async put(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const character = await CharacterModel.findById(req.params.id);
      if (!character) {
        res.status(404).json({ error: 'Character not found' });
        return;
      }
      if (character.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const body = req.body as {
        name?: string;
        projectId?: string;
        appearance?: string;
        lore?: string;
        tags?: string[];
        portraitUrl?: string;
        dialogueTraits?: string[];
        speciesData?: typeof character.speciesData;
        assets?: typeof character.assets;
      };

      if (body.name !== undefined) character.name = body.name;
      if (body.appearance !== undefined) character.appearance = body.appearance;
      if (body.lore !== undefined) character.lore = body.lore;
      if (body.tags !== undefined) character.tags = body.tags;
      if (body.portraitUrl !== undefined) character.portraitUrl = body.portraitUrl;
      if (body.dialogueTraits !== undefined) character.dialogueTraits = body.dialogueTraits;
      if (body.speciesData !== undefined) character.speciesData = body.speciesData;
      if (body.assets !== undefined) character.assets = body.assets;
      if (body.projectId !== undefined) {
        character.projectId = await resolveProjectId(userId, body.projectId);
      }

      await character.save();
      res.json({ ...character.toObject(), previewUrl: await signPreview(character) });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // GET /characters/:id/usage — how many quest nodes reference this character,
  // so the UI can warn before deletion strips those references.
  async usage(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const character = await CharacterModel.findById(req.params.id).select('ownerId').lean();
      if (!character) {
        res.status(404).json({ error: 'Character not found' });
        return;
      }
      if (character.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const id = String(req.params.id);
      const questlines = await QuestlineModel.find({
        ownerId: userId,
        $or: [{ 'nodes.npcIds': id }, { 'nodes.monsterIds': id }],
      }).select('nodes').lean();

      let nodeCount = 0;
      for (const ql of questlines) {
        for (const n of ql.nodes ?? []) {
          if ((n.npcIds ?? []).includes(id) || (n.monsterIds ?? []).includes(id)) nodeCount++;
        }
      }
      res.json({ nodeCount, questlineCount: questlines.length });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // DELETE /characters/:id — owner only. Also strips the character's id from every
  // questline that references it (roster + node npc/monster lists) so no dangling
  // references are left behind.
  async delete(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const character = await CharacterModel.findById(req.params.id);
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }
      if (character.ownerId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await CharacterModel.findByIdAndDelete(req.params.id);
      await QuestlineModel.updateMany(
        { ownerId: userId },
        {
          $pull: {
            characterIds: req.params.id,
            'nodes.$[].npcIds': req.params.id,
            'nodes.$[].monsterIds': req.params.id,
          },
        },
      );
      return res.json({ message: 'Character deleted' });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}

export default new CharacterController();
