import { Router } from 'express';
import { getGitSettings, updateGitSettings } from '../controllers/userSettingsController';

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

export default userSettingsRouter;
