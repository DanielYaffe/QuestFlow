import { Router } from 'express';
import { generateSprite, getSprites, streamSpriteJob } from '../controllers/spriteController';

const spriteRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Sprites
 *   description: AI sprite generation and management
 */

/**
 * @swagger
 * /sprites:
 *   get:
 *     summary: List all sprites owned by the authenticated user
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of sprite records with fresh presigned image URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SpriteRecord'
 *       401:
 *         description: Unauthorized
 */
spriteRouter.get('/', getSprites);

/**
 * @swagger
 * /sprites/generate:
 *   post:
 *     summary: Start an async AI sprite generation job
 *     description: >
 *       Enqueues a background Gemini image generation task and returns a jobId
 *       immediately (HTTP 202). Poll the result via the SSE stream endpoint.
 *     tags: [Sprites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 example: A fierce dragon knight in golden armour
 *               filters:
 *                 $ref: '#/components/schemas/SpriteFilters'
 *     responses:
 *       202:
 *         description: Job accepted — poll /sprites/jobs/{jobId}/stream for the result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                   example: 3f2b1c4d-5e6a-7b8c-9d0e-1f2a3b4c5d6e
 *       400:
 *         description: prompt is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Gemini API key or S3 storage not configured
 */
spriteRouter.post('/generate', generateSprite);

/**
 * @swagger
 * /sprites/jobs/{jobId}/stream:
 *   get:
 *     summary: SSE stream — receive sprite job result when ready
 *     description: >
 *       Opens a Server-Sent Events connection. Emits one event when the job
 *       completes or fails, then closes. Because EventSource cannot send
 *       Authorization headers, pass the JWT as the `token` query parameter.
 *     tags: [Sprites]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID returned by POST /sprites/generate
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT access token (used instead of Authorization header for SSE)
 *     responses:
 *       200:
 *         description: >
 *           text/event-stream. Each event is a JSON object:
 *           `{ "status": "done", "result": SpriteRecord }` or
 *           `{ "status": "failed", "error": "message" }`
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       404:
 *         description: Job not found
 *       401:
 *         description: Unauthorized
 */
// SSE — auth handled by global middleware which accepts ?token= query param
spriteRouter.get('/jobs/:jobId/stream', streamSpriteJob);

export default spriteRouter;
