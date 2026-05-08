import { Router } from 'express';
import { Job, Queue } from 'bullmq';
import { redis } from '../queues/connection';
import { AuthRequest } from '../middlewares/authMiddleware';
import { Response } from 'express';

const jobRouter = Router();

// Registry of all queues — add new queues here as they are created
const queueRegistry: Record<string, Queue> = {};

function getOrCreateQueue(name: string): Queue {
  if (!queueRegistry[name]) {
    queueRegistry[name] = new Queue(name, { connection: redis });
  }
  return queueRegistry[name];
}

/**
 * GET /api/jobs/:queue/:jobId/stream
 *
 * Universal SSE endpoint for any BullMQ queue.
 * Streams job state until completed or failed, then closes.
 * Auth: JWT via Authorization header or ?token= query param.
 *
 * Supported queues: sprite-generation, monster-generation, quest-generation
 */
jobRouter.get('/:queue/:jobId/stream', async (req: AuthRequest, res: Response) => {
  const queueName = String(req.params.queue);
  const jobId = String(req.params.jobId);

  const allowedQueues = ['sprite-generation', 'monster-generation', 'quest-generation'];
  if (!allowedQueues.includes(queueName)) {
    res.status(400).json({ error: `Unknown queue: ${queueName}` });
    return;
  }

  const queue = getOrCreateQueue(queueName);
  const job = await Job.fromId(queue, jobId);

  if (!job) {
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
      const fresh = await Job.fromId(queue, jobId);
      if (!fresh) return;

      const state = await fresh.getState();
      const progress = fresh.progress;

      if (state === 'completed') {
        finish({ state: 'completed', progress, result: fresh.returnvalue });
      } else if (state === 'failed') {
        finish({ state: 'failed', error: fresh.failedReason });
      } else {
        // Send progress updates while active
        res.write(`data: ${JSON.stringify({ state, progress })}\n\n`);
      }
    } catch (err) {
      console.error(`[jobRoute] SSE poller error for ${queueName}/${jobId}:`, err);
    }
  }, 500);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(poller);
  });
});

export default jobRouter;
