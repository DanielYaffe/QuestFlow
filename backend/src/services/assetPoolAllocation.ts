import mongoose from 'mongoose';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import ProjectModel, {
  IMapleIdRange,
  IProject,
  IProjectAssetField,
  IProjectAssetSchema,
  IProjectValuePool,
} from '../models/projectModel';

// ---------------------------------------------------------------------------
// Value-pool allocation.
//
// An asset's attributes are exactly what the project's asset schema declares —
// no field is privileged and none is assumed to exist. A field becomes
// allocatable by being bound to a value pool (`poolKey`), whatever it is called
// and whatever it means.
//
// The pool is the namespace. A value is taken when any asset holds it in any
// field bound to that pool, so an npc and a monster drawing from one pool
// cannot collide, while separate pools never interfere.
// ---------------------------------------------------------------------------

export interface PoolBinding {
  assetType: string;
  path: string[];
}

export interface PoolAllocation {
  value: number;
  /** Empty when `value` is usable. */
  error: string;
}

/** How many random draws before falling back to an ordered scan of the pool. */
const RANDOM_ATTEMPTS = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getPooledValue(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), source);
}

export function setPooledValue(
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return target;
  const [head, ...rest] = path;
  const next = { ...target };
  if (rest.length === 0) {
    next[head] = value;
    return next;
  }
  next[head] = setPooledValue(isRecord(next[head]) ? next[head] : {}, rest, value);
  return next;
}

export function findSchemaField(
  fields: IProjectAssetField[] | undefined,
  path: string[],
): IProjectAssetField | undefined {
  const [head, ...rest] = path;
  const field = (fields ?? []).find((entry) => entry.key === head);
  if (!field) return undefined;
  return rest.length === 0 ? field : findSchemaField(field.fields, rest);
}

export function poolForField(
  schema: IProjectAssetSchema | undefined,
  field: IProjectAssetField | undefined,
): IProjectValuePool | undefined {
  if (!field?.poolKey) return undefined;
  return schema?.valuePools?.find((pool) => pool.key === field.poolKey);
}

/** Every (assetType, field path) in the schema that draws from this pool. */
export function poolBindings(schema: IProjectAssetSchema | undefined, poolKey: string): PoolBinding[] {
  const bindings: PoolBinding[] = [];
  const walk = (assetType: string, fields: IProjectAssetField[] | undefined, prefix: string[]) => {
    for (const field of fields ?? []) {
      const path = [...prefix, field.key];
      if (field.poolKey === poolKey) bindings.push({ assetType, path });
      if (field.fields?.length) walk(assetType, field.fields, path);
    }
  };
  for (const assetType of schema?.assetTypes ?? []) walk(assetType.key, assetType.fields, []);
  return bindings;
}

/** Pooled fields declared on one asset type. */
export function pooledFieldsFor(
  schema: IProjectAssetSchema | undefined,
  assetType: string,
): Array<{ path: string[]; field: IProjectAssetField; pool: IProjectValuePool }> {
  const type = schema?.assetTypes?.find((entry) => entry.key === assetType);
  const result: Array<{ path: string[]; field: IProjectAssetField; pool: IProjectValuePool }> = [];
  const walk = (fields: IProjectAssetField[] | undefined, prefix: string[]) => {
    for (const field of fields ?? []) {
      const path = [...prefix, field.key];
      const pool = poolForField(schema, field);
      if (pool) result.push({ path, field, pool });
      if (field.fields?.length) walk(field.fields, path);
    }
  };
  walk(type?.fields, []);
  return result;
}

function numeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 0;
}

function allocatable(pool: IProjectValuePool | undefined): boolean {
  return Boolean(pool && pool.valueType === 'number' && pool.ranges?.length);
}

/**
 * Every value the project already holds in this pool, across each field bound
 * to it. `excludeAssetId` drops the asset being edited so it does not read as
 * competing with itself.
 */
export async function usedPoolValues(args: {
  projectId: string;
  schema: IProjectAssetSchema | undefined;
  poolKey: string;
  excludeAssetId?: string;
}): Promise<Set<number>> {
  const used = new Set<number>();
  const bindings = poolBindings(args.schema, args.poolKey);
  if (!bindings.length) return used;

  const pathsByAssetType = new Map<string, string[][]>();
  for (const binding of bindings) {
    pathsByAssetType.set(
      binding.assetType,
      [...(pathsByAssetType.get(binding.assetType) ?? []), binding.path],
    );
  }

  for (const [assetType, paths] of pathsByAssetType) {
    const scope: Record<string, unknown> = { projectId: args.projectId };
    if (args.excludeAssetId && mongoose.isValidObjectId(args.excludeAssetId)) {
      scope._id = { $ne: args.excludeAssetId };
    }
    const docs = assetType === 'item'
      ? await ItemModel.find(scope).select('customFields').lean()
      : await CharacterModel.find({ ...scope, kind: assetType }).select('customFields').lean();
    for (const doc of docs) {
      for (const path of paths) {
        const value = numeric(getPooledValue(doc.customFields, path));
        if (value) used.add(value);
      }
    }
  }
  return used;
}

function poolSize(ranges: IMapleIdRange[]): number {
  return ranges.reduce((total, range) => total + (range.max - range.min + 1), 0);
}

function valueAtOffset(ranges: IMapleIdRange[], offset: number): number {
  let remaining = offset;
  for (const range of ranges) {
    const size = range.max - range.min + 1;
    if (remaining < size) return range.min + remaining;
    remaining -= size;
  }
  return 0;
}

/**
 * A free value from `ranges` that nothing in `used` holds, or 0 when the pool is
 * full. Drawn at random: a lowest-first scan hands back the same number on every
 * call until the caller actually saves, which is why Allocate kept offering the
 * floor of the pool.
 */
export function pickFreeValue(ranges: IMapleIdRange[], used: Set<number>): number {
  const ordered = [...(ranges ?? [])]
    .map((range) => ({ min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) }))
    .filter((range) => range.min > 0)
    .sort((a, b) => a.min - b.min);
  const size = poolSize(ordered);
  if (size <= 0) return 0;

  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
    const candidate = valueAtOffset(ordered, Math.floor(Math.random() * size));
    if (candidate && !used.has(candidate)) return candidate;
  }
  // A pool this full is worth scanning rather than guessing at.
  for (let offset = 0; offset < size; offset += 1) {
    const candidate = valueAtOffset(ordered, offset);
    if (candidate && !used.has(candidate)) return candidate;
  }
  return 0;
}

async function loadSchema(projectId: string): Promise<IProjectAssetSchema | undefined> {
  if (!mongoose.isValidObjectId(projectId)) return undefined;
  const project = await ProjectModel.findById(projectId).select('assetSchema').lean() as IProject | null;
  return project?.assetSchema;
}

/**
 * A free value for one pooled field. `taken` lets a caller filling several
 * fields in one pass exclude what it has handed out but not yet written.
 */
export async function allocatePoolValue(args: {
  projectId: string;
  assetType: string;
  path: string[];
  excludeAssetId?: string;
  taken?: Iterable<number>;
  schema?: IProjectAssetSchema;
}): Promise<PoolAllocation> {
  const schema = args.schema ?? await loadSchema(args.projectId);
  const type = schema?.assetTypes?.find((entry) => entry.key === args.assetType);
  const field = findSchemaField(type?.fields, args.path);
  const pool = poolForField(schema, field);
  if (!field || !pool) return { value: 0, error: 'Field is not associated with a value pool.' };
  if (!allocatable(pool)) {
    return { value: 0, error: `Pool "${pool.name}" has no numeric ranges to allocate from.` };
  }

  const used = await usedPoolValues({
    projectId: args.projectId,
    schema,
    poolKey: pool.key,
    excludeAssetId: args.excludeAssetId,
  });
  for (const value of args.taken ?? []) used.add(value);

  const value = pickFreeValue(pool.ranges, used);
  return value
    ? { value, error: '' }
    : { value: 0, error: `No available values remain in the ${pool.name} pool.` };
}

/**
 * Fill every pooled field an asset leaves empty, so a design created by the
 * wizard or an AI edit arrives with the same attributes an author would have
 * allocated by hand. Values already present are the author's and are kept.
 */
export async function allocateAssetFields(args: {
  projectId: string;
  assetType: string;
  values?: Record<string, unknown>;
  /**
   * Values already handed out in this batch. Mutated as more are drawn, so a
   * caller creating several assets in one pass can hand the same set to each
   * call and never see a value reused before it is written.
   */
  taken?: Set<number>;
  schema?: IProjectAssetSchema;
}): Promise<{ values: Record<string, unknown>; allocated: number[]; warnings: string[] }> {
  const schema = args.schema ?? await loadSchema(args.projectId);
  let values: Record<string, unknown> = { ...(args.values ?? {}) };
  const allocated: number[] = [];
  const warnings = new Set<string>();
  const taken = args.taken ?? new Set<number>();

  const pooled = pooledFieldsFor(schema, args.assetType).filter((entry) => allocatable(entry.pool));
  if (!pooled.length) return { values, allocated, warnings: [] };

  // One read per pool rather than per field — several fields may share one.
  const usedByPool = new Map<string, Set<number>>();
  for (const { pool } of pooled) {
    if (usedByPool.has(pool.key)) continue;
    usedByPool.set(pool.key, await usedPoolValues({
      projectId: args.projectId,
      schema,
      poolKey: pool.key,
    }));
  }

  for (const { path, pool } of pooled) {
    const current = numeric(getPooledValue(values, path));
    if (current) {
      usedByPool.get(pool.key)?.add(current);
      taken.add(current);
      continue;
    }
    const used = new Set(usedByPool.get(pool.key) ?? []);
    for (const value of taken) used.add(value);
    const value = pickFreeValue(pool.ranges, used);
    if (!value) {
      warnings.add(`No available values remain in the ${pool.name} pool.`);
      continue;
    }
    values = setPooledValue(values, path, value);
    usedByPool.get(pool.key)?.add(value);
    taken.add(value);
    allocated.push(value);
  }

  return { values, allocated, warnings: [...warnings] };
}
