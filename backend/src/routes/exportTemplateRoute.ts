import { Router } from 'express';
import {
  analyzeExportTemplate,
  createExportTemplate,
  deleteExportTemplate,
  listExportTemplates,
  updateExportTemplate,
} from '../controllers/exportTemplateController';

const exportTemplateRouter = Router();

exportTemplateRouter.get('/', listExportTemplates);
exportTemplateRouter.post('/', createExportTemplate);
exportTemplateRouter.post('/:id/analyze', analyzeExportTemplate);
exportTemplateRouter.put('/:id', updateExportTemplate);
exportTemplateRouter.delete('/:id', deleteExportTemplate);

export default exportTemplateRouter;
