import api from './axiosInstance';

export type MapleAssetType = 'npc' | 'item';
export type MapleExportMode = 'changed-only' | 'full-snapshot';

export interface MapleIdRange {
  min: number;
  max: number;
}

export interface MapleAssetMetadata {
  mapleId: number;
  exportEnabled: boolean;
  operation: 'create' | 'patch';
  nativePath: string;
  lastExportHash: string;
  validationWarnings: string[];
  validationErrors: string[];
}

export interface MapleProjectSettings {
  enabled: boolean;
  targetVersion: 'v83';
  defaultExportMode: MapleExportMode;
  npcIdRanges: MapleIdRange[];
  itemIdRanges: MapleIdRange[];
}

export interface MapleIdAvailability {
  available: boolean;
  assetType: MapleAssetType;
  mapleId: number;
  warnings: string[];
  errors: string[];
  nativeCollision?: {
    id: number;
    name: string;
    kbType: string;
    documentTitle: string;
  };
}

export interface MapleIdAllocation extends MapleIdAvailability {
  exhausted: boolean;
}

export interface MaplePackageFile {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
}

export interface MaplePackageAsset {
  assetType: MapleAssetType;
  mapleId: number;
  name: string;
  sourceRecordId: string;
  sourceHash: string;
  normalizedImageHash: string;
  targetNativePaths: string[];
  operation: 'create' | 'patch';
  validationStatus: 'valid' | 'warning' | 'error';
  warnings: string[];
  errors: string[];
}

export interface MapleAssetPackage {
  manifest: {
    schemaVersion: 1;
    projectId: string;
    projectName: string;
    targetVersion: 'v83';
    createdAt: string;
    mode: MapleExportMode;
    baseManifestId: string;
    assets: MaplePackageAsset[];
    warnings: string[];
    errors: string[];
  };
  files: MaplePackageFile[];
}

export async function checkMapleIdAvailability(params: {
  projectId: string;
  assetType: MapleAssetType;
  mapleId: number;
  excludeRecordId?: string;
  allowNativePatch?: boolean;
}): Promise<MapleIdAvailability> {
  const { data } = await api.get<MapleIdAvailability>('/maple-assets/id-availability', { params });
  return data;
}

export async function allocateMapleId(params: {
  projectId: string;
  assetType: MapleAssetType;
  excludeRecordId?: string;
}): Promise<MapleIdAllocation> {
  const { data } = await api.get<MapleIdAllocation>('/maple-assets/id-allocation', { params });
  return data;
}

export async function buildMapleAssetPackage(
  projectId: string,
  input: {
    mode?: MapleExportMode;
    baseManifestId?: string;
    npcIds?: string[];
    itemIds?: string[];
  } = {},
): Promise<MapleAssetPackage> {
  const { data } = await api.post<MapleAssetPackage>(`/maple-assets/projects/${projectId}/package`, input);
  return data;
}

export async function pushMapleAssetPackage(
  projectId: string,
  input: {
    mode?: MapleExportMode;
    baseManifestId?: string;
    npcIds?: string[];
    itemIds?: string[];
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    filePath?: string;
    commitMessage?: string;
  } = {},
): Promise<{ message: string; path: string; manifest: MapleAssetPackage['manifest'] }> {
  const { data } = await api.post<{ message: string; path: string; manifest: MapleAssetPackage['manifest'] }>(
    `/maple-assets/projects/${projectId}/push-to-github`,
    input,
  );
  return data;
}
