import api from './axiosInstance';
import { ProjectAssetSchema } from './projectApi';

export type GenericAssetPackageMode = 'changed-only' | 'full-snapshot';

export interface GenericAssetPackageFile {
  path: string;
  content: string;
  encoding: 'utf8';
}

export interface GenericAssetPackageAssetManifestEntry {
  assetType: string;
  sourceCollection: 'characters' | 'items';
  sourceRecordId: string;
  name: string;
  changed: boolean;
  exportStatus: 'new' | 'changed' | 'exported';
  updatedAt: string;
}

export type GenericAssetPackageStatus = GenericAssetPackageAssetManifestEntry;

export interface GenericAssetPackage {
  manifest: {
    schemaVersion: 1;
    projectId: string;
    projectName: string;
    createdAt: string;
    mode: GenericAssetPackageMode;
    assetSchema: ProjectAssetSchema;
    assets: GenericAssetPackageAssetManifestEntry[];
  };
  files: GenericAssetPackageFile[];
}

export interface PushAssetPackageResult {
  message: string;
  paths: string[];
  manifest: GenericAssetPackage['manifest'];
}

export interface AssetPackageInput {
  mode?: GenericAssetPackageMode;
  assetTypes?: string[];
  characterIds?: string[];
  itemIds?: string[];
  markExported?: boolean;
}

export async function buildAssetPackage(
  projectId: string,
  input: AssetPackageInput = {},
): Promise<GenericAssetPackage> {
  const { data } = await api.post<GenericAssetPackage>(`/asset-packages/projects/${projectId}/package`, input);
  return data;
}

export async function downloadAssetPackage(
  projectId: string,
  input: AssetPackageInput = {},
): Promise<Blob> {
  const { data } = await api.post(`/asset-packages/projects/${projectId}/package/download`, input, {
    responseType: 'blob',
  });
  return data as Blob;
}

export async function pushAssetPackage(
  projectId: string,
  input: AssetPackageInput & {
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    filePath?: string;
    commitMessage?: string;
  } = {},
): Promise<PushAssetPackageResult> {
  const { data } = await api.post<PushAssetPackageResult>(
    `/asset-packages/projects/${projectId}/package/push-to-github`,
    input,
  );
  return data;
}

export async function listAssetPackageStatuses(
  projectId: string,
  params: { assetTypes?: string[] } = {},
): Promise<GenericAssetPackageStatus[]> {
  const { data } = await api.get<GenericAssetPackageStatus[]>(`/asset-packages/projects/${projectId}/status`, { params });
  return data;
}
