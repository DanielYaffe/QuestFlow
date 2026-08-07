import { Response } from 'express';
import { Job } from 'bullmq';
import { AuthRequest } from '../middlewares/authMiddleware';
import SpriteModel from '../models/spriteModel';
import SpriteStyleModel from '../models/spriteStyleModel';
import { styleUnavailability } from '../services/generation/styleAvailability';
import { getPresignedUrl } from '../utils/s3Helper';
import { spriteQueue, SpriteJobData, SpriteJobResult } from '../queues/spriteQueue';
import { getProjectId } from '../utils/projectScope';
import { resolveProjectId } from '../models/projectModel';

// ---------------------------------------------------------------------------
// POST /sprites/generate — enqueue ComfyUI generation job
// Body: { prompt, styleId?, negativePrompt? }
// ---------------------------------------------------------------------------

export async function generateSprite(req: AuthRequest, res: Response) {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { prompt, styleId, negativePrompt } = req.body as {
    prompt?: string;
    styleId?: string;
    negativePrompt?: string;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  // An unrecognised style is a 400, not a silent swap to something else: each
  // style is a different RunPod endpoint with a different model baked in, so
  // falling back would hand the caller an image from a model they did not ask
  // for. An omitted styleId still resolves to our default — that is our own
  // product layer, not a RunPod concern.
  let style;
  if (styleId) {
    style = await SpriteStyleModel.findOne({ styleId, isActive: true }).lean();
    if (!style) {
      res.status(400).json({ error: `Unknown or inactive style "${styleId}"` });
      return;
    }
  } else {
    style = await SpriteStyleModel.findOne({ isDefault: true, isActive: true }).lean();
    if (!style) {
      res.status(503).json({ error: 'No active default style is configured' });
      return;
    }
  }

  // Catch a style that has drifted from the deployed images here, rather than
  // paying for a worker cold start and failing inside ComfyUI with "lora not
  // found" after the fact.
  const problems = styleUnavailability(style);
  if (problems.length > 0) {
    res.status(409).json({ error: `Style "${style.styleId}" cannot run: ${problems.join('; ')}` });
    return;
  }

  const resolvedStyleId = style.styleId;

  // Scope the sprite to the active project (X-Project-Id header), falling back to Inbox.
  const projectId = await resolveProjectId(userId, getProjectId(req));

  const bullJob = await spriteQueue.add('generate', {
    userId,
    projectId,
    userPrompt: prompt.trim(),
    styleId: resolvedStyleId,
    negativePrompt: negativePrompt ?? undefined,
  } satisfies SpriteJobData);

  res.status(202).json({ jobId: bullJob.id });
}

// ---------------------------------------------------------------------------
// GET /sprites/jobs/:jobId/stream — SSE stream for job completion
// ---------------------------------------------------------------------------

export async function streamSpriteJob(req: AuthRequest, res: Response) {
  const { jobId } = req.params;

  const bullJob = await Job.fromId<SpriteJobData, SpriteJobResult>(spriteQueue, String(jobId));
  if (!bullJob) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);

  const finish = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    clearInterval(heartbeat);
    clearInterval(poller);
    res.end();
  };

  const poller = setInterval(async () => {
    try {
      const fresh = await Job.fromId<SpriteJobData, SpriteJobResult>(spriteQueue, String(jobId));
      if (!fresh) return;

      const state = await fresh.getState();

      if (state === 'completed') {
        finish({ status: 'done', result: fresh.returnvalue });
      } else if (state === 'failed') {
        finish({ status: 'failed', error: fresh.failedReason });
      }
    } catch (err) {
      console.error('[spriteController] SSE poller error:', err);
    }
  }, 500);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(poller);
  });
}

// ---------------------------------------------------------------------------
// GET /sprites — list all sprites for the authenticated user
// ---------------------------------------------------------------------------

export async function getSprites(req: AuthRequest, res: Response) {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const filter: Record<string, unknown> = { ownerId: userId };
    const projectId = getProjectId(req);
    if (projectId) filter.projectId = projectId;
    const sprites = await SpriteModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const results = await Promise.all(
      sprites.map(async (s) => ({
        _id:            s._id.toString(),
        imageUrl:       await getPresignedUrl(s.imageUrl),
        imageKey:       s.imageUrl, // raw S3 key — used when promoting a sprite to a Character
        userPrompt:     s.userPrompt,
        positivePrompt: s.positivePrompt,
        negativePrompt: s.negativePrompt,
        styleId:        s.styleId,
        createdAt:      s.createdAt,
      })),
    );

    res.json(results);
  } catch (error) {
    console.error('[spriteController] getSprites error:', error);
    res.status(500).json({ error: 'Failed to fetch sprites' });
  }
}
