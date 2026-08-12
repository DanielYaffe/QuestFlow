/**
 * Migration: legacy Maple asset metadata -> project custom asset fields.
 *
 * The Studio now exports game-agnostic custom fields. This migration copies the
 * old `maple.*` metadata into editable project fields so exports use the new
 * generic package shape. Safe to re-run.
 *
 * Run with: npx tsx src/scripts/migrate-maple-metadata-to-custom-fields.ts
 */
import mongoose from 'mongoose';
import { config } from '../config/config';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import ProjectModel, {
  IProject,
  IProjectAssetField,
  IProjectAssetSchema,
  IProjectAssetTypeSchema,
  IProjectValuePool,
} from '../models/projectModel';

type AssetTypeKey = 'npc' | 'monster' | 'item';

const FIELD_DEFS: IProjectAssetField[] = [
  {
    key: 'id',
    label: 'ID',
    type: 'number',
    required: true,
    nullable: false,
    description: 'Game object id used by the target adapter.',
    poolKey: '',
    fields: [],
  },
  {
    key: 'exportEnabled',
    label: 'Export Enabled',
    type: 'boolean',
    required: false,
    nullable: true,
    description: 'Whether this asset should be included by the target adapter.',
    fields: [],
  },
  {
    key: 'operation',
    label: 'Operation',
    type: 'text',
    required: false,
    nullable: true,
    description: 'Target adapter operation, such as create or patch.',
    fields: [],
  },
  {
    key: 'nativePath',
    label: 'Native Path',
    type: 'text',
    required: false,
    nullable: true,
    description: 'Optional native asset path used by the target adapter.',
    fields: [],
  },
];

function positiveInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function cloneField(field: IProjectAssetField, poolKey: string): IProjectAssetField {
  return {
    ...field,
    poolKey: field.key === 'id' ? poolKey : field.poolKey,
    fields: field.fields ?? [],
  };
}

function defaultPool(key: string, name: string): IProjectValuePool {
  return {
    key,
    name,
    description: '',
    valueType: 'number',
    options: [],
    ranges: [],
  };
}

function ensurePool(schema: IProjectAssetSchema, pool: IProjectValuePool): void {
  const existing = schema.valuePools.find((entry) => entry.key === pool.key);
  if (existing) {
    if (!existing.name) existing.name = pool.name;
    if (!existing.valueType) existing.valueType = pool.valueType;
    if (!Array.isArray(existing.options)) existing.options = [];
    if (!Array.isArray(existing.ranges)) existing.ranges = [];
    return;
  }
  schema.valuePools.push(pool);
}

function ensureAssetType(schema: IProjectAssetSchema, key: AssetTypeKey, name: string): IProjectAssetTypeSchema {
  let assetType = schema.assetTypes.find((entry) => entry.key === key);
  if (!assetType) {
    assetType = { key, name, description: '', fields: [] };
    schema.assetTypes.push(assetType);
  }
  if (!assetType.name) assetType.name = name;
  if (!Array.isArray(assetType.fields)) assetType.fields = [];
  return assetType;
}

function ensureField(assetType: IProjectAssetTypeSchema, field: IProjectAssetField): void {
  const existing = assetType.fields.find((entry) => entry.key === field.key);
  if (existing) {
    existing.label = existing.label || field.label;
    existing.type = existing.type || field.type;
    existing.required = existing.required || field.required;
    existing.nullable = field.required ? false : existing.nullable;
    existing.description = existing.description || field.description;
    existing.poolKey = existing.poolKey || field.poolKey;
    existing.fields = existing.fields ?? [];
    return;
  }
  assetType.fields.push(field);
}

async function ensureProjectSchema(project: IProject, assetType: AssetTypeKey): Promise<boolean> {
  project.assetSchema = project.assetSchema ?? { assetTypes: [], valuePools: [] };
  project.assetSchema.assetTypes = project.assetSchema.assetTypes ?? [];
  project.assetSchema.valuePools = project.assetSchema.valuePools ?? [];

  const poolKey = assetType === 'item' ? 'itemIds' : assetType === 'monster' ? 'monsterIds' : 'npcIds';
  const poolName = assetType === 'item' ? 'Item IDs' : assetType === 'monster' ? 'Monster IDs' : 'NPC IDs';
  ensurePool(project.assetSchema, defaultPool(poolKey, poolName));

  const schema = ensureAssetType(
    project.assetSchema,
    assetType,
    assetType === 'item' ? 'Item' : assetType === 'monster' ? 'Monster' : 'NPC',
  );
  for (const field of FIELD_DEFS) ensureField(schema, cloneField(field, poolKey));

  project.markModified('assetSchema');
  await project.save();
  return true;
}

function migratedCustomFields(customFields: Record<string, unknown> | undefined, maple: {
  mapleId?: number;
  exportEnabled?: boolean;
  operation?: string;
  nativePath?: string;
} | undefined): { customFields: Record<string, unknown>; syncedMapleId: number; changed: boolean } {
  const next = { ...(customFields ?? {}) };
  const customId = positiveInt(next.id);
  const legacyId = positiveInt(maple?.mapleId);
  const syncedMapleId = customId || legacyId;
  let changed = false;

  if (!customId && legacyId) {
    next.id = legacyId;
    changed = true;
  }
  if (maple?.exportEnabled !== undefined && next.exportEnabled === undefined) {
    next.exportEnabled = maple.exportEnabled;
    changed = true;
  }
  if (maple?.operation && next.operation === undefined) {
    next.operation = maple.operation;
    changed = true;
  }
  if (maple?.nativePath && next.nativePath === undefined) {
    next.nativePath = maple.nativePath;
    changed = true;
  }

  return { customFields: next, syncedMapleId, changed };
}

async function migrate(): Promise<void> {
  await mongoose.connect(config.DATABASE_URL);
  console.log('[migrate-maple-metadata] connected');

  const touchedProjects = new Set<string>();
  let charactersUpdated = 0;
  let itemsUpdated = 0;
  let projectsUpdated = 0;

  const characters = await CharacterModel.find({
    $or: [
      { 'maple.mapleId': { $gt: 0 } },
      { 'maple.exportEnabled': true },
      { customFields: { $exists: true } },
    ],
  });

  for (const character of characters) {
    const assetType: AssetTypeKey = character.kind === 'monster' ? 'monster' : 'npc';
    const migrated = migratedCustomFields(character.customFields, character.maple);
    const legacyId = positiveInt(character.maple?.mapleId);
    const shouldSyncLegacyId = migrated.syncedMapleId > 0 && legacyId !== migrated.syncedMapleId;
    if (!migrated.changed && !shouldSyncLegacyId) continue;

    character.customFields = migrated.customFields;
    character.markModified('customFields');
    if (shouldSyncLegacyId) character.maple.mapleId = migrated.syncedMapleId;
    await character.save();
    charactersUpdated++;
    touchedProjects.add(`${character.projectId}:${assetType}`);
  }

  const items = await ItemModel.find({
    $or: [
      { 'maple.mapleId': { $gt: 0 } },
      { 'maple.exportEnabled': true },
      { customFields: { $exists: true } },
    ],
  });

  for (const item of items) {
    const migrated = migratedCustomFields(item.customFields, item.maple);
    const legacyId = positiveInt(item.maple?.mapleId);
    const shouldSyncLegacyId = migrated.syncedMapleId > 0 && legacyId !== migrated.syncedMapleId;
    if (!migrated.changed && !shouldSyncLegacyId) continue;

    item.customFields = migrated.customFields;
    item.markModified('customFields');
    if (shouldSyncLegacyId) item.maple.mapleId = migrated.syncedMapleId;
    await item.save();
    itemsUpdated++;
    touchedProjects.add(`${item.projectId}:item`);
  }

  for (const key of touchedProjects) {
    const [projectId, assetType] = key.split(':') as [string, AssetTypeKey];
    const project = await ProjectModel.findById(projectId);
    if (!project) continue;
    await ensureProjectSchema(project, assetType);
    projectsUpdated++;
  }

  console.log(`[migrate-maple-metadata] characters updated: ${charactersUpdated}`);
  console.log(`[migrate-maple-metadata] items updated: ${itemsUpdated}`);
  console.log(`[migrate-maple-metadata] project schemas updated: ${projectsUpdated}`);

  await mongoose.disconnect();
  console.log('[migrate-maple-metadata] done');
}

migrate().catch((error) => {
  console.error('[migrate-maple-metadata] failed:', error);
  process.exit(1);
});
