import { Response } from 'express';
import { Job } from 'bullmq';
import { AuthRequest } from '../middlewares/authMiddleware';
import SpriteModel from '../models/spriteModel';
import ThemeConfigModel from '../models/themeConfigModel';
import { getPresignedUrl } from '../utils/s3Helper';
import { spriteQueue, SpriteJobData, SpriteJobResult } from '../queues/spriteQueue';

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

  let loraName = '';
  let triggerWord = '';
  let resolvedStyleId = styleId ?? '';

  if (styleId) {
    const themeConfig = await ThemeConfigModel.findById(styleId).lean();
    if (!themeConfig) {
      res.status(404).json({ error: 'Style not found' });
      return;
    }
    loraName = themeConfig.loraModelPath ?? '';
    triggerWord = themeConfig.loraTriggerWord ?? '';
  }

  // Build positive prompt: trigger word prepended if a style is selected
  const positivePrompt = triggerWord
    ? `${triggerWord}, ${prompt.trim()}`
    : prompt.trim();

  const bullJob = await spriteQueue.add('generate', {
    userId,
    userPrompt: prompt.trim(),
    positivePrompt,
    negativePrompt: negativePrompt ?? '',
    styleId: resolvedStyleId,
    loraName,
    triggerWord,
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
    const sprites = await SpriteModel.find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const results = await Promise.all(
      sprites.map(async (s) => ({
        _id:            s._id.toString(),
        imageUrl:       await getPresignedUrl(s.imageUrl),
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
