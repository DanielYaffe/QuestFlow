import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { IItem } from '../models/itemModel';
import { StudioError } from '../services/characterStudioService';
import { isSpriteTool } from '../services/generation/spriteTools';
import {
  attachSpriteKey,
  createItem,
  deleteItem,
  getItem,
  getItemUsage,
  isItemRarity,
  listItems,
  publishItemToKb,
  resolveItemSpriteKey,
  selectItemSpriteVersion,
  transformItemSprite,
  updateItem,
} from '../services/itemService';
import { resolveProjectId } from '../models/projectModel';
import { getPresignedUrl } from '../utils/s3Helper';

// ---------------------------------------------------------------------------
// Item endpoints — studio item designs. Controllers call itemService only.
// ---------------------------------------------------------------------------

async function shape(item: IItem): Promise<Record<string, unknown>> {
  const key = resolveItemSpriteKey(item);
  return {
    ...item.toObject(),
    previewUrl: key ? await getPresignedUrl(key) : '',
  };
}

/**
 * Design-sheet shape — adds the presigned sprite version history for the undo
 * strip. Kept off the list response, which would presign 20 keys per item.
 */
async function shapeStudio(item: IItem): Promise<Record<string, unknown>> {
  const keys = item.assets.rawSpriteCandidates ?? [];
  return {
    ...(await shape(item)),
    candidateUrls: await Promise.all(keys.map((key) => getPresignedUrl(key))),
  };
}

function handleStudioError(res: Response, error: unknown): boolean {
  if (error instanceof StudioError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: 'Unauthorized' });
}

function serverError(res: Response, error: unknown): void {
  if (handleStudioError(res, error)) return;
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ error: message });
}

class ItemController {
  // GET /items?projectId=
  async list(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    try {
      const { projectId } = req.query as { projectId?: string };
      const items = await listItems(userId, projectId);
      res.json(await Promise.all(items.map(shape)));
    } catch (error) {
      serverError(res, error);
    }
  }

  // GET /items/:id/usage — quest nodes/questlines referencing this item, so
  // the UI can warn before deletion strips those references.
  async usage(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    try {
      res.json(await getItemUsage(userId, String(req.params.id)));
    } catch (error) {
      serverError(res, error);
    }
  }

  // GET /items/:id
  async getById(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    try {
      res.json(await shapeStudio(await getItem(userId, String(req.params.id))));
    } catch (error) {
      serverError(res, error);
    }
  }

  // POST /items — { name, projectId?, description?, rarity?, tags? }
  async create(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    const body = req.body as {
      name?: string;
      projectId?: string;
      description?: string;
      rarity?: unknown;
      tags?: string[];
    };
    if (!body.name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    try {
      const projectId = await resolveProjectId(userId, body.projectId);
      const item = await createItem({
        ownerId: userId,
        projectId,
        name: body.name,
        description: body.description,
        rarity: isItemRarity(body.rarity) ? body.rarity : undefined,
        tags: body.tags,
      });
      res.status(201).json(await shape(item));
    } catch (error) {
      serverError(res, error);
    }
  }

  // PUT /items/:id — { name?, description?, rarity?, tags?, spriteStyleId?, assets? }
  async update(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    const body = req.body as {
      name?: string;
      description?: string;
      rarity?: unknown;
      tags?: string[];
      spriteStyleId?: string;
      assets?: IItem['assets'];
    };
    try {
      const item = await updateItem(userId, String(req.params.id), {
        name: body.name,
        description: body.description,
        rarity: isItemRarity(body.rarity) ? body.rarity : undefined,
        tags: body.tags,
        spriteStyleId: body.spriteStyleId,
        assets: body.assets,
      });
      res.json(await shapeStudio(item));
    } catch (error) {
      serverError(res, error);
    }
  }

  // DELETE /items/:id — strips the id from every questline (itemIds + node
  // rewardIds), mirroring character deletion.
  async delete(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    try {
      await deleteItem(userId, String(req.params.id));
      res.json({ message: 'Item deleted' });
    } catch (error) {
      serverError(res, error);
    }
  }

  // POST /items/:id/sprite/attach — { imageKey } from an existing sprite.
  async spriteAttach(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    const { imageKey } = req.body as { imageKey?: string };
    if (!imageKey) {
      res.status(400).json({ error: 'imageKey is required' });
      return;
    }
    try {
      res.json(await shapeStudio(await attachSpriteKey(userId, String(req.params.id), imageKey)));
    } catch (error) {
      serverError(res, error);
    }
  }

  // POST /items/:id/sprite/version — { index }. Moves the sprite history cursor:
  // undo, redo and history-strip clicks all land here.
  async spriteVersion(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    const { index } = req.body as { index?: unknown };
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      res.status(400).json({ error: 'index must be an integer' });
      return;
    }
    try {
      res.json(await shapeStudio(await selectItemSpriteVersion(userId, String(req.params.id), index)));
    } catch (error) {
      serverError(res, error);
    }
  }

  // POST /items/:id/sprite/transform — { tool, targetSize? }
  async spriteTransform(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    const { tool, targetSize } = req.body as { tool?: unknown; targetSize?: number };
    if (!isSpriteTool(tool)) {
      res.status(400).json({ error: 'tool must be resize, remove-bg or pixel-snap' });
      return;
    }
    try {
      res.json(await shapeStudio(await transformItemSprite(userId, String(req.params.id), tool, { targetSize })));
    } catch (error) {
      serverError(res, error);
    }
  }

  // POST /items/:id/publish-kb — { gameId }
  async publishKb(req: AuthRequest, res: Response) {
    const userId = req.user?._id?.toString();
    if (!userId) return unauthorized(res);
    const { gameId } = req.body as { gameId?: string };
    if (!gameId) {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }
    try {
      res.json(await shape(await publishItemToKb(userId, String(req.params.id), gameId)));
    } catch (error) {
      serverError(res, error);
    }
  }
}

export default new ItemController();
