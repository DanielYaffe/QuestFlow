import { Router } from 'express';
import { getAll, create, deleteTemplate } from '../controllers/exportTemplateController';

const exportTemplateRouter = Router();

exportTemplateRouter.get('/', getAll);
exportTemplateRouter.post('/', create);
exportTemplateRouter.delete('/:id', deleteTemplate);

export default exportTemplateRouter;
