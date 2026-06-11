import { Router } from 'express';
import { getGitSettings, updateGitSettings, testGitConnection } from '../controllers/userSettingsController';

const userSettingsRouter = Router();

/**
 * @swagger
 * tags:
 *   name: UserSettings
 *   description: User settings (git integration)
 */

/**
 * @swagger
 * /users/me/git-settings:
 *   get:
 *     summary: Get the authenticated user's GitHub settings
 *     tags: [UserSettings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Git settings (token is never returned)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasToken:
 *                   type: boolean
 *                 repoOwner:
 *                   type: string
 *                 repoName:
 *                   type: string
 *                 defaultBranch:
 *                   type: string
 *                 defaultFilePath:
 *                   type: string
 */
userSettingsRouter.get('/me/git-settings', getGitSettings);

/**
 * @swagger
 * /users/me/git-settings:
 *   put:
 *     summary: Save the authenticated user's GitHub settings
 *     tags: [UserSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: GitHub personal access token (stored encrypted)
 *               repoOwner:
 *                 type: string
 *               repoName:
 *                 type: string
 *               defaultBranch:
 *                 type: string
 *               defaultFilePath:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated git settings
 */
userSettingsRouter.put('/me/git-settings', updateGitSettings);

/**
 * @swagger
 * /users/me/git-settings/test:
 *   post:
 *     summary: Verify GitHub token + repository access without writing
 *     tags: [UserSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repoOwner
 *               - repoName
 *             properties:
 *               token:
 *                 type: string
 *                 description: Optional token to test; falls back to the saved one
 *               repoOwner:
 *                 type: string
 *               repoName:
 *                 type: string
 *               branch:
 *                 type: string
 *     responses:
 *       200:
 *         description: Connection succeeded
 *       400:
 *         description: Connection failed or invalid input
 */
userSettingsRouter.post('/me/git-settings/test', testGitConnection);

export default userSettingsRouter;
