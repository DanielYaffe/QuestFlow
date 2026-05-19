import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import QuestlineModel, { IQuestline } from '../models/questlineModel';

export type QuestlineRequest = AuthRequest & { questline?: IQuestline };

export async function requireQuestlineOwnership(
  req: QuestlineRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?._id;
  const { id } = req.params;

  try {
    const questline = await QuestlineModel.findById(id);
    if (!questline) {
      res.status(404).json({ error: 'Questline not found' });
      return;
    }
    if (questline.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    req.questline = questline;
    next();
  } catch {
    res.status(500).json({ error: 'Failed to load questline' });
  }
}
