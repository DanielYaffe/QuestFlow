import { Router } from 'express';
import {
  listAnimations,
  getAnimation,
  generateAnimation,
  regenerateAnimation,
  editAnimation,
  updateAnimation,
  deleteAnimation,
  exportAnimation,
} from '../controllers/animationController';

// Sprite animations (PixelLab-backed). Job progress streams over the generic
// /jobs/animation-generation/:jobId/stream SSE endpoint.
const animationRouter = Router();

animationRouter.get('/', listAnimations);
animationRouter.post('/generate', generateAnimation);
animationRouter.get('/:id', getAnimation);
animationRouter.post('/:id/regenerate', regenerateAnimation);
animationRouter.post('/:id/edit', editAnimation);
animationRouter.put('/:id', updateAnimation);
animationRouter.delete('/:id', deleteAnimation);
animationRouter.post('/:id/export', exportAnimation);

export default animationRouter;
