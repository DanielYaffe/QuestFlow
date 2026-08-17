import crypto from 'crypto';
import sharp from 'sharp';
import CharacterModel, { ICharacter } from '../models/characterModel';
import ItemModel, { IItem } from '../models/itemModel';
import ProjectModel, { IMapleIdRange, IProject } from '../models/projectModel';
import KbDocumentModel from '../models/kbDocumentModel';
import { downloadBufferFromS3 } from '../utils/s3Helper';
import { config } from '../config/config';

export type MapleAssetType = 'npc' | 'item';
export type MapleExportMode = 'changed-only' | 'full-snapshot';

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

interface BuildPackageInput {
  ownerId: string;
  projectId: string;
  mode?: MapleExportMode;
  baseManifestId?: string;
  npcIds?: string[];
  itemIds?: string[];
}

interface NativeEntity {
  id: number;
  name: string;
  documentTitle: string;
}

interface NormalizedImageResult {
  buffer: Buffer;
  usedPlaceholder: boolean;
  warning?: string;
}

const NATIVE_TYPE_BY_ASSET: Record<MapleAssetType, 'characters' | 'items'> = {
  npc: 'characters',
  item: 'items',
};

function paddedNpcId(id: number): string {
  return String(id).padStart(7, '0');
}

function etcGroupForItemId(id: number): string {
  return String(Math.floor(id / 10000)).padStart(4, '0');
}

const TARGET_PATHS: Record<MapleAssetType, (id: number) => string[]> = {
  npc: (id) => [
    'client/Data/String/Npc.img',
    `client/Data/Npc/${paddedNpcId(id)}.img`,
    'server/wz/String.wz/Npc.img.xml',
    `server/wz/Npc.wz/${paddedNpcId(id)}.img.xml`,
  ],
  item: (id) => [
    'client/Data/String/Etc.img',
    `client/Data/Item/Etc/${etcGroupForItemId(id)}.img`,
    'server/wz/String.wz/Etc.img.xml',
    `server/wz/Item.wz/Etc/${etcGroupForItemId(id)}.img.xml`,
  ],
};

const IMAGE_PROFILES: Record<MapleAssetType, {
  width: number;
  height: number;
  originX?: number;
  originY?: number;
  contentWidth?: number;
  contentHeight?: number;
}> = {
  // Matches native NPC 22000's stand/0 canvas size. Generated sprites use a
  // centered x-origin because their pixel layout is not the same as NPC 22000.
  npc: { width: 67, height: 77, originY: 77 },
  // Maple item icons live on a 32x32 canvas, but native ETC icon artwork is
  // usually inset. Keep the WZ canvas native-sized while avoiding huge icons.
  item: { width: 32, height: 32, contentWidth: 24, contentHeight: 24 },
};

function hash(value: unknown): string {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  return crypto.createHash('sha256').update(input).digest('hex');
}

function normalizeId(raw: unknown): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function rangeContains(ranges: IMapleIdRange[] | undefined, id: number): boolean {
  if (!ranges?.length) return true;
  return ranges.some((range) => id >= range.min && id <= range.max);
}

function rangesFor(project: IProject, assetType: MapleAssetType): IMapleIdRange[] {
  return assetType === 'npc'
    ? project.mapleSettings?.npcIdRanges ?? []
    : project.mapleSettings?.itemIdRanges ?? [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEntityId(entry: Record<string, unknown>): number {
  for (const key of ['id', 'mapleId', 'maple_id', 'npcId', 'itemId', 'mobId', 'questId']) {
    const id = normalizeId(entry[key]);
    if (id) return id;
  }
  return 0;
}

function readEntityName(entry: Record<string, unknown>, fallback: string): string {
  for (const key of ['name', 'title']) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function entitiesFromParsedJson(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) return parsed.filter(isObject);
  if (!isObject(parsed)) return [];

  const directId = readEntityId(parsed);
  if (directId) return [parsed];

  const nestedArrays = Object.values(parsed).filter(Array.isArray);
  if (nestedArrays.length > 0) return nestedArrays.flat().filter(isObject);

  return Object.entries(parsed).flatMap(([key, value]) => {
    if (!isObject(value)) return [];
    return [{ name: key, ...value }];
  });
}

function decodeXmlValue(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function entitiesFromXml(text: string): Array<Record<string, unknown>> {
  const entities: Array<Record<string, unknown>> = [];
  const entityRegex = /<imgdir\s+name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let match: RegExpExecArray | null;

  while ((match = entityRegex.exec(text)) !== null) {
    const [, rawId, body] = match;
    const nameMatch = body.match(/<string\s+name="name"\s+value="([^"]*)"/)
      ?? body.match(/<string\s+name="desc"\s+value="([^"]*)"/);
    entities.push({
      id: Number(rawId),
      name: nameMatch ? decodeXmlValue(nameMatch[1]).trim() : '',
    });
  }

  return entities;
}

async function findNativeCollision(
  project: IProject,
  assetType: MapleAssetType,
  mapleId: number,
): Promise<NativeEntity | undefined> {
  if (!project.gameId) return undefined;
  const kbType = NATIVE_TYPE_BY_ASSET[assetType];
  const docs = await KbDocumentModel.find({
    gameId: project.gameId,
    type: kbType,
    status: 'ready',
  }).select('title originalText').lean();

  for (const doc of docs) {
    let entries: Array<Record<string, unknown>> = [];
    try {
      entries = entitiesFromParsedJson(JSON.parse(doc.originalText));
    } catch {
      entries = entitiesFromXml(doc.originalText);
    }
    for (const entry of entries) {
      if (readEntityId(entry) !== mapleId) continue;
      return {
        id: mapleId,
        name: readEntityName(entry, `${assetType} ${mapleId}`),
        documentTitle: doc.title,
      };
    }
  }
  return undefined;
}

async function nativeIds(project: IProject, assetType: MapleAssetType): Promise<Set<number>> {
  const ids = new Set<number>();
  if (!project.gameId) return ids;

  const docs = await KbDocumentModel.find({
    gameId: project.gameId,
    type: NATIVE_TYPE_BY_ASSET[assetType],
    status: 'ready',
  }).select('originalText').lean();

  for (const doc of docs) {
    let entries: Array<Record<string, unknown>> = [];
    try {
      entries = entitiesFromParsedJson(JSON.parse(doc.originalText));
    } catch {
      entries = entitiesFromXml(doc.originalText);
    }
    for (const entry of entries) {
      const id = readEntityId(entry);
      if (id) ids.add(id);
    }
  }
  return ids;
}

async function projectUsedIds(
  projectId: string,
  assetType: MapleAssetType,
  excludeRecordId?: string,
): Promise<Set<number>> {
  const idFilter = excludeRecordId ? { $ne: excludeRecordId } : { $exists: true };
  const filter = {
    projectId,
    _id: idFilter,
    'maple.mapleId': { $gt: 0 },
  };

  const rows = assetType === 'npc'
    ? await CharacterModel.find({ ...filter, kind: 'npc' }).select('maple.mapleId').lean()
    : await ItemModel.find(filter).select('maple.mapleId').lean();

  return new Set(rows.map((row) => normalizeId(row.maple?.mapleId)).filter(Boolean));
}

async function projectDuplicate(
  projectId: string,
  assetType: MapleAssetType,
  mapleId: number,
  excludeRecordId?: string,
): Promise<string | undefined> {
  const idFilter = excludeRecordId ? { $ne: excludeRecordId } : { $exists: true };
  const filter = {
    projectId,
    'maple.mapleId': mapleId,
    _id: idFilter,
  };
  if (assetType === 'npc') {
    const existing = await CharacterModel.findOne({ ...filter, kind: 'npc' }).select('name').lean();
    return existing?.name;
  }
  const existing = await ItemModel.findOne(filter).select('name').lean();
  return existing?.name;
}

export async function checkMapleIdAvailability(args: {
  ownerId: string;
  projectId: string;
  assetType: MapleAssetType;
  mapleId: number;
  excludeRecordId?: string;
  allowNativePatch?: boolean;
}): Promise<MapleIdAvailability> {
  const project = await ProjectModel.findOne({ _id: args.projectId, ownerId: args.ownerId });
  if (!project) throw new Error('Project not found');

  const errors: string[] = [];
  const warnings: string[] = [];
  const mapleId = normalizeId(args.mapleId);
  if (!mapleId) errors.push('Maple ID must be a positive integer.');

  if (mapleId && !rangeContains(rangesFor(project, args.assetType), mapleId)) {
    errors.push(`Maple ID ${mapleId} is outside the configured ${args.assetType} ranges.`);
  }

  if (mapleId) {
    const duplicateName = await projectDuplicate(args.projectId, args.assetType, mapleId, args.excludeRecordId);
    if (duplicateName) errors.push(`Maple ID ${mapleId} is already used by project asset "${duplicateName}".`);
  }

  const nativeCollision = mapleId
    ? await findNativeCollision(project, args.assetType, mapleId)
    : undefined;
  if (nativeCollision && !args.allowNativePatch) {
    errors.push(`Maple ID ${mapleId} already exists in native KB data as "${nativeCollision.name}".`);
  } else if (nativeCollision) {
    warnings.push(`Maple ID ${mapleId} will patch native object "${nativeCollision.name}".`);
  }

  return {
    available: errors.length === 0,
    assetType: args.assetType,
    mapleId,
    warnings,
    errors,
    nativeCollision: nativeCollision ? {
      ...nativeCollision,
      kbType: NATIVE_TYPE_BY_ASSET[args.assetType],
    } : undefined,
  };
}

export async function allocateMapleId(args: {
  ownerId: string;
  projectId: string;
  assetType: MapleAssetType;
  excludeRecordId?: string;
}): Promise<MapleIdAllocation> {
  const project = await ProjectModel.findOne({ _id: args.projectId, ownerId: args.ownerId });
  if (!project) throw new Error('Project not found');

  const ranges = rangesFor(project, args.assetType);
  if (!ranges.length) {
    return {
      available: false,
      exhausted: true,
      assetType: args.assetType,
      mapleId: 0,
      warnings: [],
      errors: [`Configure at least one allowed ${args.assetType} ID range in project Maple settings.`],
    };
  }

  const [native, projectUsed] = await Promise.all([
    nativeIds(project, args.assetType),
    projectUsedIds(args.projectId, args.assetType, args.excludeRecordId),
  ]);

  const sortedRanges = [...ranges].sort((a, b) => a.min - b.min);
  for (const range of sortedRanges) {
    const min = Math.max(1, Math.min(range.min, range.max));
    const max = Math.max(range.min, range.max);
    for (let mapleId = min; mapleId <= max; mapleId += 1) {
      if (native.has(mapleId) || projectUsed.has(mapleId)) continue;
      const availability = await checkMapleIdAvailability({
        ownerId: args.ownerId,
        projectId: args.projectId,
        assetType: args.assetType,
        mapleId,
        excludeRecordId: args.excludeRecordId,
        allowNativePatch: false,
      });
      if (availability.available) {
        return { ...availability, exhausted: false };
      }
    }
  }

  return {
    available: false,
    exhausted: true,
    assetType: args.assetType,
    mapleId: 0,
    warnings: [],
    errors: [`No free ${args.assetType} Maple ID was found in the configured ranges.`],
  };
}

async function placeholderImage(assetType: MapleAssetType): Promise<Buffer> {
  const profile = IMAGE_PROFILES[assetType];
  const label = assetType === 'npc' ? 'NPC' : 'ITEM';
  const svg = `
    <svg width="${profile.width}" height="${profile.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#24313f"/>
      <rect x="1" y="1" width="${profile.width - 2}" height="${profile.height - 2}" fill="#9be8ff" fill-opacity="0.22" stroke="#9be8ff"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="${assetType === 'npc' ? 9 : 6}" font-weight="700" fill="#ffffff">${label}</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function normalizeImage(
  imageKey: string,
  assetType: MapleAssetType,
): Promise<{ buffer: Buffer; usedPlaceholder: boolean; warning?: string }> {
  const profile = IMAGE_PROFILES[assetType];
  let input: Buffer;
  try {
    input = await downloadBufferFromS3(imageKey);
  } catch (error) {
    if (!config.MAPLE_EXPORT_ALLOW_PLACEHOLDER_IMAGES) throw error;
    const reason = error instanceof Error ? error.message : 'Could not read image from object storage.';
    input = await placeholderImage(assetType);
    return {
      buffer: input,
      usedPlaceholder: true,
      warning: `Used placeholder ${assetType} image because object storage image could not be read: ${reason}`,
    };
  }

  if (assetType === 'npc') {
    const trimmed = await sharp(input)
      .trim({ threshold: 10 })
      .resize(profile.width, profile.height, {
        fit: 'inside',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
    const metadata = await sharp(trimmed).metadata();
    const width = metadata.width ?? profile.width;
    const height = metadata.height ?? profile.height;
    return {
      buffer: await sharp({
        create: {
          width: profile.width,
          height: profile.height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{
          input: trimmed,
          left: Math.max(0, Math.floor((profile.width - width) / 2)),
          top: Math.max(0, profile.height - height),
        }])
        .png()
        .toBuffer(),
      usedPlaceholder: false,
    };
  }

  const trimmed = await sharp(input)
    .trim({ threshold: 10 })
    .resize(profile.contentWidth ?? profile.width, profile.contentHeight ?? profile.height, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(trimmed).metadata();
  const width = metadata.width ?? profile.contentWidth ?? profile.width;
  const height = metadata.height ?? profile.contentHeight ?? profile.height;
  return {
    buffer: await sharp({
      create: {
        width: profile.width,
        height: profile.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{
        input: trimmed,
        left: Math.max(0, Math.floor((profile.width - width) / 2)),
        top: Math.max(0, Math.floor((profile.height - height) / 2)),
      }])
      .png()
      .toBuffer(),
    usedPlaceholder: false,
  };
}

async function missingImageFallback(assetType: MapleAssetType): Promise<NormalizedImageResult> {
  if (!config.MAPLE_EXPORT_ALLOW_PLACEHOLDER_IMAGES) {
    return { buffer: Buffer.alloc(0), usedPlaceholder: false };
  }
  return {
    buffer: await placeholderImage(assetType),
    usedPlaceholder: true,
    warning: `Used placeholder ${assetType} image because no canonical image is set.`,
  };
}

function statusFor(warnings: string[], errors: string[]): MaplePackageAsset['validationStatus'] {
  if (errors.length > 0) return 'error';
  if (warnings.length > 0) return 'warning';
  return 'valid';
}

function npcFramesManifest(): { profile: string; frames: Array<Record<string, unknown>> } {
  const profile = IMAGE_PROFILES.npc;
  return {
    profile: 'npc-world-sprite',
    frames: [
      {
        action: 'stand',
        name: '0',
        source: 'sprite.png',
        width: profile.width,
        height: profile.height,
        origin: {
          x: profile.originX ?? Math.floor(profile.width / 2),
          y: profile.originY ?? profile.height,
        },
      },
    ],
  };
}

function shouldIncludeAsset(
  mode: MapleExportMode,
  sourceHash: string,
  imageHash: string,
  lastExportHash: string | undefined,
): boolean {
  if (mode === 'full-snapshot') return true;
  if (!lastExportHash) return true;
  return hash({ sourceHash, imageHash }) !== lastExportHash;
}

async function buildNpcAsset(
  ownerId: string,
  project: IProject,
  character: ICharacter,
  mode: MapleExportMode,
): Promise<{ asset: MaplePackageAsset; files: MaplePackageFile[]; include: boolean }> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const mapleId = normalizeId(character.maple?.mapleId);
  const imageKey = character.assets?.snappedSpriteS3Key || character.assets?.rawSpriteCandidates?.at(-1) || '';
  if (!mapleId) errors.push('NPC has no Maple ID.');
  if (!imageKey) {
    if (config.MAPLE_EXPORT_ALLOW_PLACEHOLDER_IMAGES) warnings.push('NPC has no canonical sprite image.');
    else errors.push('NPC has no canonical sprite image.');
  }

  const availability = mapleId ? await checkMapleIdAvailability({
    ownerId,
    projectId: project._id.toString(),
    assetType: 'npc',
    mapleId,
    excludeRecordId: character._id.toString(),
    allowNativePatch: character.maple?.operation === 'patch',
  }) : undefined;
  warnings.push(...(availability?.warnings ?? []));
  errors.push(...(availability?.errors ?? []));

  const spriteResult: NormalizedImageResult = imageKey ? await normalizeImage(imageKey, 'npc').catch((error: unknown) => {
    errors.push(error instanceof Error ? error.message : 'Failed to normalize NPC sprite.');
    return { buffer: Buffer.alloc(0), usedPlaceholder: false };
  }) : await missingImageFallback('npc');
  if (spriteResult.warning) warnings.push(spriteResult.warning);
  const sprite = spriteResult.buffer;
  const source = {
    id: character._id.toString(),
    kind: character.kind,
    name: character.name,
    lore: character.lore,
    dialogueTraits: character.dialogueTraits,
    mapleId,
    operation: character.maple?.operation ?? 'create',
  };
  const sourceHash = hash(source);
  const normalizedImageHash = sprite.length ? hash(sprite) : '';
  const include = shouldIncludeAsset(mode, sourceHash, normalizedImageHash, character.maple?.lastExportHash);
  const base = `npcs/${mapleId || character._id.toString()}`;

  return {
    include,
    asset: {
      assetType: 'npc',
      mapleId,
      name: character.name,
      sourceRecordId: character._id.toString(),
      sourceHash,
      normalizedImageHash,
      targetNativePaths: mapleId ? TARGET_PATHS.npc(mapleId) : [],
      operation: character.maple?.operation ?? 'create',
      validationStatus: statusFor(warnings, errors),
      warnings,
      errors,
    },
    files: [
      { path: `${base}/npc.json`, content: JSON.stringify(source, null, 2), encoding: 'utf8' },
      ...(sprite.length ? [{ path: `${base}/sprite.png`, content: sprite.toString('base64'), encoding: 'base64' as const }] : []),
      { path: `${base}/frames.json`, content: JSON.stringify(npcFramesManifest(), null, 2), encoding: 'utf8' },
    ],
  };
}

async function buildItemAsset(
  ownerId: string,
  project: IProject,
  item: IItem,
  mode: MapleExportMode,
): Promise<{ asset: MaplePackageAsset; files: MaplePackageFile[]; include: boolean }> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const mapleId = normalizeId(item.maple?.mapleId);
  const imageKey = item.assets?.snappedSpriteS3Key || item.assets?.rawSpriteCandidates?.at(-1) || '';
  if (!mapleId) errors.push('Item has no Maple ID.');
  if (!imageKey) {
    if (config.MAPLE_EXPORT_ALLOW_PLACEHOLDER_IMAGES) warnings.push('Item has no canonical icon image.');
    else errors.push('Item has no canonical icon image.');
  }

  const availability = mapleId ? await checkMapleIdAvailability({
    ownerId,
    projectId: project._id.toString(),
    assetType: 'item',
    mapleId,
    excludeRecordId: item._id.toString(),
    allowNativePatch: item.maple?.operation === 'patch',
  }) : undefined;
  warnings.push(...(availability?.warnings ?? []));
  errors.push(...(availability?.errors ?? []));

  const iconResult: NormalizedImageResult = imageKey ? await normalizeImage(imageKey, 'item').catch((error: unknown) => {
    errors.push(error instanceof Error ? error.message : 'Failed to normalize item icon.');
    return { buffer: Buffer.alloc(0), usedPlaceholder: false };
  }) : await missingImageFallback('item');
  if (iconResult.warning) warnings.push(iconResult.warning);
  const icon = iconResult.buffer;
  const source = {
    id: item._id.toString(),
    category: 'etc',
    name: item.name,
    description: item.description,
    tags: item.tags,
    mapleId,
    operation: item.maple?.operation ?? 'create',
  };
  const sourceHash = hash(source);
  const normalizedImageHash = icon.length ? hash(icon) : '';
  const include = shouldIncludeAsset(mode, sourceHash, normalizedImageHash, item.maple?.lastExportHash);
  const base = `items/${mapleId || item._id.toString()}`;

  return {
    include,
    asset: {
      assetType: 'item',
      mapleId,
      name: item.name,
      sourceRecordId: item._id.toString(),
      sourceHash,
      normalizedImageHash,
      targetNativePaths: mapleId ? TARGET_PATHS.item(mapleId) : [],
      operation: item.maple?.operation ?? 'create',
      validationStatus: statusFor(warnings, errors),
      warnings,
      errors,
    },
    files: [
      { path: `${base}/item.json`, content: JSON.stringify(source, null, 2), encoding: 'utf8' },
      ...(icon.length ? [{ path: `${base}/icon.png`, content: icon.toString('base64'), encoding: 'base64' as const }] : []),
    ],
  };
}

export async function buildMapleAssetPackage(input: BuildPackageInput): Promise<MapleAssetPackage> {
  const project = await ProjectModel.findOne({ _id: input.projectId, ownerId: input.ownerId });
  if (!project) throw new Error('Project not found');

  const mode = input.mode ?? project.mapleSettings?.defaultExportMode ?? 'changed-only';
  const npcFilter = {
    ownerId: input.ownerId,
    projectId: input.projectId,
    kind: 'npc',
    ...(input.npcIds?.length ? { _id: { $in: input.npcIds } } : { 'maple.exportEnabled': true }),
  };
  const itemFilter = {
    ownerId: input.ownerId,
    projectId: input.projectId,
    ...(input.itemIds?.length ? { _id: { $in: input.itemIds } } : { 'maple.exportEnabled': true }),
  };

  const [npcs, items] = await Promise.all([
    CharacterModel.find(npcFilter),
    ItemModel.find(itemFilter),
  ]);

  const built = [
    ...(await Promise.all(npcs.map((npc) => buildNpcAsset(input.ownerId, project, npc, mode)))),
    ...(await Promise.all(items.map((item) => buildItemAsset(input.ownerId, project, item, mode)))),
  ];
  const selected = built.filter((entry) => entry.include);
  const assets = selected.map((entry) => entry.asset);
  const files = selected.flatMap((entry) => entry.files);
  const warnings = assets.flatMap((asset) => asset.warnings.map((warning) => `${asset.assetType}:${asset.mapleId}: ${warning}`));
  const errors = assets.flatMap((asset) => asset.errors.map((error) => `${asset.assetType}:${asset.mapleId}: ${error}`));

  const manifest: MapleAssetPackage['manifest'] = {
    schemaVersion: 1,
    projectId: project._id.toString(),
    projectName: project.name,
    targetVersion: 'v83',
    createdAt: new Date().toISOString(),
    mode,
    baseManifestId: input.baseManifestId ?? '',
    assets,
    warnings,
    errors,
  };

  return {
    manifest,
    files: [
      { path: 'manifest.json', content: JSON.stringify(manifest, null, 2), encoding: 'utf8' },
      ...files,
    ],
  };
}
