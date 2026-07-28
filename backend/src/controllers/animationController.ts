import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getProjectId } from '../utils/projectScope';
import { resolveProjectId } from '../models/projectModel';
import * as animationService from '../services/animationService';
import { getBalance, PixelLabError } from '../services/generation/pixellabService';

function requireUserId(req: AuthRequest, res: Response): string | null {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}

function handleError(res: Response, err: unknown, fallback: string): void {
  if (err instanceof Error && err.name === 'NotFoundError') {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof PixelLabError && err.isBillingError) {
    res.status(402).json({ error: `PixelLab balance insufficient: ${err.message}` });
    return;
  }
  const message = err instanceof Error ? err.message : fallback;
  console.error(`[animationController] ${fallback}:`, err);
  res.status(400).json({ error: message });
}

// GET /animations?characterId=&spriteId=
export async function listAnimations(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const { characterId, spriteId, all } = req.query as Record<string, string | undefined>;
    const results = await animationService.listAnimations({
      ownerId: userId,
      // Character/sprite-scoped queries span projects; the plain list view is
      // scoped to the active project (X-Project-Id) like sprites are.
      projectId: characterId || spriteId || all ? undefined : getProjectId(req) || undefined,
      characterId: characterId || undefined,
      spriteId: spriteId || undefined,
    });
    res.json(results);
  } catch (err) {
    handleError(res, err, 'Failed to list animations');
  }
}

// GET /animations/:id
export async function getAnimation(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    res.json(await animationService.getAnimation(userId, String(req.params.id)));
  } catch (err) {
    handleError(res, err, 'Failed to load animation');
  }
}

// POST /animations/generate — { name, action, frameCount?, spriteId? | sourceImageKey?, characterId? }
export async function generateAnimation(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { name, action, frameCount, spriteId, sourceImageKey, characterId } = req.body as {
    name?: string;
    action?: string;
    frameCount?: number;
    spriteId?: string;
    sourceImageKey?: string;
    characterId?: string;
  };

  if (!action?.trim()) {
    res.status(400).json({ error: 'action is required' });
    return;
  }

  try {
    const projectId = await resolveProjectId(userId, getProjectId(req));
    const result = await animationService.createAndGenerate({
      ownerId: userId,
      projectId,
      name: name?.trim() || action.trim(),
      action: action.trim(),
      frameCount,
      spriteId,
      sourceImageKey,
      characterId,
    });
    res.status(202).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to start generation');
  }
}

// POST /animations/:id/regenerate — { action, frameCount? }
export async function regenerateAnimation(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { action, frameCount } = req.body as { action?: string; frameCount?: number };
  if (!action?.trim()) {
    res.status(400).json({ error: 'action is required' });
    return;
  }

  try {
    const result = await animationService.regenerate(userId, String(req.params.id), {
      action: action.trim(),
      frameCount,
    });
    res.status(202).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to start regeneration');
  }
}

// POST /animations/:id/edit — { instruction }
export async function editAnimation(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { instruction } = req.body as { instruction?: string };
  if (!instruction?.trim()) {
    res.status(400).json({ error: 'instruction is required' });
    return;
  }

  try {
    const result = await animationService.editWithText(userId, String(req.params.id), instruction.trim());
    res.status(202).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to start edit');
  }
}

// PUT /animations/:id — { name?, fps?, loop?, frameKeys?, characterId? }
export async function updateAnimation(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { name, fps, loop, frameKeys, characterId } = req.body as {
    name?: string;
    fps?: number;
    loop?: boolean;
    frameKeys?: string[];
    characterId?: string;
  };

  try {
    const result = await animationService.updateAnimation(userId, String(req.params.id), {
      name,
      fps,
      loop,
      frameKeys,
      characterId,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Failed to update animation');
  }
}

// DELETE /animations/:id
export async function deleteAnimation(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    await animationService.deleteAnimation(userId, String(req.params.id));
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete animation');
  }
}

// POST /animations/:id/export — { formats: ('spritesheet'|'gif')[] }
export async function exportAnimation(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { formats } = req.body as { formats?: string[] };
  const valid = (formats ?? []).filter(
    (f): f is 'spritesheet' | 'gif' => f === 'spritesheet' || f === 'gif',
  );
  if (valid.length === 0) {
    res.status(400).json({ error: 'formats must include "spritesheet" and/or "gif"' });
    return;
  }

  try {
    res.json(await animationService.exportAnimation(userId, String(req.params.id), valid));
  } catch (err) {
    handleError(res, err, 'Failed to export animation');
  }
}

// GET /pixellab/balance
export async function pixelLabBalance(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    res.json(await getBalance());
  } catch (err) {
    handleError(res, err, 'Failed to fetch PixelLab balance');
  }
}
