import { Router } from 'express';
import characterController from '../controllers/characterController';

const characterRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Characters
 *   description: Unified character (npc/monster) management API
 */

/**
 * @swagger
 * /characters:
 *   get:
 *     summary: List characters owned by the user (filterable by project/kind)
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: kind
 *         schema:
 *           type: string
 *           enum: [npc, monster]
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
characterRouter.get('/', characterController.get.bind(characterController));

/**
 * @swagger
 * /characters/{id}:
 *   get:
 *     summary: Get a character by id (owner only)
 *     tags: [Characters]
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
 *         description: The character
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
characterRouter.get('/:id', characterController.getById.bind(characterController));

/**
 * @swagger
 * /characters/{id}/usage:
 *   get:
 *     summary: Count quest nodes referencing this character (owner only)
 *     tags: [Characters]
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
 *         description: Usage counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nodeCount:      { type: integer }
 *                 questlineCount: { type: integer }
 */
characterRouter.get('/:id/usage', characterController.usage.bind(characterController));

/**
 * @swagger
 * /characters:
 *   post:
 *     summary: Create a character
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Character'
 *     responses:
 *       201:
 *         description: Character created
 */
characterRouter.post('/', characterController.create.bind(characterController));

/**
 * @swagger
 * /characters/{id}:
 *   put:
 *     summary: Update a character (owner only)
 *     tags: [Characters]
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
 *       200:
 *         description: Updated character
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
characterRouter.put('/:id', characterController.put.bind(characterController));

// Design-studio operations
characterRouter.post('/:id/rotations', characterController.rotations.bind(characterController));
characterRouter.post('/:id/rotations/export', characterController.rotationsExport.bind(characterController));
characterRouter.post('/:id/publish-kb', characterController.publishKb.bind(characterController));
characterRouter.post('/:id/sprite/transform', characterController.spriteTransform.bind(characterController));
characterRouter.post('/:id/sprite/attach', characterController.spriteAttach.bind(characterController));
characterRouter.post('/:id/sprite/version', characterController.spriteVersion.bind(characterController));

/**
 * @swagger
 * /characters/{id}:
 *   delete:
 *     summary: Delete a character (owner only)
 *     tags: [Characters]
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
characterRouter.delete('/:id', characterController.delete.bind(characterController));

export default characterRouter;
