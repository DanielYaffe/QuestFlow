import { Router } from 'express';
import { exportDownload, pushToGithub } from '../controllers/questExportController';

const questExportRouter = Router();

/**
 * @swagger
 * /questlines/{id}/export:
 *   get:
 *     summary: Export a questline as a file
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [questflow-json, questflow-yaml, unity-asset, unreal-datatable, godot-tres]
 *     responses:
 *       200:
 *         description: Export result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 filename:
 *                   type: string
 *                 content:
 *                   type: string
 *                 mimeType:
 *                   type: string
 *       400:
 *         description: Invalid format
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Questline not found
 */
questExportRouter.get('/:id/export', exportDownload);

/**
 * @swagger
 * /questlines/{id}/push-to-github:
 *   post:
 *     summary: Push a questline export to a GitHub repository
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
 *               - format
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [questflow-json, questflow-yaml, unity-asset, unreal-datatable, godot-tres]
 *               repoOwner:
 *                 type: string
 *               repoName:
 *                 type: string
 *               branch:
 *                 type: string
 *               filePath:
 *                 type: string
 *                 description: Directory path inside the repo (filename is appended automatically)
 *               commitMessage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully pushed
 *       400:
 *         description: Missing token or invalid input
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Questline not found
 *       500:
 *         description: GitHub API error
 */
questExportRouter.post('/:id/push-to-github', pushToGithub);

export default questExportRouter;
