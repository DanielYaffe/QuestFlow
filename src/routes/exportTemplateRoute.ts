import { Router } from 'express';
import { getAll, create, deleteTemplate } from '../controllers/exportTemplateController';

const exportTemplateRouter = Router();

/**
 * @swagger
 * tags:
 *   name: ExportTemplates
 *   description: Export template management
 */

/**
 * @swagger
 * /export-templates:
 *   get:
 *     summary: Get all export templates
 *     tags: [ExportTemplates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of export templates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExportTemplate'
 */
exportTemplateRouter.get('/', getAll);

/**
 * @swagger
 * /export-templates:
 *   post:
 *     summary: Create a new export template
 *     tags: [ExportTemplates]
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
 *               - content
 *             properties:
 *               name:
 *                 type: string
 *                 example: My Template
 *               content:
 *                 type: string
 *                 example: "# {{title}}\n\n{{description}}"
 *     responses:
 *       201:
 *         description: Template created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExportTemplate'
 *       400:
 *         description: Invalid input
 */
exportTemplateRouter.post('/', create);

/**
 * @swagger
 * /export-templates/{id}:
 *   delete:
 *     summary: Delete an export template
 *     tags: [ExportTemplates]
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
 *       404:
 *         description: Not found
 */
exportTemplateRouter.delete('/:id', deleteTemplate);

export default exportTemplateRouter;
