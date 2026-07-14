import { Router } from 'express';
import * as gameController from '../controllers/gameController';

const gameRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Games
 *   description: Game (knowledge-base owner) management and KB document API
 */

/**
 * @swagger
 * /games:
 *   get:
 *     summary: List the user's Games
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of games
 *   post:
 *     summary: Create a Game (owner of one knowledge base)
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Game created
 */
gameRouter.get('/', gameController.listGames);
gameRouter.post('/', gameController.createGame);

/**
 * @swagger
 * /games/{gameId}:
 *   get:
 *     summary: Get one Game (owner only)
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *   put:
 *     summary: Update a Game's name/description (owner only)
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a Game, its whole vector KB and document registry
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 */
gameRouter.get('/:gameId', gameController.getGame);
gameRouter.put('/:gameId', gameController.updateGame);
gameRouter.delete('/:gameId', gameController.deleteGame);

/**
 * @swagger
 * /games/{gameId}/kb/ingest:
 *   post:
 *     summary: Ingest raw text into the Game's KB (async — returns 202 + docId)
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title, text]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [lore, quests, characters, dialogue]
 *               title:
 *                 type: string
 *               text:
 *                 type: string
 *               sourceFilename:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       202:
 *         description: Accepted — ingestion runs as a background job
 */
gameRouter.post('/:gameId/kb/ingest', gameController.ingestDocument);

/**
 * @swagger
 * /games/{gameId}/kb/documents:
 *   get:
 *     summary: List KB documents (registry, without original text)
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 */
gameRouter.get('/:gameId/kb/documents', gameController.listDocuments);

/**
 * @swagger
 * /games/{gameId}/kb/documents/{docId}:
 *   get:
 *     summary: Get one KB document including originalText (edit view)
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *   put:
 *     summary: Edit a KB document — text change re-embeds (async), tags-only is instant
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a KB document and its vector chunks
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 */
gameRouter.get('/:gameId/kb/documents/:docId', gameController.getDocument);
gameRouter.put('/:gameId/kb/documents/:docId', gameController.editDocument);
gameRouter.delete('/:gameId/kb/documents/:docId', gameController.deleteDocument);

/**
 * @swagger
 * /games/{gameId}/kb/documents/{docId}/retry:
 *   post:
 *     summary: Retry ingestion of a failed KB document
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 */
gameRouter.post('/:gameId/kb/documents/:docId/retry', gameController.retryDocument);

/**
 * @swagger
 * /games/{gameId}/kb/search:
 *   get:
 *     summary: Test search over the Game's KB (verifies retrieval quality)
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [lore, quests, characters, dialogue]
 *       - in: query
 *         name: topK
 *         schema:
 *           type: integer
 *           default: 5
 */
gameRouter.get('/:gameId/kb/search', gameController.searchKb);

export default gameRouter;
