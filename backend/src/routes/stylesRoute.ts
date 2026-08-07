import { Router, Request, Response } from 'express';
import SpriteStyleModel from '../models/spriteStyleModel';
import { isStyleRunnable } from '../services/generation/styleAvailability';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // isActive is the admin's intent; runnability comes from the manifest.
    // Offering a style whose checkpoint or LoRA is not in any deployed image
    // just buys the user a failed job.
    const styles = (await SpriteStyleModel.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean())
      .filter(isStyleRunnable);

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