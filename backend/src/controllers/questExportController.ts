import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { exportQuestline, Format } from '../services/questExport';
import { pushFile } from '../services/githubService';
import UserModel from '../models/userModel';
import QuestlineModel from '../models/questlineModel';
import { decrypt } from '../utils/encryption';

const VALID_FORMATS = new Set<Format>([
  'questflow-json',
  'questflow-yaml',
  'unity-asset',
  'unreal-datatable',
  'godot-tres',
]);

export async function exportDownload(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const format = req.query.format as string;

  if (!VALID_FORMATS.has(format as Format)) {
    res.status(400).json({ error: `Invalid format. Valid values: ${[...VALID_FORMATS].join(', ')}` });
    return;
  }

  try {
    const questline = await QuestlineModel.findById(id).select('ownerId');
    if (!questline) {
      res.status(404).json({ error: 'Questline not found' });
      return;
    }
    if (questline.ownerId !== req.user?._id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const result = await exportQuestline(id, format as Format);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
}

export async function pushToGithub(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  const { id } = req.params;
  const {
    format,
    repoOwner: bodyOwner,
    repoName: bodyRepo,
    branch: bodyBranch,
    filePath: bodyFilePath,
    commitMessage,
  } = req.body as {
    format: string;
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    filePath?: string;
    commitMessage?: string;
  };

  if (!VALID_FORMATS.has(format as Format)) {
    res.status(400).json({ error: `Invalid format. Valid values: ${[...VALID_FORMATS].join(', ')}` });
    return;
  }

  try {
    const [questline, user] = await Promise.all([
      QuestlineModel.findById(id).select('ownerId title'),
      UserModel.findById(userId).select('gitSettings'),
    ]);

    if (!questline) {
      res.status(404).json({ error: 'Questline not found' });
      return;
    }
    if (questline.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (!user?.gitSettings?.encryptedToken) {
      res.status(400).json({ error: 'No GitHub token saved. Go to Settings to add one.' });
      return;
    }

    const g = user.gitSettings;
    const owner  = bodyOwner    ?? g.repoOwner    ?? '';
    const repo   = bodyRepo     ?? g.repoName     ?? '';
    const branch = bodyBranch   ?? g.defaultBranch ?? 'main';

    if (!owner || !repo) {
      res.status(400).json({ error: 'Repository owner and name are required.' });
      return;
    }

    const { filename, content } = await exportQuestline(id, format as Format);
    const filePath = bodyFilePath
      ? `${bodyFilePath.replace(/\/$/, '')}/${filename}`
      : (g.defaultFilePath ? `${g.defaultFilePath.replace(/\/$/, '')}/${filename}` : filename);

    const token = decrypt(g.encryptedToken);

    await pushFile({
      token,
      owner,
      repo,
      branch,
      filePath,
      content,
      commitMessage: commitMessage ?? `Update ${questline.title}`,
    });

    res.json({ message: `Pushed ${filename} to ${owner}/${repo}@${branch}` });
  } catch (error: any) {
    const msg = error?.message ?? 'Push failed';
    res.status(500).json({ error: msg });
  }
}
