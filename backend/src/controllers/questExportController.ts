import { Response } from 'express';
import { z } from 'zod';
import { exportQuestline, Format } from '../services/questExport';
import { QuestlineRequest } from '../middlewares/requireQuestlineOwnership';
import { pushFile, GitHubHttpError } from '../services/githubService';
import UserModel from '../models/userModel';
import ProjectModel from '../models/projectModel';
import { resolveGitTarget } from '../services/gitTargetService';

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
    console.error('[questExport] preview failed:', err);
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
    gitTargetId,
    repoOwner: bodyOwner,
    repoName: bodyRepo,
    branch: bodyBranch,
    filePath: bodyFilePath,
    commitMessage,
    templateId,
    nodeIds,
  } = req.body as {
    format: string;
    gitTargetId?: string;
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
    const projectId = req.questline?.projectId;
    const project = projectId
      ? await ProjectModel.findById(projectId).select('git gitTargets defaultQuestExportTargetId defaultAssetExportTargetId')
      : null;

    let destination;
    try {
      destination = resolveGitTarget({
        userGit: user?.gitSettings,
        project,
        purpose: 'quest',
        input: {
          gitTargetId,
          repoOwner: bodyOwner,
          repoName: bodyRepo,
          branch: bodyBranch,
          filePath: bodyFilePath,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid GitHub export target.' });
      return;
    }

    const result = await exportQuestline(String(req.params.id), parsedFormat, {
      templateId,
      nodeIds,
    });
    const baseDir = destination.filePath.replace(/^\/+|\/+$/g, '');
    const questlineFolder = `${slugifySegment(req.questline?.title ?? 'questline')}-${String(req.params.id).slice(-6)}`;
    const files = result.files?.length ? result.files : [{ filename: result.filename, content: result.content }];
    const usedPaths: string[] = [];

    for (const file of files) {
      const usedPath = await pushFile({
        token: destination.token,
        owner: destination.owner,
        repo: destination.repo,
        branch: destination.branch,
        filePath: [baseDir, questlineFolder, file.filename].filter(Boolean).join('/'),
        content: file.content,
        commitMessage: commitMessage ?? `Update ${req.questline?.title ?? 'quest'}`,
      });
      usedPaths.push(usedPath);
    }

    res.json({
      message: `Pushed ${usedPaths.length} file(s) to ${destination.owner}/${destination.repo} -> ${destination.branch}:${questlineFolder}`,
      paths: usedPaths,
    });
  } catch (error) {
    if (error instanceof GitHubHttpError) {
      const statusMap: Record<number, number> = { 401: 400, 403: 403, 404: 404, 409: 409, 502: 502 };
      res.status(statusMap[error.status] ?? 502).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Push failed' });
  }
}
