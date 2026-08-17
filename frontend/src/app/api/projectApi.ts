import api from './axiosInstance';
import { MapleProjectSettings } from './mapleAssetApi';

export interface ProjectGitSettings {
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export interface ProjectGitTarget {
  id: string;
  name: string;
  hasToken?: boolean;
  token?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export type AssetFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'object'
  | 'list'
  | 'image'
  | 'enum'
  | 'reference';

export interface ProjectValuePoolOption {
  label: string;
  value: string | number | boolean;
  metadata?: Record<string, unknown>;
}

export interface ProjectValueRange {
  min: number;
  max: number;
}

export interface ProjectValuePool {
  key: string;
  name: string;
  description?: string;
  valueType: 'text' | 'number' | 'boolean';
  options: ProjectValuePoolOption[];
  ranges: ProjectValueRange[];
}

export interface ProjectAssetField {
  key: string;
  label: string;
  type: AssetFieldType;
  required: boolean;
  nullable: boolean;
  description?: string;
  poolKey?: string;
  itemType?: AssetFieldType;
  fields?: ProjectAssetField[];
}

export interface ProjectAssetTypeSchema {
  key: string;
  name: string;
  description?: string;
  fields: ProjectAssetField[];
}

export interface ProjectAssetSchema {
  assetTypes: ProjectAssetTypeSchema[];
  valuePools: ProjectValuePool[];
}
// Unified project shape — superset of both efforts. The multi-project flow uses
// name/description/ownerId; the architecture-phase1 flow adds per-project defaults,
// the Inbox flag, and content counts returned by GET /projects; the export flow
// adds the per-project `git` repository settings.
export interface Project {
  _id: string;
  name: string;
  description: string;
  ownerId?: string;
  defaultThemeId?: string;
  defaultExportFormat?: string;
  gameId?: string; // linked Game whose knowledge base grounds generation ('' = none)
  isInbox?: boolean;
  questlineCount?: number;
  spriteCount?: number;
  characterCount?: number;
  git?: ProjectGitSettings;
  gitTargets?: ProjectGitTarget[];
  defaultQuestExportTargetId?: string;
  defaultAssetExportTargetId?: string;
  assetSchema?: ProjectAssetSchema;
  mapleSettings?: MapleProjectSettings;
  createdAt: string;
  updatedAt: string;
}

// Back-compat alias — architecture-phase1 code referred to this as ProjectRecord.
export type ProjectRecord = Project;

export interface CreateProjectInput {
  name: string;
  description?: string;
  defaultThemeId?: string;
  defaultExportFormat?: string;
  assetSchema?: ProjectAssetSchema;
}

export async function fetchProjects(): Promise<Project[]> {
  const { data } = await api.get<Project[]>('/projects');
  return data;
}

// Alias kept for architecture-phase1 callers (PromoteToCharacterModal, ProjectDashboard).
export const listProjects = fetchProjects;

export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get<Project>(`/projects/${id}`);
  return data;
}

// Accepts either a plain name (multi-project callers) or a full input object
// (architecture-phase1 callers that set per-project defaults).
export async function createProject(
  input: string | CreateProjectInput,
  description = '',
): Promise<Project> {
  const body = typeof input === 'string' ? { name: input, description } : input;
  const { data } = await api.post<Project>('/projects', body);
  return data;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'description' | 'defaultThemeId' | 'defaultExportFormat' | 'gameId' | 'git' | 'gitTargets' | 'defaultQuestExportTargetId' | 'defaultAssetExportTargetId' | 'assetSchema' | 'mapleSettings'>>,
): Promise<Project> {
  const { data } = await api.put<Project>(`/projects/${id}`, patch);
  return data;
}

export async function allocateProjectPoolValue(
  projectId: string,
  input: {
    assetType: string;
    fieldPath: string[];
    assetId?: string;
  },
): Promise<{ value: string | number | boolean; poolKey: string; fieldPath: string }> {
  const { data } = await api.post(`/projects/${projectId}/asset-pools/allocate`, input);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export async function duplicateProject(id: string, name?: string): Promise<Project> {
  const { data } = await api.post<Project>(`/projects/${id}/duplicate`, name ? { name } : {});
  return data;
}

// A reward aggregated across the project's questlines (dashboard Items section).
export interface ProjectReward {
  _id: string;
  title: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
  imageUrl?: string;
  // "{gameId}:{entityName}" when the reward is an existing KB item; '' otherwise.
  kbRef: string;
  questlineId: string;
  questlineTitle: string;
}

export async function fetchProjectRewards(id: string): Promise<ProjectReward[]> {
  const { data } = await api.get<ProjectReward[]>(`/projects/${id}/rewards`);
  return data;
}
