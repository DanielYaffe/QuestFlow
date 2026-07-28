import { Response } from 'express';
import BaseController from './baseController';
import CharacterModel, { CharacterKind, ICharacterRotations, ROTATION_DIRECTIONS } from '../models/characterModel';
import QuestlineModel from '../models/questlineModel';
import { resolveProjectId } from '../models/projectModel';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getPresignedUrl } from '../utils/s3Helper';
import {
  startRotationsJob,
  buildRotationSheet,
  publishToKb,
  transformSprite,
  SpriteTool,
  StudioError,
} from '../services/characterStudioService';

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

// Presign the 8-direction rotation sprites (design sheet). Empty when none exist.
async function signRotations(
  rotations: ICharacterRotations | undefined,
): Promise<Partial<ICharacterRotations>> {
  if (!rotations) return {};
  const signed: Partial<ICharacterRotations> = {};
  for (const dir of ROTATION_DIRECTIONS) {
    const key = rotations[dir];
    if (key) signed[dir] = await getPresignedUrl(key);
  }
  return signed;
}

function handleStudioError(res: Response, error: unknown): boolean {
  if (error instanceof StudioError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
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

      // Map character id → questlines referencing it (scoped to the same
      // project when filtering) — powers isOrphan and the "used in" display.
      const qlFilter: Record<string, unknown> = { ownerId: userId };
      if (projectId) qlFilter.projectId = projectId;
      const questlines = await QuestlineModel.find(qlFilter).select('title characterIds nodes').lean();
      const usedIn = new Map<string, { questlineId: string; title: string }[]>();
      for (const ql of questlines) {
        const ids = new Set<string>(ql.characterIds ?? []);
        for (const n of ql.nodes ?? []) {
          (n.npcIds ?? []).forEach((id) => ids.add(id));
          (n.monsterIds ?? []).forEach((id) => ids.add(id));
        }
        for (const id of ids) {
          const arr = usedIn.get(id) ?? [];
          arr.push({ questlineId: ql._id.toString(), title: ql.title });
          usedIn.set(id, arr);
        }
      }

      const results = await Promise.all(
        characters.map(async (c) => {
          const uses = usedIn.get(c._id.toString()) ?? [];
          return {
            ...c,
            previewUrl: await signPreview(c),
            isOrphan: uses.length === 0,
            usedIn: uses,
          };
        }),
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
      return res.json({
        ...character,
        previewUrl: await signPreview(character),
        rotationUrls: await signRotations(character.assets?.rotations),
      });
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

  // POST /characters/:id/rotations — enqueue PixelLab 8-direction generation
  // from the character's current sprite (owner only). 202 { jobId }.
  async rotations(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      res.status(202).json(await startRotationsJob(userId, String(req.params.id)));
    } catch (error) {
      if (!handleStudioError(res, error)) this.handleError(res, error);
    }
  }

  // POST /characters/:id/rotations/export — compose the 8-direction rotations
  // into one horizontal spritesheet. Returns the PNG as base64 plus frame
  // metadata; nothing is written to S3.
  async rotationsExport(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { sheet, metadata } = await buildRotationSheet(userId, String(req.params.id));
      res.json({ sheetBase64: sheet.toString('base64'), metadata });
    } catch (error) {
      if (!handleStudioError(res, error)) this.handleError(res, error);
    }
  }

  // POST /characters/:id/publish-kb — { gameId }. Writes the design into the
  // game's knowledge base as a parser-recognizable entity and links kbRef.
  async publishKb(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { gameId } = req.body as { gameId?: string };
    if (!gameId) {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }
    try {
      const character = await publishToKb(userId, String(req.params.id), gameId);
      res.json({ ...character.toObject(), previewUrl: await signPreview(character) });
    } catch (error) {
      if (!handleStudioError(res, error)) this.handleError(res, error);
    }
  }

  // POST /characters/:id/sprite/transform — { tool, targetSize? }. Runs an image
  // tool (resize / remove-bg / pixel-snap) on the current sprite; the result
  // becomes the new canonical sprite.
  async spriteTransform(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { tool, targetSize } = req.body as { tool?: string; targetSize?: number };
    if (tool !== 'resize' && tool !== 'remove-bg' && tool !== 'pixel-snap') {
      res.status(400).json({ error: 'tool must be resize, remove-bg or pixel-snap' });
      return;
    }
    try {
      const character = await transformSprite(userId, String(req.params.id), tool as SpriteTool, { targetSize });
      res.json({
        ...character.toObject(),
        previewUrl: await signPreview(character),
        rotationUrls: await signRotations(character.assets?.rotations),
      });
    } catch (error) {
      if (!handleStudioError(res, error)) this.handleError(res, error);
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
