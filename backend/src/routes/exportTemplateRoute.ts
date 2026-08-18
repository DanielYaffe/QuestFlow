import { Router } from 'express';
import {
  analyzeExportTemplate,
  createExportTemplate,
  deleteExportTemplate,
  listExportTemplates,
  saveRequiredFieldPaths,
  updateExportTemplate,
} from '../controllers/exportTemplateController';
import {
  analyzeTemplateKbMappings,
  deleteTemplateKbMappings,
  listTemplateKbMappings,
  saveTemplateKbMappings,
} from '../controllers/templateKbMappingController';

const exportTemplateRouter = Router();

exportTemplateRouter.get('/', listExportTemplates);
exportTemplateRouter.post('/', createExportTemplate);
exportTemplateRouter.post('/:id/analyze', analyzeExportTemplate);
exportTemplateRouter.get('/:id/kb-mappings', listTemplateKbMappings);
exportTemplateRouter.post('/:id/kb-mappings/analyze', analyzeTemplateKbMappings);
exportTemplateRouter.put('/:id/kb-mappings', saveTemplateKbMappings);
exportTemplateRouter.delete('/:id/kb-mappings', deleteTemplateKbMappings);
exportTemplateRouter.put('/:id/required-fields', saveRequiredFieldPaths);
exportTemplateRouter.put('/:id', updateExportTemplate);
exportTemplateRouter.delete('/:id', deleteExportTemplate);

export default exportTemplateRouter;
