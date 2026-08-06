import { Response } from 'express';
import { z } from 'zod';
import { exportQuestline, Format } from '../services/questExport';
import { QuestlineRequest } from '../middlewares/requireQuestlineOwnership';
import { pushFile, GitHubHttpError } from '../services/githubService';
import UserModel from '../models/userModel';
import ProjectModel from '../models/projectModel';
import { decrypt } from '../utils/encryption';

const formatSchema = z.enum([
  'questflow-json',
  'questflow-yaml',
  'template-json',
  'template-yaml',
  'template-xml',
]);

function parseFormat(raw: unknown): Format | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const result = formatSchema.safeParse(value);
  return result.success ? (result.data as Format) : null;
}

function parseString(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseNodeIds(raw: unknown): string[] | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.split(',').map((id) => id.trim()).filter(Boolean);
}

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'questline';
}

// GET /questlines/:id/export/preview?format=
export async function previewExport(req: QuestlineRequest, res: Response): Promise<void> {
  const format = parseFormat(req.query.format);
  if (!format) {
    res.status(400).json({ error: `Invalid format. Must be one of: ${formatSchema.options.join(', ')}` });
    return;
  }
  try {
    const result = await exportQuestline(String(req.params.id), format, {
      templateId: parseString(req.query.templateId),
      nodeIds: parseNodeIds(req.query.nodeIds),
    });
    res.json({ filename: result.filename, content: result.content, files: result.files });
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
    const result = await exportQuestline(String(req.params.id), format, {
      templateId: parseString(req.query.templateId),
      nodeIds: parseNodeIds(req.query.nodeIds),
    });
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
    templateId,
    nodeIds,
  } = req.body as {
    format: string;
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    filePath?: string;
    commitMessage?: string;
    templateId?: string;
    nodeIds?: string[];
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

    // Resolve the destination repo from the questline's project first; the
    // user-level gitSettings are kept only as a legacy fallback so pre-existing
    // single-repo setups keep working. Token always comes from the user.
    const g = user.gitSettings;
    const projectId = req.questline?.projectId;
    const project = projectId ? await ProjectModel.findById(projectId).select('git') : null;
    const pg = project?.git;

    const owner  = (bodyOwner  ?? pg?.repoOwner     ?? g.repoOwner    ?? '').trim();
    const repo   = (bodyRepo   ?? pg?.repoName      ?? g.repoName     ?? '').trim();
    const branch = (bodyBranch ?? pg?.defaultBranch ?? g.defaultBranch ?? 'main').trim();

    if (!owner || !repo) {
      res.status(400).json({ error: 'Repository owner and name are required.' });
      return;
    }

    // Decrypt once, up front: a corrupt/legacy token is a user-fixable config
    // problem, not a 500. (decrypt throws on a bad ciphertext or wrong key.)
    let token: string;
    try {
      token = decrypt(g.encryptedToken!);
    } catch {
      res.status(400).json({ error: 'Saved GitHub token could not be read — re-enter it in Settings.' });
      return;
    }

    const result = await exportQuestline(String(req.params.id), parsedFormat, {
      templateId,
      nodeIds,
    });
    // Strip both leading and trailing slashes so a user-supplied path like
    // "/Assets/Quests/" never produces a double-slash in the GitHub API URL.
    const baseDir = (bodyFilePath ?? pg?.defaultFilePath ?? g.defaultFilePath ?? '').replace(/^\/+|\/+$/g, '');
    const questlineFolder = `${slugifySegment(req.questline?.title ?? 'questline')}-${String(req.params.id).slice(-6)}`;
    const files = result.files?.length ? result.files : [{ filename: result.filename, content: result.content }];
    const usedPaths: string[] = [];

    for (const file of files) {
      const usedPath = await pushFile({
        token,
        owner,
        repo,
        branch,
        filePath: [baseDir, questlineFolder, file.filename].filter(Boolean).join('/'),
        content: file.content,
        commitMessage: commitMessage ?? `Update ${req.questline?.title ?? 'quest'}`,
      });
      usedPaths.push(usedPath);
    }

    res.json({ message: `Pushed ${usedPaths.length} file(s) to ${owner}/${repo} → ${branch}:${questlineFolder}`, paths: usedPaths });
  } catch (error) {
    if (error instanceof GitHubHttpError) {
      // Surface GitHub's friendly message with a fitting status. Never emit 401
      // here — the frontend's axios interceptor treats 401 as an app-auth
      // failure and would redirect the user to /login.
      const statusMap: Record<number, number> = { 401: 400, 403: 403, 404: 404, 409: 409, 502: 502 };
      res.status(statusMap[error.status] ?? 502).json({ error: error.message });
      return;
    }
    // Anything else (e.g. an export/serialization failure) is a genuine server error.
    res.status(500).json({ error: error instanceof Error ? error.message : 'Push failed' });
  }
}
