import { Router } from 'express';
import { requireAdmin } from '../middlewares/authMiddleware';
import * as admin from '../controllers/adminController';

// Mounted at /admin, after the global authenticate middleware
const adminRouter = Router();
adminRouter.use(requireAdmin);

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin-only management of sprite styles, checkpoints and LoRAs
 */

// Workflow presets (read-only catalog used by the style editor)
adminRouter.get('/workflow-presets', admin.getWorkflowPresets);

// Sprite styles
adminRouter.get('/styles', admin.getStyles);
adminRouter.post('/styles', admin.createStyle);
adminRouter.post('/styles/reorder', admin.reorderStyles);
adminRouter.put('/styles/:styleId', admin.updateStyle);
adminRouter.post('/styles/:styleId/default', admin.setDefaultStyle);
adminRouter.delete('/styles/:styleId', admin.deleteStyle);

// Checkpoint registry
adminRouter.get('/checkpoints', admin.getCheckpoints);
adminRouter.post('/checkpoints', admin.createCheckpoint);
adminRouter.put('/checkpoints/:filename', admin.updateCheckpoint);
adminRouter.delete('/checkpoints/:filename', admin.deleteCheckpoint);

// LoRA registry
adminRouter.get('/loras', admin.getLoras);
adminRouter.post('/loras', admin.createLora);
adminRouter.put('/loras/:filename', admin.updateLora);
adminRouter.delete('/loras/:filename', admin.deleteLora);

// User role management (ADMIN_EMAILS only bootstraps the first admin)
adminRouter.get('/users', admin.getUsers);
adminRouter.put('/users/:userId/role', admin.setUserRole);

// Model files actually installed on the ComfyUI host
adminRouter.get('/comfy/models', admin.getComfyModels);

export default adminRouter;
