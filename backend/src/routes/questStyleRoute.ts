import { Router } from 'express';
import { getQuestStyles } from '../controllers/questStyleController';

const questStyleRouter = Router();

/**
 * @swagger
 * tags:
 *   name: QuestStyles
 *   description: Quest style presets for generation
 */

/**
 * @swagger
 * /quest-styles:
 *   get:
 *     summary: Get all available quest styles
 *     tags: [QuestStyles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of quest styles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/QuestStyle'
 */
questStyleRouter.get('/', getQuestStyles);

export default questStyleRouter;
