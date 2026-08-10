import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  allocateMapleId,
  buildMapleAssetPackage,
  checkMapleIdAvailability,
  MapleAssetType,
  MapleExportMode,
} from '../services/mapleAssetService';
import { pushFile, GitHubHttpError } from '../services/githubService';
import ProjectModel from '../models/projectModel';
import UserModel from '../models/userModel';
import { decrypt } from '../utils/encryption';

function unauthorized(res: Response): void {
  res.status(401).json({ error: 'Unauthorized' });
}

function parseAssetType(value: unknown): MapleAssetType | undefined {
  return value === 'npc' || value === 'item' ? value : undefined;
}

function parseExportMode(value: unknown): MapleExportMode | undefined {
  return value === 'changed-only' || value === 'full-snapshot' ? value : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parsePositiveInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function checkIdAvailability(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const assetType = parseAssetType(req.query.assetType ?? req.body?.assetType);
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : req.body?.projectId;
  const mapleId = parsePositiveInt(req.query.mapleId ?? req.body?.mapleId);
  const excludeRecordId = typeof req.query.excludeRecordId === 'string' ? req.query.excludeRecordId : req.body?.excludeRecordId;
  const allowNativePatch = (req.query.allowNativePatch ?? req.body?.allowNativePatch) === 'true'
    || (req.query.allowNativePatch ?? req.body?.allowNativePatch) === true;

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  if (!assetType) {
    res.status(400).json({ error: 'assetType must be npc or item' });
    return;
  }
  if (!mapleId) {
    res.status(400).json({ error: 'mapleId must be a positive integer' });
    return;
  }

  try {
    res.json(await checkMapleIdAvailability({
      ownerId,
      projectId,
      assetType,
      mapleId,
      excludeRecordId,
      allowNativePatch,
    }));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to check Maple ID' });
  }
}

export async function allocateId(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const assetType = parseAssetType(req.query.assetType ?? req.body?.assetType);
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : req.body?.projectId;
  const excludeRecordId = typeof req.query.excludeRecordId === 'string' ? req.query.excludeRecordId : req.body?.excludeRecordId;

  if (!projectId || typeof projectId !== 'string') {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  if (!assetType) {
    res.status(400).json({ error: 'assetType must be npc or item' });
    return;
  }

  try {
    res.json(await allocateMapleId({
      ownerId,
      projectId,
      assetType,
      excludeRecordId,
    }));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to allocate Maple ID' });
  }
}

export async function buildPackage(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : '';
  const mode = parseExportMode(req.body?.mode ?? req.query.mode);
  const baseManifestId = typeof req.body?.baseManifestId === 'string'
    ? req.body.baseManifestId
    : typeof req.query.baseManifestId === 'string'
    ? req.query.baseManifestId
    : undefined;

  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  try {
    const result = await buildMapleAssetPackage({
      ownerId,
      projectId,
      mode,
      baseManifestId,
      npcIds: parseStringList(req.body?.npcIds ?? req.query.npcIds),
      itemIds: parseStringList(req.body?.itemIds ?? req.query.itemIds),
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build Maple asset package' });
  }
}

export async function pushPackageToGithub(req: AuthRequest, res: Response): Promise<void> {
  const ownerId = req.user?._id?.toString();
  if (!ownerId) return unauthorized(res);

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId : '';
  const mode = parseExportMode(req.body?.mode);
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }

  try {
    const user = await UserModel.findById(ownerId).select('gitSettings');
    if (!user?.gitSettings?.encryptedToken) {
      res.status(400).json({ error: 'No GitHub token saved. Go to Settings to add one.' });
      return;
    }

    const project = await ProjectModel.findOne({ _id: projectId, ownerId }).select('name git mapleSettings');
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const userGit = user.gitSettings;
    const projectGit = project.git;
    const repoOwner = parseString(req.body?.repoOwner) ?? projectGit?.repoOwner ?? userGit.repoOwner ?? '';
    const repoName = parseString(req.body?.repoName) ?? projectGit?.repoName ?? userGit.repoName ?? '';
    const branch = parseString(req.body?.branch) ?? projectGit?.defaultBranch ?? userGit.defaultBranch ?? 'main';
    const filePath = (parseString(req.body?.filePath) ?? 'tools/input/questflow-maple-build.json').replace(/^\/+|\/+$/g, '');

    if (!repoOwner || !repoName) {
      res.status(400).json({ error: 'Repository owner and name are required.' });
      return;
    }

    const encryptedToken = userGit.encryptedToken;
    if (!encryptedToken) {
      res.status(400).json({ error: 'No GitHub token saved. Go to Settings to add one.' });
      return;
    }

    let token: string;
    try {
      token = decrypt(encryptedToken);
    } catch {
      res.status(400).json({ error: 'Saved GitHub token could not be read - re-enter it in Settings.' });
      return;
    }

    const pkg = await buildMapleAssetPackage({
      ownerId,
      projectId,
      mode,
      baseManifestId: parseString(req.body?.baseManifestId),
      npcIds: parseStringList(req.body?.npcIds),
      itemIds: parseStringList(req.body?.itemIds),
    });

    const usedPath = await pushFile({
      token,
      owner: repoOwner,
      repo: repoName,
      branch,
      filePath,
      content: JSON.stringify(pkg, null, 2),
      commitMessage: parseString(req.body?.commitMessage) ?? `Update QuestFlow Maple asset package for ${project.name}`,
    });

    res.json({
      message: `Pushed Maple asset package to ${repoOwner}/${repoName} -> ${branch}:${usedPath}`,
      path: usedPath,
      manifest: pkg.manifest,
    });
  } catch (error) {
    if (error instanceof GitHubHttpError) {
      const statusMap: Record<number, number> = { 401: 400, 403: 403, 404: 404, 409: 409, 502: 502 };
      res.status(statusMap[error.status] ?? 502).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to push Maple asset package' });
  }
}
