import { Router, RequestHandler } from 'express';
import questlineController from '../controllers/questlineController';

const questlineRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Questlines
 *   description: Questline management API
 */

// ── Questline CRUD ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /questlines:
 *   get:
 *     summary: Get all questlines owned by the authenticated user
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of questlines
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Questline'
 */
questlineRouter.get('/', questlineController.get.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}:
 *   get:
 *     summary: Get a questline by id
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The questline
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Questline'
 *       404:
 *         description: Not found
 */
questlineRouter.get('/:id', questlineController.getById.bind(questlineController));

/**
 * @swagger
 * /questlines:
 *   post:
 *     summary: Create a new questline
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Questline created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Questline'
 */
questlineRouter.post('/', questlineController.create.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}:
 *   put:
 *     summary: Update a questline (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated questline
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.put('/:id', questlineController.put.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}:
 *   delete:
 *     summary: Delete a questline and all its data (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.delete('/:id', questlineController.delete.bind(questlineController));

// ── Graph (nodes + edges) ───────────────────────────────────────────────────

/**
 * @swagger
 * /questlines/{id}/graph:
 *   get:
 *     summary: Get nodes and edges for the quest builder
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Graph data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nodes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/QuestNode'
 *                 edges:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/QuestEdge'
 *                 nextNodeId:
 *                   type: number
 */
questlineRouter.get('/:id/graph', questlineController.getGraph.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/graph:
 *   put:
 *     summary: Save the full graph (replaces all nodes and edges)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nodes:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/QuestNode'
 *               edges:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/QuestEdge'
 *     responses:
 *       200:
 *         description: Graph saved
 *       403:
 *         description: Forbidden
 */
questlineRouter.put('/:id/graph', questlineController.saveGraph.bind(questlineController));

// ── Variants ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /questlines/{id}/variants:
 *   get:
 *     summary: Get base variants plus custom variants for a questline
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 base:
 *                   type: array
 *                   items:
 *                     type: string
 *                 custom:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/QuestlineVariant'
 */
questlineRouter.get('/:id/variants', questlineController.getVariants.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/variants:
 *   post:
 *     summary: Add a custom variant to a questline (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       201:
 *         description: Variant created
 *       403:
 *         description: Forbidden
 */
questlineRouter.post('/:id/variants', questlineController.createVariant.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/variants/{variantId}:
 *   delete:
 *     summary: Remove a custom variant (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.delete('/:id/variants/:variantId', questlineController.deleteVariant.bind(questlineController));

// ── Characters ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /questlines/{id}/characters:
 *   get:
 *     summary: Get characters for a questline
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of characters
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Character'
 */
questlineRouter.get('/:id/characters', questlineController.getCharacters.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/characters:
 *   post:
 *     summary: Add a character to a questline (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Character'
 *     responses:
 *       201:
 *         description: Character created
 *       403:
 *         description: Forbidden
 */
questlineRouter.post('/:id/characters', questlineController.createCharacter.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/characters/{characterId}:
 *   put:
 *     summary: Update a character (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Character'
 *     responses:
 *       200:
 *         description: Updated character
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.put('/:id/characters/:characterId', questlineController.updateCharacter.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/characters/{characterId}:
 *   delete:
 *     summary: Delete a character (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.delete('/:id/characters/:characterId', questlineController.deleteCharacter.bind(questlineController));

// ── Chapters ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /questlines/{id}/chapters:
 *   get:
 *     summary: Get chapters for a questline
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of chapters
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Chapter'
 */
questlineRouter.get('/:id/chapters', questlineController.getChapters.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/chapters:
 *   post:
 *     summary: Add a chapter to a questline (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Chapter'
 *     responses:
 *       201:
 *         description: Chapter created
 *       403:
 *         description: Forbidden
 */
questlineRouter.post('/:id/chapters', questlineController.createChapter.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/chapters/{chapterId}:
 *   put:
 *     summary: Update a chapter (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Chapter'
 *     responses:
 *       200:
 *         description: Updated chapter
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.put('/:id/chapters/:chapterId', questlineController.updateChapter.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/chapters/{chapterId}:
 *   delete:
 *     summary: Delete a chapter (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.delete('/:id/chapters/:chapterId', questlineController.deleteChapter.bind(questlineController));

// ── Rewards ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /questlines/{id}/rewards:
 *   get:
 *     summary: Get rewards for a questline
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of rewards
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reward'
 */
questlineRouter.get('/:id/rewards', questlineController.getRewards.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/rewards:
 *   post:
 *     summary: Add a reward to a questline (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Reward'
 *     responses:
 *       201:
 *         description: Reward created
 *       403:
 *         description: Forbidden
 */
questlineRouter.post('/:id/rewards', questlineController.createReward.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/rewards/{rewardId}:
 *   put:
 *     summary: Update a reward (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rewardId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Reward'
 *     responses:
 *       200:
 *         description: Updated reward
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.put('/:id/rewards/:rewardId', questlineController.updateReward.bind(questlineController));

/**
 * @swagger
 * /questlines/{id}/rewards/{rewardId}:
 *   delete:
 *     summary: Delete a reward (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: rewardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
questlineRouter.delete('/:id/rewards/:rewardId', questlineController.deleteReward.bind(questlineController));

// ── Quest summaries (node titles / variants list) ───────────────────────────

/**
 * @swagger
 * /questlines/{id}/quests:
 *   get:
 *     summary: Get quest node summaries (id, title, variant) for a questline
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of quest summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   variant:
 *                     type: string
 */
questlineRouter.get('/:id/quests', questlineController.getQuestSummaries.bind(questlineController));

export default questlineRouter;
