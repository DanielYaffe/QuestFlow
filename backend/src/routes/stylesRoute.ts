import { Router, Request, Response } from 'express';
import SpriteStyleModel from '../models/spriteStyleModel';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const styles = await SpriteStyleModel.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean();

    const payload = styles.map(({ styleId, name, description, previewImagePath, category, defaultDimensions }) => ({
      id: styleId,
      name,
      description,
      previewImagePath,
      category,
      defaultDimensions,
    }));

    res.json(payload);
  } catch (err) {
    console.error('[stylesRoute] failed to fetch styles:', err);
    res.status(500).json({ error: 'Failed to fetch styles' });
  }
});

export default router;