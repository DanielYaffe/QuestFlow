import { Response } from 'express';
import { z } from 'zod';
import { exportQuestline, Format } from '../services/questExport';
import { QuestlineRequest } from '../middlewares/requireQuestlineOwnership';
import { pushFile } from '../services/githubService';
import UserModel from '../models/userModel';
import { decrypt } from '../utils/encryption';

const formatSchema = z.enum([
  'questflow-json',
  'questflow-yaml',
  'unity-asset',
  'unreal-datatable',
  'godot-tres',
]);

function parseFormat(raw: unknown): Format | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const result = formatSchema.safeParse(value);
  return result.success ? (result.data as Format) : null;
}

// GET /questlines/:id/export/preview?format=
export async function previewExport(req: QuestlineRequest, res: Response): Promise<void> {
  const format = parseFormat(req.query.format);
  if (!format) {
    res.status(400).json({ error: `Invalid format. Must be one of: ${formatSchema.options.join(', ')}` });
    return;
  }
  try {
    const result = await exportQuestline(String(req.params.id), format);
    res.json({ filename: result.filename, content: result.content });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
}

// GET /questlines/:id/export?format=
export async function downloadExport(req: QuestlineRequest, res: Response): Promise<void> {
  const format = parseFormat(req.query.format);
  if (!format) {
    res.status(400).json({ error: `Invalid format. Must be one of: ${formatSchema.options.join(', ')}` });
    return;
  }
  try {
    const result = await exportQuestline(String(req.params.id), format);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Type', result.mimeType);
    res.send(result.content);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
}

// POST /questlines/:id/push-to-github
export async function pushToGithub(req: QuestlineRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
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

  const parsedFormat = parseFormat(format);
  if (!parsedFormat) {
    res.status(400).json({ error: `Invalid format. Must be one of: ${formatSchema.options.join(', ')}` });
    return;
  }

  try {
    const user = await UserModel.findById(userId).select('gitSettings');
    if (!user?.gitSettings?.encryptedToken) {
      res.status(400).json({ error: 'No GitHub token saved. Go to Settings to add one.' });
      return;
    }

    const g = user.gitSettings;
    const owner  = bodyOwner  ?? g.repoOwner    ?? '';
    const repo   = bodyRepo   ?? g.repoName     ?? '';
    const branch = bodyBranch ?? g.defaultBranch ?? 'main';

    if (!owner || !repo) {
      res.status(400).json({ error: 'Repository owner and name are required.' });
      return;
    }

    const { filename, content } = await exportQuestline(String(req.params.id), parsedFormat);
    const baseDir = bodyFilePath ?? g.defaultFilePath ?? '';
    const filePath = baseDir ? `${baseDir.replace(/\/$/, '')}/${filename}` : filename;

    await pushFile({
      token: decrypt(g.encryptedToken),
      owner,
      repo,
      branch,
      filePath,
      content,
      commitMessage: commitMessage ?? `Update ${req.questline?.title ?? 'quest'}`,
    });

    res.json({ message: `Pushed ${filename} to ${owner}/${repo}@${branch}` });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Push failed' });
  }
}
