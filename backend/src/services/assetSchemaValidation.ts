import ProjectModel, { IProjectAssetField, IProjectValuePool, ProjectAssetFieldType } from '../models/projectModel';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function valueMatchesType(value: unknown, type: ProjectAssetFieldType): boolean {
  if (isEmpty(value)) return true;
  if (type === 'text' || type === 'date' || type === 'image' || type === 'enum' || type === 'reference') {
    return typeof value === 'string';
  }
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (type === 'list') return Array.isArray(value);
  return true;
}

function valueInRangePool(value: unknown, pool: IProjectValuePool): boolean {
  if (isEmpty(value)) return true;
  if (pool.options?.length) {
    return pool.options.some((option) => option.value === value);
  }
  if (pool.ranges?.length) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    return pool.ranges.some((range) => value >= range.min && value <= range.max);
  }
  return true;
}

function validateFields(
  fields: IProjectAssetField[],
  values: Record<string, unknown>,
  pools: IProjectValuePool[],
  prefix = '',
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    const value = values[field.key];
    if (field.required && isEmpty(value)) {
      errors.push(`${path} is required.`);
      continue;
    }
    if (!field.nullable && value === null) {
      errors.push(`${path} cannot be null.`);
      continue;
    }
    if (!valueMatchesType(value, field.type)) {
      errors.push(`${path} must be ${field.type}.`);
      continue;
    }
    const pool = field.poolKey ? pools.find((entry) => entry.key === field.poolKey) : undefined;
    if (pool) {
      if (field.type === 'list' && Array.isArray(value) && !field.fields?.length) {
        const invalidIndex = value.findIndex((entry) => !valueInRangePool(entry, pool));
        if (invalidIndex >= 0) {
          errors.push(`${path}.${invalidIndex} must use a value from the ${pool.name} pool.`);
          continue;
        }
      } else if (field.type !== 'list' && !valueInRangePool(value, pool)) {
        errors.push(`${path} must use a value from the ${pool.name} pool.`);
        continue;
      }
    }
    if (field.type === 'object' && value && field.fields?.length) {
      errors.push(...validateFields(field.fields, value as Record<string, unknown>, pools, path));
    }
    if (field.type === 'list' && Array.isArray(value) && field.fields?.length) {
      value.forEach((row, index) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          errors.push(...validateFields(field.fields ?? [], row as Record<string, unknown>, pools, `${path}.${index}`));
        }
      });
    }
  }
  return errors;
}

function getNestedValue(root: unknown, path: string[]): unknown {
  let cursor = root;
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function rangePooledFieldPaths(
  fields: IProjectAssetField[],
  pools: IProjectValuePool[],
  prefix: string[] = [],
): Array<{ field: IProjectAssetField; path: string[]; pool: IProjectValuePool }> {
  const result: Array<{ field: IProjectAssetField; path: string[]; pool: IProjectValuePool }> = [];
  for (const field of fields) {
    const path = [...prefix, field.key];
    const pool = field.poolKey ? pools.find((entry) => entry.key === field.poolKey) : undefined;
    if (pool?.ranges?.length && field.type !== 'list' && field.type !== 'object') {
      result.push({ field, path, pool });
    }
    if (field.fields?.length && field.type === 'object') {
      result.push(...rangePooledFieldPaths(field.fields, pools, path));
    }
  }
  return result;
}

async function validateRangePoolUniqueness(args: {
  ownerId: string;
  projectId: string;
  assetType: string;
  assetId?: string;
  values: Record<string, unknown>;
  fields: IProjectAssetField[];
  pools: IProjectValuePool[];
}): Promise<string[]> {
  const errors: string[] = [];
  const pooledFields = rangePooledFieldPaths(args.fields, args.pools);
  if (pooledFields.length === 0) return errors;

  const docs = args.assetType === 'item'
    ? await ItemModel.find({ ownerId: args.ownerId, projectId: args.projectId }).select('customFields name').lean()
    : await CharacterModel.find({ ownerId: args.ownerId, projectId: args.projectId, kind: args.assetType }).select('customFields name').lean();

  for (const { field, path, pool } of pooledFields) {
    const value = getNestedValue(args.values, path);
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    for (const doc of docs) {
      if (args.assetId && String(doc._id) === args.assetId) continue;
      const existingValue = getNestedValue(doc.customFields, path);
      if (existingValue === value) {
        errors.push(`${path.join('.')} is already used by ${doc.name ?? 'another asset'} in the ${pool.name} pool.`);
        break;
      }
    }
  }
  return errors;
}

export async function validateAssetCustomFields(args: {
  ownerId: string;
  projectId: string;
  assetType: string;
  assetId?: string;
  values: Record<string, unknown>;
}): Promise<string[]> {
  const project = await ProjectModel.findOne({ _id: args.projectId, ownerId: args.ownerId }).select('assetSchema').lean();
  if (!project) return ['Project not found.'];
  const schema = project.assetSchema?.assetTypes?.find((entry) => entry.key === args.assetType);
  if (!schema) return [];
  const pools = project.assetSchema?.valuePools ?? [];
  const errors = validateFields(schema.fields ?? [], args.values, pools);
  if (errors.length > 0) return errors;
  return validateRangePoolUniqueness({
    ownerId: args.ownerId,
    projectId: args.projectId,
    assetType: args.assetType,
    assetId: args.assetId,
    values: args.values,
    fields: schema.fields ?? [],
    pools,
  });
}
