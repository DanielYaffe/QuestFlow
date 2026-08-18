import { decrypt } from '../utils/encryption';
import { IGitSettings } from '../models/userModel';
import { IProject, IProjectGitSettings, IProjectGitTarget } from '../models/projectModel';

export type GitExportPurpose = 'quest' | 'asset';

export interface GitTargetInput {
  gitTargetId?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  filePath?: string;
}

export interface ResolvedGitTarget {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  targetName: string;
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function projectTargets(project?: Pick<IProject, 'gitTargets'> | null): IProjectGitTarget[] {
  return Array.isArray(project?.gitTargets) ? project.gitTargets : [];
}

function defaultTargetId(project: Pick<IProject, 'defaultQuestExportTargetId' | 'defaultAssetExportTargetId'>, purpose: GitExportPurpose): string {
  return purpose === 'asset'
    ? project.defaultAssetExportTargetId || ''
    : project.defaultQuestExportTargetId || '';
}

function selectTarget(
  project: Pick<IProject, 'gitTargets' | 'defaultQuestExportTargetId' | 'defaultAssetExportTargetId'>,
  purpose: GitExportPurpose,
  targetId?: string,
): IProjectGitTarget | undefined {
  const targets = projectTargets(project);
  if (targets.length === 0) return undefined;
  const requestedId = trim(targetId);
  const defaultId = defaultTargetId(project, purpose);
  return targets.find((target) => target.id === requestedId)
    ?? targets.find((target) => target.id === defaultId)
    ?? targets[0];
}

function decryptToken(encryptedToken?: string): string | null {
  if (!encryptedToken) return null;
  try {
    return decrypt(encryptedToken);
  } catch {
    throw new Error('Saved GitHub token could not be read - re-enter it in Settings.');
  }
}

export function resolveGitTarget(options: {
  userGit?: IGitSettings;
  project?: Pick<IProject, 'git' | 'gitTargets' | 'defaultQuestExportTargetId' | 'defaultAssetExportTargetId'> | null;
  purpose: GitExportPurpose;
  input?: GitTargetInput;
  fallbackFilePath?: string;
}): ResolvedGitTarget {
  const { userGit, project, purpose, input, fallbackFilePath = '' } = options;
  const target = project ? selectTarget(project, purpose, input?.gitTargetId) : undefined;
  const legacyProjectGit: IProjectGitSettings | undefined = project?.git;

  const owner = trim(input?.repoOwner)
    || trim(target?.repoOwner)
    || trim(legacyProjectGit?.repoOwner)
    || trim(userGit?.repoOwner);
  const repo = trim(input?.repoName)
    || trim(target?.repoName)
    || trim(legacyProjectGit?.repoName)
    || trim(userGit?.repoName);
  const branch = trim(input?.branch)
    || trim(target?.defaultBranch)
    || trim(legacyProjectGit?.defaultBranch)
    || trim(userGit?.defaultBranch)
    || 'main';
  const filePath = trim(input?.filePath)
    || trim(target?.defaultFilePath)
    || trim(legacyProjectGit?.defaultFilePath)
    || trim(userGit?.defaultFilePath)
    || fallbackFilePath;

  if (!owner || !repo) {
    throw new Error('Repository owner and name are required.');
  }

  const token = decryptToken(target?.encryptedToken) ?? decryptToken(userGit?.encryptedToken);
  if (!token) {
    throw new Error('No GitHub token saved. Add one to the selected export target or in Settings.');
  }

  return {
    token,
    owner,
    repo,
    branch,
    filePath,
    targetName: target?.name || `${owner}/${repo}`,
  };
}
