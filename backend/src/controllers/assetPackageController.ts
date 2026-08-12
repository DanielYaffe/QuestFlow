import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import ProjectModel from '../models/projectModel';
import UserModel from '../models/userModel';
import { GitHubHttpError, pushFiles } from '../services/githubService';
import {
  buildGenericAssetPackage,
  buildGenericAssetPackageZip,
  GenericAssetPackageMode,
  listGenericAssetPackageStatuses,
} from '../services/assetPackageService';
import { decrypt } from '../utils/encryption';

function unauthorized(res: Response): void {
  res.status(401).json({ error: 'Unauthorized' });
}

function parseStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parsePackageMode(value: unknown): GenericAssetPackageMode | undefined {
  return value === 'changed-only' || value === 'full-snapshot' ? value : undefined;
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeAssetPackageBaseDir(value: string): string {
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return 'tools/input/questflow-assets';
  if (!/\.json$/i.test(trimmed)) return trimmed;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts[parts.length - 1] === 'questflow-maple-build.json') return 'tools/input/questflow-assets';
  parts.pop();
  return parts.join('/') || 'tools/input/questflow-assets';
}

function statusFromGitHubError(status: number): number {
  const statusMap: Record<number, number> = { 401: 400, 403: 403, 404: 404, 409: 409, 502: 502 };
  return statusMap[status] ?? 502;
}

export async function buildPackage(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : '';
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  try {
    res.json(await buildGenericAssetPackage({
      ownerId,
      projectId,
      mode: parsePackageMode(req.body?.mode ?? req.query.mode),
      assetTypes: parseStringList(req.body?.assetTypes ?? req.query.assetTypes),
      characterIds: parseStringList(req.body?.characterIds ?? req.query.characterIds),
      itemIds: parseStringList(req.body?.itemIds ?? req.query.itemIds),
      markExported: parseBoolean(req.body?.markExported ?? req.query.markExported),
    }));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build asset package' });
  }
}

export async function downloadPackage(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : '';
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  try {
    const pkg = await buildGenericAssetPackage({
      ownerId,
      projectId,
      mode: parsePackageMode(req.body?.mode ?? req.query.mode),
      assetTypes: parseStringList(req.body?.assetTypes ?? req.query.assetTypes),
      characterIds: parseStringList(req.body?.characterIds ?? req.query.characterIds),
      itemIds: parseStringList(req.body?.itemIds ?? req.query.itemIds),
      markExported: parseBoolean(req.body?.markExported ?? req.query.markExported),
    });
    const archive = buildGenericAssetPackageZip(pkg);
    const filename = `${pkg.manifest.projectName.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'project'}-asset-package.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(archive);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to download asset package' });
  }
}

export async function pushPackageToGithub(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : '';
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  try {
    const [user, project] = await Promise.all([
      UserModel.findById(ownerId).select('gitSettings'),
      ProjectModel.findOne({ _id: projectId, ownerId }).select('name git'),
    ]);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (!user?.gitSettings?.encryptedToken) {
      res.status(400).json({ error: 'No GitHub token saved. Go to Settings to add one.' });
      return;
    }

    const userGit = user.gitSettings;
    const projectGit = project.git;
    const repoOwner = parseString(req.body?.repoOwner) ?? projectGit?.repoOwner ?? userGit.repoOwner ?? '';
    const repoName = parseString(req.body?.repoName) ?? projectGit?.repoName ?? userGit.repoName ?? '';
    const branch = parseString(req.body?.branch) ?? projectGit?.defaultBranch ?? userGit.defaultBranch ?? 'main';
    const baseDir = normalizeAssetPackageBaseDir(parseString(req.body?.filePath) ?? 'tools/input/questflow-assets');

    if (!repoOwner || !repoName) {
      res.status(400).json({ error: 'Repository owner and name are required.' });
      return;
    }

    let token: string;
    try {
      token = decrypt(userGit.encryptedToken!);
    } catch {
      res.status(400).json({ error: 'Saved GitHub token could not be read - re-enter it in Settings.' });
      return;
    }

    const buildInput = {
      ownerId,
      projectId,
      mode: parsePackageMode(req.body?.mode),
      assetTypes: parseStringList(req.body?.assetTypes),
      characterIds: parseStringList(req.body?.characterIds),
      itemIds: parseStringList(req.body?.itemIds),
    };
    const pkg = await buildGenericAssetPackage(buildInput);

    if ((buildInput.mode ?? 'changed-only') === 'changed-only' && pkg.manifest.assets.length === 0) {
      res.json({
        message: 'No changed assets to export.',
        paths: [],
        manifest: pkg.manifest,
      });
      return;
    }

    const commitMessage = parseString(req.body?.commitMessage) ?? `Update QuestFlow asset package for ${project.name}`;
    const paths = await pushFiles({
      token,
      owner: repoOwner,
      repo: repoName,
      branch,
      commitMessage,
      files: pkg.files.map((file) => ({
        filePath: [baseDir, file.path].filter(Boolean).join('/'),
        content: file.content,
      })),
    });

    await buildGenericAssetPackage({ ...buildInput, markExported: true });

    res.json({
      message: `Exported ${pkg.manifest.assets.length} asset(s) to ${repoOwner}/${repoName} -> ${branch}`,
      paths,
      manifest: pkg.manifest,
    });
  } catch (error) {
    if (error instanceof GitHubHttpError) {
      res.status(statusFromGitHubError(error.status)).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to export asset package' });
  }
}

export async function listStatuses(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : '';
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  try {
    res.json(await listGenericAssetPackageStatuses({
      ownerId,
      projectId,
      assetTypes: parseStringList(req.query.assetTypes),
    }));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list asset package statuses' });
  }
}
