import { Response } from 'express';
import { GoogleGenAI, Modality } from '@google/genai';
import { config } from '../config/config';
import { AuthRequest } from '../middlewares/authMiddleware';
import SpriteModel from '../models/spriteModel';
import { uploadBufferToS3, getPresignedUrl } from '../utils/s3Helper';
import { createJob, getJob, completeJob, failJob, JobResult } from '../utils/jobQueue';

// ---------------------------------------------------------------------------
// Filter types (mirrored from frontend)
// ---------------------------------------------------------------------------

export interface SpriteFilters {
  artStyle: string;
  perspective: string;
  aspectRatio: string;
  background: string;
  colorPalette: string;
  detailLevel: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Prompt builder — translate filters into a detailed generation prompt
// ---------------------------------------------------------------------------

function buildSpritePrompt(userPrompt: string, filters: Partial<SpriteFilters>): string {
  const parts: string[] = [];

  const artStyleMap: Record<string, string> = {
    'pixel-art-8bit':  '8-bit pixel art sprite',
    'pixel-art-16bit': '16-bit pixel art sprite with smooth shading',
    'hand-drawn':      'hand-drawn 2D game sprite with ink outlines',
    'vector':          'clean vector art game sprite with flat colours',
    'watercolor':      'watercolour-style game sprite with soft brush textures',
    'anime':           'anime-style game sprite with bold outlines and cel shading',
    'realistic':       'semi-realistic painted game sprite',
    '3d-render':       'low-poly 3D rendered game sprite on a plain background',
  };
  const styleLabel = artStyleMap[filters.artStyle ?? ''] ?? 'game sprite';
  parts.push(`A ${styleLabel}`);

  const categoryMap: Record<string, string> = {
    'character':   'playable character',
    'enemy':       'enemy creature',
    'npc':         'non-player character',
    'item':        'collectible item',
    'weapon':      'weapon or equipment',
    'environment': 'environment tile or prop',
    'ui':          'user-interface icon element',
    'effect':      'visual particle or spell effect',
  };
  if (filters.category && filters.category !== 'any') {
    parts.push(`for use as a ${categoryMap[filters.category] ?? filters.category}`);
  }

  parts.push(`— ${userPrompt.trim()}`);

  const perspectiveMap: Record<string, string> = {
    'side-view':    'shown from a side-scrolling perspective',
    'top-down':     'shown from a top-down view',
    'isometric':    'rendered in isometric perspective',
    'front-facing': 'shown facing forward, symmetrical',
  };
  if (filters.perspective && filters.perspective !== 'any') {
    parts.push(perspectiveMap[filters.perspective] ?? '');
  }

  const detailMap: Record<string, string> = {
    'minimal':        'Keep the design minimal with few details.',
    'medium':         'Use a moderate level of detail.',
    'detailed':       'Include rich detail and clear features.',
    'ultra-detailed': 'Maximise detail — intricate textures, highlights, and shadows.',
  };
  if (filters.detailLevel) {
    parts.push(detailMap[filters.detailLevel] ?? '');
  }

  const paletteMap: Record<string, string> = {
    'vibrant':    'Use vibrant, saturated colours.',
    'muted':      'Use muted, desaturated colours.',
    'monochrome': 'Use a monochrome colour scheme.',
    'warm':       'Use a warm colour palette (reds, oranges, yellows).',
    'cool':       'Use a cool colour palette (blues, greens, purples).',
    'neon':       'Use a neon/cyberpunk colour palette with glowing edges.',
  };
  if (filters.colorPalette && filters.colorPalette !== 'any') {
    parts.push(paletteMap[filters.colorPalette] ?? '');
  }

  const bgMap: Record<string, string> = {
    'transparent': 'The sprite must have a transparent/no background — isolated subject only.',
    'white':       'Place the sprite on a plain white background.',
    'black':       'Place the sprite on a plain black background.',
    'gradient':    'Use a subtle gradient background that complements the sprite colours.',
    'scene':       'Include a simple environmental background scene.',
  };
  if (filters.background) {
    parts.push(bgMap[filters.background] ?? '');
  }

  const arMap: Record<string, string> = {
    'square':    'The image should be square (1:1 ratio).',
    'portrait':  'The image should be portrait orientation (taller than wide).',
    'landscape': 'The image should be landscape orientation (wider than tall).',
  };
  if (filters.aspectRatio && filters.aspectRatio !== 'auto') {
    parts.push(arMap[filters.aspectRatio] ?? '');
  }

  parts.push(
    'The result must be a clean, game-ready asset suitable for direct use in a 2D game. ' +
    'No text, no watermarks, no borders, no extra elements outside the sprite.',
  );

  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// POST /sprites/generate — queue job, respond immediately with { jobId }
// ---------------------------------------------------------------------------

export async function generateSprite(req: AuthRequest, res: Response) {
  const userId = req.user?._id?.toString();
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!config.GEMINI_API_KEY) {
    res.status(500).json({ error: 'Gemini API key is not configured' });
    return;
  }

  if (!config.AWS_S3_BUCKET || !config.AWS_ACCESS_KEY_ID || (!config.MINIO_ENDPOINT && !config.AWS_SECRET_ACCESS_KEY)) {
    res.status(500).json({ error: 'S3 storage is not configured' });
    return;
  }

  const { prompt, filters } = req.body as {
    prompt?: string;
    filters?: Partial<SpriteFilters>;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  const job = createJob();
  // Respond immediately — client polls via SSE
  res.status(202).json({ jobId: job.id });

  // Run generation in background — do not await
  const fullPrompt = buildSpritePrompt(prompt, filters ?? {});
  // setImmediate detaches from the current call stack so the HTTP request
  // close event cannot propagate an AbortError into the Gemini fetch.
  // Capture everything we need before yielding to the event loop
  const jobId = job.id;
  const capturedUserId = userId;
  const capturedPrompt = prompt;
  const capturedFilters = filters;

  // Use Promise.resolve().then() to fully defer past the current microtask queue,
  // ensuring the HTTP request/response is fully closed before Gemini fetch starts.
  void Promise.resolve().then(() => (async () => {
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 4_000;

    // Note: do NOT set httpOptions.timeout here — setting a timeout causes the
    // SDK to create an AbortController internally, which can be spuriously
    // triggered by undici's connection lifecycle events. The retry loop below
    // provides resilience instead.
    const genAI = new GoogleGenAI({
      apiKey: config.GEMINI_API_KEY!,
    });

    let imagePart: { inlineData: { mimeType: string; data: string } } | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await genAI.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: fullPrompt,
          config: { responseModalities: [Modality.IMAGE] },
        });

        const candidate = response.candidates?.[0];
        imagePart = candidate?.content?.parts?.find(
          (p: { inlineData?: { mimeType?: string; data?: string } }) =>
            p.inlineData?.mimeType?.startsWith('image/'),
        ) as typeof imagePart;

        if (imagePart) break; // success

        console.warn(`[spriteController] attempt ${attempt}: no image part returned`);
      } catch (err) {
        const cause = (err as NodeJS.ErrnoException & { cause?: unknown })?.cause;
        console.warn(`[spriteController] attempt ${attempt} error: ${String(err)}${cause ? ` | cause: ${String(cause)}` : ''}`);
        if (attempt === MAX_ATTEMPTS) {
          failJob(jobId, err instanceof Error ? err.message : 'Failed to generate sprite');
          return;
        }
      }
      // Wait before retrying
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    try {
      if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
        failJob(jobId, 'No image returned from AI — try again');
        return;
      }

      // 2. Upload to S3 — returns the storage key, not a URL
      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const imageKey = await uploadBufferToS3(buffer, imagePart.inlineData.mimeType, 'sprites');

      // 3. Save the key (permanent) to MongoDB
      const sprite = await SpriteModel.create({
        ownerId:    capturedUserId,
        userPrompt: capturedPrompt.trim(),
        fullPrompt,
        imageUrl:   imageKey,   // stored as key, presigned on read
        filters: {
          artStyle:     capturedFilters?.artStyle     ?? '',
          perspective:  capturedFilters?.perspective  ?? '',
          aspectRatio:  capturedFilters?.aspectRatio  ?? '',
          background:   capturedFilters?.background   ?? '',
          colorPalette: capturedFilters?.colorPalette ?? '',
          detailLevel:  capturedFilters?.detailLevel  ?? '',
          category:     capturedFilters?.category     ?? '',
        },
      });

      // 4. Generate a short-lived presigned URL to return to the client
      const presignedUrl = await getPresignedUrl(imageKey);

      completeJob(jobId, {
        _id:        sprite._id.toString(),
        imageUrl:   presignedUrl,
        imageKey,
        userPrompt: sprite.userPrompt,
        fullPrompt: sprite.fullPrompt,
        filters:    sprite.filters,
        createdAt:  sprite.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('[spriteController] generateSprite background error:', error);
      failJob(jobId, error instanceof Error ? error.message : 'Failed to generate sprite');
    }
  })());
}


// ---------------------------------------------------------------------------
// GET /sprites/jobs/:jobId/stream — SSE stream for job completion
// ---------------------------------------------------------------------------

export function streamSpriteJob(req: AuthRequest, res: Response) {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat every 15s to keep the connection alive through proxies
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);

  const send = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    clearInterval(heartbeat);
    res.end();
  };

  // Race condition: job already finished before SSE opened
  if (job.status === 'done') {
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ status: 'done', result: job.result })}\n\n`);
    res.end();
    return;
  }
  if (job.status === 'failed') {
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ status: 'failed', error: job.error })}\n\n`);
    res.end();
    return;
  }

  const onDone = (result: JobResult) => send({ status: 'done', result });
  const onFailed = (error: string) => send({ status: 'failed', error });

  job.emitter.once('done', onDone);
  job.emitter.once('failed', onFailed);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.emitter.off('done', onDone);
    job.emitter.off('failed', onFailed);
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

    // Generate a fresh presigned URL for every sprite
    const results = await Promise.all(
      sprites.map(async (s) => ({
        _id:        s._id.toString(),
        imageUrl:   await getPresignedUrl(s.imageUrl),  // imageUrl column stores the S3 key
        userPrompt: s.userPrompt,
        fullPrompt: s.fullPrompt,
        filters:    s.filters,
        createdAt:  s.createdAt,
      })),
    );

    res.json(results);
  } catch (error) {
    console.error('[spriteController] getSprites error:', error);
    res.status(500).json({ error: 'Failed to fetch sprites' });
  }
}
