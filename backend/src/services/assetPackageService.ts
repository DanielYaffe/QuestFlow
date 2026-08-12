import crypto from 'crypto';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import ProjectModel, { IProjectAssetSchema } from '../models/projectModel';
import { getPresignedUrl } from '../utils/s3Helper';

export type GenericAssetPackageMode = 'changed-only' | 'full-snapshot';

export interface GenericAssetPackageFile {
  path: string;
  content: string;
  encoding: 'utf8';
}

export interface GenericAssetPackageAsset {
  assetType: string;
  sourceCollection: 'characters' | 'items';
  sourceRecordId: string;
  name: string;
  changed: boolean;
  exportStatus: 'new' | 'changed' | 'exported';
  contentHash: string;
  fields: Record<string, unknown>;
  images: Record<string, string>;
  adapterMetadata: Record<string, unknown>;
  updatedAt: string;
}

export interface GenericAssetPackage {
  manifest: {
    schemaVersion: 1;
    projectId: string;
    projectName: string;
    createdAt: string;
    mode: GenericAssetPackageMode;
    assetSchema: IProjectAssetSchema;
    assets: Array<Pick<GenericAssetPackageAsset, 'assetType' | 'sourceCollection' | 'sourceRecordId' | 'name' | 'changed' | 'exportStatus' | 'contentHash' | 'updatedAt'>>;
  };
  files: GenericAssetPackageFile[];
}

export type GenericAssetPackageStatus = GenericAssetPackage['manifest']['assets'][number];

interface BuildGenericAssetPackageInput {
  ownerId: string;
  projectId: string;
  mode?: GenericAssetPackageMode;
  assetTypes?: string[];
  characterIds?: string[];
  itemIds?: string[];
  markExported?: boolean;
}

function wantsAssetType(selected: Set<string> | undefined, assetType: string): boolean {
  return !selected || selected.has(assetType);
}

function characterAssetType(kind: string): string {
  return kind === 'monster' ? 'monster' : 'npc';
}

function shouldQueryCharacters(input: BuildGenericAssetPackageInput, selectedTypes: Set<string> | undefined): boolean {
  if (input.characterIds?.length) return true;
  if (input.itemIds?.length && !input.characterIds?.length) return false;
  return !selectedTypes || selectedTypes.has('npc') || selectedTypes.has('monster');
}

function shouldQueryItems(input: BuildGenericAssetPackageInput, selectedTypes: Set<string> | undefined): boolean {
  if (input.itemIds?.length) return true;
  if (input.characterIds?.length && !input.itemIds?.length) return false;
  return !selectedTypes || selectedTypes.has('item');
}

function contentHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function exportStatus(lastHash: string | undefined, nextHash: string): GenericAssetPackageAsset['exportStatus'] {
  if (!lastHash) return 'new';
  return lastHash === nextHash ? 'exported' : 'changed';
}

function isStoredObjectReference(value: string): boolean {
  return Boolean(value) && !/^https?:\/\//i.test(value) && !value.startsWith('data:');
}

async function exportedImageReference(value: string): Promise<string> {
  if (!value) return '';
  return isStoredObjectReference(value) ? getPresignedUrl(value) : value;
}

function itemImageKeys(item: { assets?: { snappedSpriteS3Key?: string; rawSpriteCandidates?: string[] } }): Record<string, string> {
  const candidates = item.assets?.rawSpriteCandidates ?? [];
  return {
    sprite: item.assets?.snappedSpriteS3Key || candidates[candidates.length - 1] || '',
  };
}

async function itemImageFields(item: { assets?: { snappedSpriteS3Key?: string; rawSpriteCandidates?: string[] } }): Promise<Record<string, string>> {
  const keys = itemImageKeys(item);
  return {
    sprite: await exportedImageReference(keys.sprite),
  };
}

function characterImageKeys(character: {
  portraitUrl?: string;
  assets?: { snappedSpriteS3Key?: string; rawSpriteCandidates?: string[]; spritesheetS3Key?: string; spritesheetJsonS3Key?: string };
}): Record<string, string> {
  const candidates = character.assets?.rawSpriteCandidates ?? [];
  return {
    portrait: character.portraitUrl ?? '',
    sprite: character.assets?.snappedSpriteS3Key || candidates[candidates.length - 1] || '',
    spritesheet: character.assets?.spritesheetS3Key ?? '',
    spritesheetMetadata: character.assets?.spritesheetJsonS3Key ?? '',
  };
}

async function characterImageFields(character: {
  portraitUrl?: string;
  assets?: { snappedSpriteS3Key?: string; rawSpriteCandidates?: string[]; spritesheetS3Key?: string; spritesheetJsonS3Key?: string };
}): Promise<Record<string, string>> {
  const keys = characterImageKeys(character);
  return {
    portrait: await exportedImageReference(keys.portrait),
    sprite: await exportedImageReference(keys.sprite),
    spritesheet: await exportedImageReference(keys.spritesheet),
    spritesheetMetadata: await exportedImageReference(keys.spritesheetMetadata),
  };
}

export async function buildGenericAssetPackage(input: BuildGenericAssetPackageInput): Promise<GenericAssetPackage> {
  const project = await ProjectModel.findOne({ _id: input.projectId, ownerId: input.ownerId }).lean();
  if (!project) throw new Error('Project not found');

  const selectedTypes = input.assetTypes?.length ? new Set(input.assetTypes) : undefined;
  const queryCharacters = shouldQueryCharacters(input, selectedTypes);
  const queryItems = shouldQueryItems(input, selectedTypes);
  const characterFilter = {
    ownerId: input.ownerId,
    projectId: input.projectId,
    ...(input.characterIds?.length ? { _id: { $in: input.characterIds } } : {}),
  };
  const itemFilter = {
    ownerId: input.ownerId,
    projectId: input.projectId,
    ...(input.itemIds?.length ? { _id: { $in: input.itemIds } } : {}),
  };

  const [characters, items] = await Promise.all([
    queryCharacters ? CharacterModel.find(characterFilter).lean() : [],
    queryItems ? ItemModel.find(itemFilter).lean() : [],
  ]);

  const mode = input.mode ?? 'changed-only';
  const explicitSelection = Boolean(input.characterIds?.length || input.itemIds?.length || input.assetTypes?.length);
  const assets: GenericAssetPackageAsset[] = [];
  for (const character of characters) {
    const assetType = characterAssetType(character.kind);
    if (!wantsAssetType(selectedTypes, assetType)) continue;
    const fields = {
      kind: character.kind,
      name: character.name,
      appearance: character.appearance ?? '',
      lore: character.lore ?? '',
      tags: character.tags ?? [],
      dialogueTraits: character.dialogueTraits ?? [],
      speciesData: character.speciesData ?? {},
      custom: character.customFields ?? {},
    };
    const imageKeys = characterImageKeys(character);
    const images = await characterImageFields(character);
    const adapterMetadata = {
      maple: character.maple ?? {},
    };
    const hash = contentHash({ assetType, fields, images: imageKeys, adapterMetadata });
    const status = exportStatus(character.exportState?.lastGenericExportHash, hash);
    const changed = status !== 'exported';
    if (mode === 'changed-only' && !changed && !explicitSelection) continue;
    assets.push({
      assetType,
      sourceCollection: 'characters',
      sourceRecordId: character._id.toString(),
      name: character.name,
      changed,
      exportStatus: status,
      contentHash: hash,
      fields,
      images,
      adapterMetadata,
      updatedAt: character.updatedAt.toISOString(),
    });
  }

  for (const item of items) {
    if (!wantsAssetType(selectedTypes, 'item')) continue;
    const fields = {
      name: item.name,
      description: item.description ?? '',
      rarity: item.rarity ?? '',
      tags: item.tags ?? [],
      custom: item.customFields ?? {},
    };
    const imageKeys = itemImageKeys(item);
    const images = await itemImageFields(item);
    const adapterMetadata = {
      maple: item.maple ?? {},
    };
    const hash = contentHash({ assetType: 'item', fields, images: imageKeys, adapterMetadata });
    const status = exportStatus(item.exportState?.lastGenericExportHash, hash);
    const changed = status !== 'exported';
    if (mode === 'changed-only' && !changed && !explicitSelection) continue;
    assets.push({
      assetType: 'item',
      sourceCollection: 'items',
      sourceRecordId: item._id.toString(),
      name: item.name,
      changed,
      exportStatus: status,
      contentHash: hash,
      fields,
      images,
      adapterMetadata,
      updatedAt: item.updatedAt.toISOString(),
    });
  }

  assets.sort((a, b) => {
    if (a.changed !== b.changed) return a.changed ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const manifest: GenericAssetPackage['manifest'] = {
    schemaVersion: 1,
    projectId: project._id.toString(),
    projectName: project.name,
    createdAt: new Date().toISOString(),
    mode,
    assetSchema: project.assetSchema ?? { assetTypes: [], valuePools: [] },
    assets: assets.map((asset) => ({
      assetType: asset.assetType,
      sourceCollection: asset.sourceCollection,
      sourceRecordId: asset.sourceRecordId,
      name: asset.name,
      changed: asset.changed,
      exportStatus: asset.exportStatus,
      contentHash: asset.contentHash,
      updatedAt: asset.updatedAt,
    })),
  };

  if (input.markExported && assets.length > 0) {
    const exportedAt = new Date();
    const characterOps = assets
      .filter((asset) => asset.sourceCollection === 'characters')
      .map((asset) => ({
        updateOne: {
          filter: { _id: asset.sourceRecordId, ownerId: input.ownerId, projectId: input.projectId },
          update: {
            $set: {
              'exportState.lastGenericExportHash': asset.contentHash,
              'exportState.lastGenericExportedAt': exportedAt,
            },
          },
        },
      }));
    const itemOps = assets
      .filter((asset) => asset.sourceCollection === 'items')
      .map((asset) => ({
        updateOne: {
          filter: { _id: asset.sourceRecordId, ownerId: input.ownerId, projectId: input.projectId },
          update: {
            $set: {
              'exportState.lastGenericExportHash': asset.contentHash,
              'exportState.lastGenericExportedAt': exportedAt,
            },
          },
        },
      }));
    await Promise.all([
      characterOps.length ? CharacterModel.bulkWrite(characterOps) : undefined,
      itemOps.length ? ItemModel.bulkWrite(itemOps) : undefined,
    ]);
  }

  return {
    manifest,
    files: [
      { path: 'manifest.json', content: JSON.stringify(manifest, null, 2), encoding: 'utf8' },
      ...assets.map((asset) => ({
        path: `assets/${asset.assetType}/${asset.sourceRecordId}.json`,
        content: JSON.stringify(asset, null, 2),
        encoding: 'utf8' as const,
      })),
    ],
  };
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function writeZipHeader(signature: number, size: number): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32LE(signature, 0);
  return buffer;
}

export function buildGenericAssetPackageZip(pkg: GenericAssetPackage): Buffer {
  const chunks: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  const { date, time } = dosDateTime();
  let offset = 0;

  for (const file of pkg.files) {
    const name = Buffer.from(file.path.replace(/\\/g, '/'), 'utf8');
    const content = Buffer.from(file.content, 'utf8');
    const checksum = crc32(content);

    const local = writeZipHeader(0x04034b50, 30);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, content);

    const central = writeZipHeader(0x02014b50, 46);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralDirectory.push(central, name);

    offset += local.length + name.length + content.length;
  }

  const centralOffset = offset;
  const centralSize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = writeZipHeader(0x06054b50, 22);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(pkg.files.length, 8);
  end.writeUInt16LE(pkg.files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...centralDirectory, end]);
}

export async function listGenericAssetPackageStatuses(input: {
  ownerId: string;
  projectId: string;
  assetTypes?: string[];
}): Promise<GenericAssetPackageStatus[]> {
  const pkg = await buildGenericAssetPackage({
    ownerId: input.ownerId,
    projectId: input.projectId,
    mode: 'full-snapshot',
    assetTypes: input.assetTypes,
  });
  return pkg.manifest.assets;
}
