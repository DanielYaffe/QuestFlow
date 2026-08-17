import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import UserModel from '../models/userModel';
import ProjectModel from '../models/projectModel';
import { encrypt, decrypt } from '../utils/encryption';
import { verifyRepoAccess } from '../services/githubService';

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

    if (token) {
      try {
        user.gitSettings.encryptedToken = encrypt(token);
      } catch {
        res.status(400).json({ error: 'Could not encrypt GitHub token. Check ENCRYPTION_KEY.' });
        return;
      }
    }
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

// POST /users/me/git-settings/test — verify a token + repo (+ optional branch)
// without writing. Uses the token from the body when supplied, otherwise the
// saved one, so the user can test before saving a new token.
export async function testGitConnection(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  const { token: bodyToken, repoOwner, repoName, branch, projectId, gitTargetId } = req.body as {
    token?: string;
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    projectId?: string;
    gitTargetId?: string;
  };

  const owner = repoOwner?.trim();
  const repo = repoName?.trim();
  if (!owner || !repo) {
    res.status(400).json({ error: 'Repository owner and name are required.' });
    return;
  }

  try {
    let token = bodyToken?.trim();
    if (!token) {
      const user = await UserModel.findById(userId).select('gitSettings');
      if (projectId && gitTargetId) {
        const project = await ProjectModel.findOne({ _id: projectId, ownerId: userId }).select('gitTargets');
        const target = project?.gitTargets?.find((item) => item.id === gitTargetId);
        if (target?.encryptedToken) {
          token = decrypt(target.encryptedToken);
        }
      }
      if (!token && user?.gitSettings?.encryptedToken) {
        token = decrypt(user.gitSettings.encryptedToken);
      }
      if (!token) {
        res.status(400).json({ error: 'No GitHub token saved. Add one to this target or above first.' });
        return;
      }
    }

    await verifyRepoAccess({ token, owner, repo, branch: branch?.trim() || undefined });
    res.json({ ok: true, message: `Connected to ${owner}/${repo}${branch ? ` (${branch})` : ''}.` });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Connection failed' });
  }
}
