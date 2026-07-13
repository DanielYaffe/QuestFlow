import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import UserModel from '../models/userModel';
import { encrypt, decrypt } from '../utils/encryption';

export async function getGitSettings(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  try {
    const user = await UserModel.findById(userId).select('gitSettings');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const g = user.gitSettings ?? {};
    res.json({
      hasToken:        !!g.encryptedToken,
      repoOwner:       g.repoOwner       ?? '',
      repoName:        g.repoName        ?? '',
      defaultBranch:   g.defaultBranch   ?? 'main',
      defaultFilePath: g.defaultFilePath ?? '',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch git settings' });
  }
}

export async function updateGitSettings(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  const { token, repoOwner, repoName, defaultBranch, defaultFilePath } = req.body as {
    token?: string;
    repoOwner?: string;
    repoName?: string;
    defaultBranch?: string;
    defaultFilePath?: string;
  };

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.gitSettings) user.gitSettings = {};

    if (token) user.gitSettings.encryptedToken = encrypt(token);
    if (repoOwner       !== undefined) user.gitSettings.repoOwner       = repoOwner;
    if (repoName        !== undefined) user.gitSettings.repoName        = repoName;
    if (defaultBranch   !== undefined) user.gitSettings.defaultBranch   = defaultBranch;
    if (defaultFilePath !== undefined) user.gitSettings.defaultFilePath = defaultFilePath;

    user.markModified('gitSettings');
    await user.save();

    const g = user.gitSettings;
    res.json({
      hasToken:        !!g.encryptedToken,
      repoOwner:       g.repoOwner       ?? '',
      repoName:        g.repoName        ?? '',
      defaultBranch:   g.defaultBranch   ?? 'main',
      defaultFilePath: g.defaultFilePath ?? '',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update git settings' });
  }
}
