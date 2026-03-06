import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import QuestStyleModel from '../models/questStyleModel';
import { getPresignedUrl } from '../utils/s3Helper';

// ---------------------------------------------------------------------------
// GET /quest-styles — list all built-in styles with fresh presigned image URLs
// ---------------------------------------------------------------------------

export async function getQuestStyles(req: AuthRequest, res: Response) {
  try {
    const styles = await QuestStyleModel.find({ isBuiltIn: true }).sort({ tier: 1, name: 1 }).lean();

    const results = await Promise.all(
      styles.map(async (s) => ({
        _id:          s._id.toString(),
        name:         s.name,
        engine:       s.engine,
        description:  s.description,
        promptSuffix: s.promptSuffix,
        tier:         s.tier,
        imageUrl:     s.imageKey ? await getPresignedUrl(s.imageKey).catch(() => '') : '',
      })),
    );

    res.json(results);
  } catch (error) {
    console.error('[questStyleController] getQuestStyles error:', error);
    res.status(500).json({ error: 'Failed to fetch quest styles' });
  }
}
