import { Router } from 'express';
import { generateObjectives, generateCharacters, generateQuestline } from '../controllers/questGenerationController';

const questGenerationRouter = Router();

/**
 * @swagger
 * tags:
 *   name: QuestGeneration
 *   description: AI-powered quest content generation
 */

/**
 * @swagger
 * /quests/generate:
 *   post:
 *     summary: Generate quest objectives and rewards from a story premise using Gemini AI
 *     tags: [QuestGeneration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - story
 *               - genre
 *             properties:
 *               story:
 *                 type: string
 *                 description: The story premise or general storyline
 *               genre:
 *                 type: string
 *                 description: The game genre (e.g. fantasy, sci-fi, horror)
 *     responses:
 *       200:
 *         description: Generated objectives and rewards
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 objectives:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                 rewards:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       rarity:
 *                         type: string
 *                         enum: [common, rare, epic]
 *       400:
 *         description: Missing story or genre
 *       500:
 *         description: Gemini API error
 */
questGenerationRouter.post('/generate', generateObjectives);
questGenerationRouter.post('/generate-characters', generateCharacters);
questGenerationRouter.post('/generate-questline', generateQuestline);

export default questGenerationRouter;
