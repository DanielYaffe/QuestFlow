import { Response } from 'express';
import { z } from 'zod';
import { exportQuestline, zipFiles, Format } from '../services/questExport';
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
    res.json({ filename: result.filename, files: result.files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
}

// POST /questlines/:id/export  { format, paths }
export async function downloadExport(req: QuestlineRequest, res: Response): Promise<void> {
  const { format: rawFormat, paths } = req.body as { format: unknown; paths?: string[] };
  const format = parseFormat(rawFormat);
  if (!format) {
    res.status(400).json({ error: `Invalid format. Must be one of: ${formatSchema.options.join(', ')}` });
    return;
  }
  try {
    const result = await exportQuestline(String(req.params.id), format);
    const chosen = Array.isArray(paths) && paths.length > 0
      ? result.files.filter((f) => paths.includes(f.path))
      : result.files;
    const { zipBuffer, filename } = await zipFiles(chosen, result.filename);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
}

// POST /questlines/:id/push-to-github
export async function pushToGithub(req: QuestlineRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  const {
    format,
    paths,
    repoOwner: bodyOwner,
    repoName: bodyRepo,
    branch: bodyBranch,
    filePath: bodyFilePath,
    commitMessage,
  } = req.body as {
    format: string;
    paths?: string[];
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
    const owner  = (bodyOwner  ?? g.repoOwner    ?? '').trim();
    const repo   = (bodyRepo   ?? g.repoName     ?? '').trim();
    const branch = (bodyBranch ?? g.defaultBranch ?? 'main').trim();

    if (!owner || !repo) {
      res.status(400).json({ error: 'Repository owner and name are required.' });
      return;
    }

    const { files: allFiles } = await exportQuestline(String(req.params.id), parsedFormat);
    const files = Array.isArray(paths) && paths.length > 0
      ? allFiles.filter((f) => paths.includes(f.path))
      : allFiles;

    const baseDir = (bodyFilePath ?? g.defaultFilePath ?? '').replace(/^\/+|\/+$/g, '');
    const token = decrypt(g.encryptedToken!);
    const message = commitMessage ?? `Update ${req.questline?.title ?? 'quest'}`;

    for (const file of files) {
      const filePath = baseDir ? `${baseDir}/${file.path}` : file.path;
      await pushFile({ token, owner, repo, branch, filePath, content: file.content, commitMessage: message });
    }

    res.json({ message: `Pushed ${files.length} file${files.length === 1 ? '' : 's'} to ${owner}/${repo} → ${branch}` });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? 'Push failed' });
  }
}
