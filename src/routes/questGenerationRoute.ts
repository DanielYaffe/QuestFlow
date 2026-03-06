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

/**
 * @swagger
 * /quests/generate-characters:
 *   post:
 *     summary: Generate NPC characters from a story premise using Gemini AI
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
 *               genre:
 *                 type: string
 *     responses:
 *       200:
 *         description: Generated characters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characters:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       appearance:
 *                         type: string
 *                       background:
 *                         type: string
 *       400:
 *         description: Missing story or genre
 *       500:
 *         description: Gemini API error
 */
questGenerationRouter.post('/generate-characters', generateCharacters);

/**
 * @swagger
 * /quests/generate-questline:
 *   post:
 *     summary: Generate a full questline structure from a story premise using Gemini AI
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
 *               genre:
 *                 type: string
 *               styleId:
 *                 type: string
 *                 description: Optional quest style ID to tailor the output
 *     responses:
 *       200:
 *         description: Generated questline with nodes and edges
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
 *       400:
 *         description: Missing story or genre
 *       500:
 *         description: Gemini API error
 */
questGenerationRouter.post('/generate-questline', generateQuestline);

export default questGenerationRouter;
