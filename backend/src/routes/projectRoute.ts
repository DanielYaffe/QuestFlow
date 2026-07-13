import { Router } from 'express';
import projectController from '../controllers/projectController';

const projectRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Project management API — a project groups questlines, sprites and characters
 */

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: List projects owned by the authenticated user (with counts)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 */
projectRouter.get('/', projectController.get.bind(projectController));

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: Get a project by id (owner only)
 *     tags: [Projects]
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
 *         description: The project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
projectRouter.get('/:id', projectController.getById.bind(projectController));

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
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
 *               description:
 *                 type: string
 *               defaultThemeId:
 *                 type: string
 *               defaultExportFormat:
 *                 type: string
 *     responses:
 *       201:
 *         description: Project created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 */
projectRouter.post('/', projectController.create.bind(projectController));

/**
 * @swagger
 * /projects/{id}:
 *   put:
 *     summary: Update a project (owner only)
 *     tags: [Projects]
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               defaultThemeId:
 *                 type: string
 *               defaultExportFormat:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated project
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
projectRouter.put('/:id', projectController.put.bind(projectController));

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     summary: Delete a project (owner only). Inbox cannot be deleted; its contents move to Inbox.
 *     tags: [Projects]
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
 *       400:
 *         description: Cannot delete the Inbox project
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
projectRouter.delete('/:id', projectController.delete.bind(projectController));

/**
 * @swagger
 * /projects/{id}/duplicate:
 *   post:
 *     summary: Duplicate a project and all its content (owner only)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Duplicated project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
projectRouter.post('/:id/duplicate', projectController.duplicate.bind(projectController));

export default projectRouter;
