import { Router } from 'express';
import itemController from '../controllers/itemController';

// Item designs (Design Studio). See itemController for endpoint docs.
const itemRouter = Router();

itemRouter.get('/', itemController.list.bind(itemController));
itemRouter.get('/:id', itemController.getById.bind(itemController));
itemRouter.get('/:id/usage', itemController.usage.bind(itemController));
itemRouter.post('/', itemController.create.bind(itemController));
itemRouter.put('/:id', itemController.update.bind(itemController));
itemRouter.delete('/:id', itemController.delete.bind(itemController));
itemRouter.post('/:id/sprite/attach', itemController.spriteAttach.bind(itemController));
itemRouter.post('/:id/sprite/transform', itemController.spriteTransform.bind(itemController));
itemRouter.post('/:id/sprite/version', itemController.spriteVersion.bind(itemController));
itemRouter.post('/:id/publish-kb', itemController.publishKb.bind(itemController));

export default itemRouter;
