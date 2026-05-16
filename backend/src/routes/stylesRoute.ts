import { Router, Request, Response } from 'express';
import { STYLES } from '../config/styles';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const payload = STYLES.map(({ id, name, description, previewImagePath, category, defaultDimensions }) => ({
    id,
    name,
    description,
    previewImagePath,
    category,
    defaultDimensions,
  }));
  res.json(payload);
});

export default router;
