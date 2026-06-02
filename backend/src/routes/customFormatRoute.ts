import { Router, RequestHandler } from 'express';
import { list, create, remove, previewSample } from '../controllers/customFormatController';

const customFormatRouter = Router();

/**
 * @swagger
 * tags:
 *   name: CustomFormats
 *   description: User-defined export formats
 */

// GET /custom-formats — list the authenticated user's formats
customFormatRouter.get('/', list as RequestHandler);

// POST /custom-formats — create a new format
customFormatRouter.post('/', create as RequestHandler);

// POST /custom-formats/preview-sample — render a draft against a synthetic quest
customFormatRouter.post('/preview-sample', previewSample as RequestHandler);

// DELETE /custom-formats/:id — delete a format
customFormatRouter.delete('/:id', remove as RequestHandler);

export default customFormatRouter;
