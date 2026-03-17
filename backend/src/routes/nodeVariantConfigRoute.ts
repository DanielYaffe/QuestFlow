import { Router } from 'express';
import { getVariantConfigs, upsertVariantConfig } from '../controllers/nodeVariantConfigController';

const nodeVariantConfigRouter = Router();

/**
 * @swagger
 * /variant-configs:
 *   get:
 *     summary: Get all node variant configs (base + AI-created)
 *     tags: [VariantConfigs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of variant configs
 */
nodeVariantConfigRouter.get('/', getVariantConfigs);

/**
 * @swagger
 * /variant-configs:
 *   post:
 *     summary: Create or update a variant config
 *     tags: [VariantConfigs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - label
 *             properties:
 *               key:
 *                 type: string
 *               label:
 *                 type: string
 *               iconKey:
 *                 type: string
 *               borderColor:
 *                 type: string
 *               bgColor:
 *                 type: string
 *               iconColor:
 *                 type: string
 *               shadowColor:
 *                 type: string
 *     responses:
 *       201:
 *         description: Config created or updated
 */
nodeVariantConfigRouter.post('/', upsertVariantConfig);

export default nodeVariantConfigRouter;
