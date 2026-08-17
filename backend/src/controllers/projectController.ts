import { Response } from 'express';
import { Model } from 'mongoose';
import { z } from 'zod';
import BaseController from './baseController';
import ProjectModel, {
  ensureInboxProject,
  IProjectAssetField,
  IProjectAssetSchema,
  IProjectGitSettings,
  IProjectGitTarget,
  IProjectMapleSettings,
} from '../models/projectModel';
import QuestlineModel from '../models/questlineModel';
import SpriteModel from '../models/spriteModel';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import { AuthRequest } from '../middlewares/authMiddleware';
import { ownsGame } from '../services/gameService';
import { getPresignedUrl } from '../utils/s3Helper';
import { encrypt } from '../utils/encryption';
import { KB_TYPES, collectionName, qdrant } from '../services/qdrant';

interface CountRow {
  _id: string;
  n: number;
}

// S3 keys never start with http — presigned URLs always do
function isS3Key(value: string): boolean {
  return !!value && !value.startsWith('http');
}

// Empty strings are allowed so a field can be cleared. The regexes catch the
// real footguns — spaces and slashes — that otherwise only surface as a cryptic
// GitHub error at push time.
const gitSettingsSchema = z
  .object({
    repoOwner: z.string().trim().max(100)
      .regex(/^[A-Za-z0-9-]*$/, 'Owner may contain only letters, numbers, and hyphens.'),
    repoName: z.string().trim().max(100)
      .regex(/^[A-Za-z0-9._-]*$/, 'Repository may contain only letters, numbers, dots, hyphens, and underscores.'),
    defaultBranch: z.string().trim().max(255)
      .regex(/^\S*$/, 'Branch must not contain spaces.'),
    defaultFilePath: z.string().trim().max(500),
  })
  .partial();

const gitTargetSchema = z.object({
  id: z.string().trim().min(1).max(100)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Target id may contain only letters, numbers, dots, hyphens, and underscores.'),
  name: z.string().trim().min(1).max(120),
  token: z.string().trim().optional(),
  hasToken: z.boolean().optional(),
  repoOwner: z.string().trim().max(100)
    .regex(/^[A-Za-z0-9-]*$/, 'Owner may contain only letters, numbers, and hyphens.')
    .optional(),
  repoName: z.string().trim().max(100)
    .regex(/^[A-Za-z0-9._-]*$/, 'Repository may contain only letters, numbers, dots, hyphens, and underscores.')
    .optional(),
  defaultBranch: z.string().trim().max(255)
    .regex(/^\S*$/, 'Branch must not contain spaces.')
    .optional(),
  defaultFilePath: z.string().trim().max(500).optional(),
});

type GitTargetInput = z.infer<typeof gitTargetSchema>;

// Validates req.body.git when present. Returns the parsed settings, or sends a
// 400 and returns undefined when validation fails.
function parseGitSettings(req: AuthRequest, res: Response): IProjectGitSettings | null | undefined {
  if (req.body.git === undefined || req.body.git === null) return null;
  const result = gitSettingsSchema.safeParse(req.body.git);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid git settings.' });
    return undefined;
  }
  return result.data;
}

function parseGitTargets(req: AuthRequest, res: Response): GitTargetInput[] | null | undefined {
  if (req.body.gitTargets === undefined || req.body.gitTargets === null) return null;
  const result = z.array(gitTargetSchema).max(25).safeParse(req.body.gitTargets);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid GitHub export targets.' });
    return undefined;
  }
  const ids = new Set<string>();
  for (const target of result.data) {
    if (ids.has(target.id)) {
      res.status(400).json({ error: `Duplicate GitHub export target id '${target.id}'.` });
      return undefined;
    }
    ids.add(target.id);
  }
  return result.data;
}

function mergeGitTargets(existing: IProjectGitTarget[] | undefined, incoming: GitTargetInput[]): IProjectGitTarget[] {
  const byId = new Map((existing ?? []).map((target) => [target.id, target]));
  return incoming.map((target) => {
    const previous = byId.get(target.id);
    let encryptedToken = previous?.encryptedToken;
    if (target.token) {
      try {
        encryptedToken = encrypt(target.token);
      } catch {
        throw new Error(`Could not encrypt GitHub token for target "${target.name}". Check ENCRYPTION_KEY.`);
      }
    }
    return {
      id: target.id,
      name: target.name,
      encryptedToken,
      repoOwner: target.repoOwner || undefined,
      repoName: target.repoName || undefined,
      defaultBranch: target.defaultBranch || 'main',
      defaultFilePath: target.defaultFilePath || '',
    };
  });
}

function serializeProject(project: any) {
  const plain = typeof project?.toObject === 'function' ? project.toObject() : project;
  const gitTargets = Array.isArray(plain.gitTargets)
    ? plain.gitTargets.map((target: IProjectGitTarget) => ({
      id: target.id,
      name: target.name,
      hasToken: !!target.encryptedToken,
      repoOwner: target.repoOwner ?? '',
      repoName: target.repoName ?? '',
      defaultBranch: target.defaultBranch ?? 'main',
      defaultFilePath: target.defaultFilePath ?? '',
    }))
    : [];
  return { ...plain, gitTargets };
}

const mapleIdRangeSchema = z.object({
  min: z.number().int().positive(),
  max: z.number().int().positive(),
}).refine((range) => range.max >= range.min, 'Range max must be greater than or equal to min.');

const mapleSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  targetVersion: z.literal('v83').optional(),
  defaultExportMode: z.enum(['changed-only', 'full-snapshot']).optional(),
  npcIdRanges: z.array(mapleIdRangeSchema).optional(),
  itemIdRanges: z.array(mapleIdRangeSchema).optional(),
}).partial();

const assetFieldTypeSchema = z.enum([
  'text',
  'number',
  'boolean',
  'date',
  'object',
  'list',
  'image',
  'enum',
  'reference',
]);

type AssetFieldInput = {
  key: string;
  label: string;
  type: z.infer<typeof assetFieldTypeSchema>;
  required?: boolean;
  nullable?: boolean;
  description?: string;
  poolKey?: string;
  itemType?: z.infer<typeof assetFieldTypeSchema>;
  fields?: AssetFieldInput[];
};

const assetFieldSchema: z.ZodType<AssetFieldInput> = z.lazy(() => z.object({
  key: z.string().trim().min(1).max(100)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Asset field keys may contain only letters, numbers, dots, hyphens, and underscores.'),
  label: z.string().trim().min(1).max(120),
  type: assetFieldTypeSchema,
  required: z.boolean().optional(),
  nullable: z.boolean().optional(),
  description: z.string().trim().max(500).optional(),
  poolKey: z.string().trim().max(100).optional(),
  itemType: assetFieldTypeSchema.optional(),
  fields: z.array(assetFieldSchema).max(100).optional(),
}));

const valuePoolOptionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.union([z.string(), z.number(), z.boolean()]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const valuePoolSchema = z.object({
  key: z.string().trim().min(1).max(100)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Pool keys may contain only letters, numbers, dots, hyphens, and underscores.'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  valueType: z.enum(['text', 'number', 'boolean']).optional(),
  options: z.array(valuePoolOptionSchema).max(1000).optional(),
  ranges: z.array(mapleIdRangeSchema).max(100).optional(),
});

const assetSchemaSchema = z.object({
  assetTypes: z.array(z.object({
    key: z.string().trim().min(1).max(100)
      .regex(/^[A-Za-z0-9_.-]+$/, 'Asset type keys may contain only letters, numbers, dots, hyphens, and underscores.'),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    fields: z.array(assetFieldSchema).max(200).optional(),
  })).max(50).optional(),
  valuePools: z.array(valuePoolSchema).max(100).optional(),
}).partial();

function parseMapleSettings(req: AuthRequest, res: Response): Partial<IProjectMapleSettings> | null | undefined {
  if (req.body.mapleSettings === undefined || req.body.mapleSettings === null) return null;
  const result = mapleSettingsSchema.safeParse(req.body.mapleSettings);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid Maple settings.' });
    return undefined;
  }
  return result.data;
}

function parseAssetSchema(req: AuthRequest, res: Response): Partial<IProjectAssetSchema> | null | undefined {
  if (req.body.assetSchema === undefined || req.body.assetSchema === null) return null;
  const result = assetSchemaSchema.safeParse(req.body.assetSchema);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid asset schema.' });
    return undefined;
  }
  const normalizeField = (field: AssetFieldInput): IProjectAssetField => ({
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required ?? false,
    nullable: field.nullable ?? true,
    description: field.description ?? '',
    poolKey: field.poolKey ?? '',
    itemType: field.itemType,
    fields: field.fields?.map(normalizeField) ?? [],
  });
  return {
    assetTypes: result.data.assetTypes?.map((assetType) => ({
      key: assetType.key,
      name: assetType.name,
      description: assetType.description ?? '',
      fields: assetType.fields?.map(normalizeField) ?? [],
    })),
    valuePools: result.data.valuePools?.map((pool) => ({
      ...pool,
      description: pool.description ?? '',
      valueType: pool.valueType ?? 'text',
      options: pool.options ?? [],
      ranges: pool.ranges ?? [],
    })),
  };
}

function pathFromRequest(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((part) => String(part).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split('.').map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function getNestedValue(root: unknown, path: string[]): unknown {
  let cursor = root;
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function flattenNumericFields(value: unknown, prefix = '', out: Array<{ path: string; value: number }> = []): Array<{ path: string; value: number }> {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push({ path: prefix, value });
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenNumericFields(entry, `${prefix}.${index}`, out));
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flattenNumericFields(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function splitIdentifierTokens(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[^a-zA-Z0-9]+/)
      .map((token) => token.toLowerCase())
      .filter(Boolean),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (b.has(token)) return true;
  }
  return false;
}

function fieldLooksRelatedToPool(path: string, field: IProjectAssetField, poolName: string, poolKey: string): boolean {
  const pathTokens = splitIdentifierTokens(path);
  const fieldTokens = splitIdentifierTokens([field.key, field.label, field.description].filter(Boolean).join(' '));
  const poolTokens = splitIdentifierTokens(`${poolName} ${poolKey}`);
  return tokenOverlap(pathTokens, fieldTokens) || tokenOverlap(pathTokens, poolTokens);
}

function isInsideRanges(value: number, ranges: Array<{ min: number; max: number }>): boolean {
  return ranges.some((range) => value >= range.min && value <= range.max);
}

async function collectKbReservedPoolValues(
  gameId: string | undefined,
  field: IProjectAssetField,
  pool: { key: string; name: string; ranges: Array<{ min: number; max: number }> },
): Promise<Set<number>> {
  const reserved = new Set<number>();
  if (!gameId || !pool.ranges.length) return reserved;

  for (const type of KB_TYPES) {
    const collection = collectionName(gameId, type);
    let offset: unknown = undefined;
    do {
      const result = await qdrant
        .scroll(collection, {
          limit: 256,
          offset: offset as never,
          with_payload: true,
          with_vector: false,
        })
        .catch(() => null);
      if (!result || !Array.isArray(result.points)) break;

      for (const point of result.points) {
        const payload = point.payload;
        if (!payload || typeof payload !== 'object') continue;
        const fields = (payload as Record<string, unknown>).fields;
        if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
        for (const entry of flattenNumericFields(fields)) {
          if (!isInsideRanges(entry.value, pool.ranges)) continue;
          if (fieldLooksRelatedToPool(entry.path, field, pool.name, pool.key)) {
            reserved.add(entry.value);
          }
        }
      }
      offset = (result as { next_page_offset?: unknown }).next_page_offset;
    } while (offset !== undefined && offset !== null);
  }
  return reserved;
}

function findAssetField(fields: IProjectAssetField[], path: string[]): IProjectAssetField | null {
  if (path.length === 0) return null;
  const [head, ...tail] = path;
  const field = fields.find((entry) => entry.key === head);
  if (!field) return null;
  if (tail.length === 0) return field;
  return findAssetField(field.fields ?? [], tail);
}

class ProjectController extends BaseController {
  constructor() {
    super(ProjectModel);
  }

  // GET /projects — list projects owned by the user, with questline/sprite/character
  // counts. Guarantees the auto-created "Inbox" project exists so the list is never empty.
  async get(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      await ensureInboxProject(userId);
      const projects = await ProjectModel.find({ ownerId: userId })
        .sort({ isInbox: -1, updatedAt: -1 })
        .lean();
      const ids = projects.map((p) => p._id.toString());

      const countBy = (model: Model<any>) =>
        model.aggregate<CountRow>([
          { $match: { ownerId: userId, projectId: { $in: ids } } },
          { $group: { _id: '$projectId', n: { $sum: 1 } } },
        ]);

      const [qlCounts, spriteCounts, charCounts] = await Promise.all([
        countBy(QuestlineModel),
        countBy(SpriteModel),
        countBy(CharacterModel),
      ]);
      const qlMap = new Map(qlCounts.map((c) => [c._id, c.n]));
      const spriteMap = new Map(spriteCounts.map((c) => [c._id, c.n]));
      const charMap = new Map(charCounts.map((c) => [c._id, c.n]));

      // No .select() above, so each project carries its `git` settings through
      // to the list — the per-project repo editor needs them.
      res.json(
        projects.map((p) => ({
          ...serializeProject(p),
          questlineCount: qlMap.get(p._id.toString()) ?? 0,
          spriteCount: spriteMap.get(p._id.toString()) ?? 0,
          characterCount: charMap.get(p._id.toString()) ?? 0,
        })),
      );
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
        return;
      }
      this.handleError(res, error);
    }
  }

  // GET /projects/:id/rewards — the project's Item collection (rewards ARE
  // items now), shaped for the dashboard/Items page. questlineId/Title point at
  // the most recently updated questline referencing the item ('' when unused).
  async getRewards(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const project = await ProjectModel.findById(req.params.id).select('ownerId').lean();
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (project.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const [items, questlines] = await Promise.all([
        ItemModel.find({ projectId: req.params.id }).sort({ updatedAt: -1 }).lean(),
        QuestlineModel.find({ projectId: req.params.id })
          .select('title itemIds')
          .sort({ updatedAt: -1 })
          .lean(),
      ]);

      const questlineByItem = new Map<string, { id: string; title: string }>();
      for (const ql of questlines) {
        for (const itemId of ql.itemIds ?? []) {
          if (!questlineByItem.has(itemId)) {
            questlineByItem.set(itemId, { id: ql._id.toString(), title: ql.title });
          }
        }
      }

      const rewards = await Promise.all(
        items.map(async (i) => {
          const candidates = i.assets?.rawSpriteCandidates ?? [];
          const spriteKey = i.assets?.snappedSpriteS3Key || candidates[candidates.length - 1] || '';
          const usedIn = questlineByItem.get(i._id.toString());
          return {
            _id:            i._id.toString(),
            title:          i.name,
            description:    i.description ?? '',
            rarity:         i.rarity ?? 'common',
            imageUrl:       spriteKey && isS3Key(spriteKey) ? await getPresignedUrl(spriteKey) : '',
            kbRef:          i.kbRef ?? '',
            itemId:         i._id.toString(),
            questlineId:    usedIn?.id ?? '',
            questlineTitle: usedIn?.title ?? '',
          };
        }),
      );
      res.json(rewards);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
        return;
      }
      this.handleError(res, error);
    }
  }

  // GET /projects/:id — single project (owner only)
  async getById(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const project = await ProjectModel.findById(req.params.id).lean();
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (project.ownerId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.json(serializeProject(project));
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /projects/:id/asset-pools/allocate — generic project pool allocator.
  // Returns the first unused numeric value from the pool attached to a schema field.
  async allocateAssetPoolValue(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const assetType = typeof req.body.assetType === 'string' ? req.body.assetType.trim() : '';
    const fieldPath = pathFromRequest(req.body.fieldPath);
    const excludeAssetId = typeof req.body.assetId === 'string' ? req.body.assetId : '';
    if (!assetType || fieldPath.length === 0) {
      res.status(400).json({ error: 'assetType and fieldPath are required.' });
      return;
    }

    try {
      const project = await ProjectModel.findById(req.params.id).select('ownerId gameId assetSchema').lean();
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (project.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const assetSchema = project.assetSchema?.assetTypes?.find((entry) => entry.key === assetType);
      const field = assetSchema ? findAssetField(assetSchema.fields ?? [], fieldPath) : null;
      const pool = field?.poolKey
        ? project.assetSchema?.valuePools?.find((entry) => entry.key === field.poolKey)
        : null;
      if (!field || !pool) {
        res.status(400).json({ error: 'Field is not associated with a value pool.' });
        return;
      }
      if (pool.valueType !== 'number' || !pool.ranges?.length) {
        res.status(400).json({ error: 'Only numeric range pools can allocate values.' });
        return;
      }

      const idFilter = excludeAssetId ? { _id: { $ne: excludeAssetId } } : {};
      const docs = assetType === 'item'
        ? await ItemModel.find({ ownerId: userId, projectId: req.params.id, ...idFilter }).select('customFields').lean()
        : await CharacterModel.find({ ownerId: userId, projectId: req.params.id, kind: assetType, ...idFilter }).select('customFields').lean();
      const used = new Set<number>();
      for (const doc of docs) {
        const value = getNestedValue(doc.customFields, fieldPath);
        if (typeof value === 'number' && Number.isFinite(value)) used.add(value);
      }
      const nativeReserved = await collectKbReservedPoolValues(project.gameId, field, {
        key: pool.key,
        name: pool.name,
        ranges: pool.ranges ?? [],
      });
      nativeReserved.forEach((value) => used.add(value));

      const ranges = [...pool.ranges].sort((a, b) => a.min - b.min);
      for (const range of ranges) {
        for (let candidate = range.min; candidate <= range.max; candidate += 1) {
          if (!used.has(candidate)) {
            res.json({ value: candidate, poolKey: pool.key, fieldPath: fieldPath.join('.') });
            return;
          }
        }
      }
      res.status(409).json({ error: `No available values remain in the ${pool.name} pool.` });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
        return;
      }
      this.handleError(res, error);
    }
  }

  // POST /projects — create a project (ownerId from JWT; isInbox is never user-settable)
  async create(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const git = parseGitSettings(req, res);
    if (git === undefined) return;
    const gitTargets = parseGitTargets(req, res);
    if (gitTargets === undefined) return;
    const mapleSettings = parseMapleSettings(req, res);
    if (mapleSettings === undefined) return;
    const assetSchema = parseAssetSchema(req, res);
    if (assetSchema === undefined) return;
    try {
      const { name, description, defaultThemeId, defaultExportFormat, defaultQuestExportTargetId, defaultAssetExportTargetId } = req.body as {
        name?: string;
        description?: string;
        defaultThemeId?: string;
        defaultExportFormat?: string;
        defaultQuestExportTargetId?: string;
        defaultAssetExportTargetId?: string;
      };
      if (!name?.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const project = await ProjectModel.create({
        ownerId: userId,
        name: name.trim(),
        description: description ?? '',
        defaultThemeId: defaultThemeId ?? 'generic_rpg',
        defaultExportFormat: defaultExportFormat ?? 'json',
        isInbox: false,
        git: git ?? undefined,
        gitTargets: gitTargets ? mergeGitTargets([], gitTargets) : [],
        defaultQuestExportTargetId: defaultQuestExportTargetId ?? '',
        defaultAssetExportTargetId: defaultAssetExportTargetId ?? '',
        ...(assetSchema ? { assetSchema } : {}),
        ...(mapleSettings ? { mapleSettings } : {}),
      });
      res.status(201).json(serializeProject(project));
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
        return;
      }
      this.handleError(res, error);
    }
  }

  // PUT /projects/:id — owner only (rename / edit description / set defaults / set repo)
  async put(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    const git = parseGitSettings(req, res);
    if (git === undefined) return;
    const gitTargets = parseGitTargets(req, res);
    if (gitTargets === undefined) return;
    const mapleSettings = parseMapleSettings(req, res);
    if (mapleSettings === undefined) return;
    const assetSchema = parseAssetSchema(req, res);
    if (assetSchema === undefined) return;
    try {
      const project = await ProjectModel.findById(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (project.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const { name, description, defaultThemeId, defaultExportFormat, gameId, defaultQuestExportTargetId, defaultAssetExportTargetId } = req.body as {
        name?: string;
        description?: string;
        defaultThemeId?: string;
        defaultExportFormat?: string;
        gameId?: string;
        defaultQuestExportTargetId?: string;
        defaultAssetExportTargetId?: string;
      };
      if (name !== undefined) project.name = name;
      if (description !== undefined) project.description = description;
      if (defaultThemeId !== undefined) project.defaultThemeId = defaultThemeId;
      if (defaultExportFormat !== undefined) project.defaultExportFormat = defaultExportFormat;
      if (gameId !== undefined) {
        // '' clears the link; a non-empty id must be a Game the user owns.
        if (gameId !== '' && !(userId && await ownsGame(userId, gameId))) {
          res.status(403).json({ error: 'Game not found or not owned by you' });
          return;
        }
        project.gameId = gameId;
      }
      if (git) {
        // Field-level merge so callers can patch a single repo setting without
        // clobbering the rest.
        const existing = project.git;
        project.git = {
          repoOwner:       git.repoOwner       ?? existing?.repoOwner,
          repoName:        git.repoName        ?? existing?.repoName,
          defaultBranch:   git.defaultBranch   ?? existing?.defaultBranch,
          defaultFilePath: git.defaultFilePath ?? existing?.defaultFilePath,
        };
        project.markModified('git');
      }
      if (gitTargets) {
        project.gitTargets = mergeGitTargets(project.gitTargets, gitTargets);
        const targetIds = new Set(project.gitTargets.map((target) => target.id));
        if (project.defaultQuestExportTargetId && !targetIds.has(project.defaultQuestExportTargetId)) {
          project.defaultQuestExportTargetId = '';
        }
        if (project.defaultAssetExportTargetId && !targetIds.has(project.defaultAssetExportTargetId)) {
          project.defaultAssetExportTargetId = '';
        }
        project.markModified('gitTargets');
      }
      if (defaultQuestExportTargetId !== undefined) project.defaultQuestExportTargetId = defaultQuestExportTargetId;
      if (defaultAssetExportTargetId !== undefined) project.defaultAssetExportTargetId = defaultAssetExportTargetId;
      if (mapleSettings) {
        project.mapleSettings = {
          enabled: mapleSettings.enabled ?? project.mapleSettings?.enabled ?? false,
          targetVersion: mapleSettings.targetVersion ?? project.mapleSettings?.targetVersion ?? 'v83',
          defaultExportMode: mapleSettings.defaultExportMode ?? project.mapleSettings?.defaultExportMode ?? 'changed-only',
          npcIdRanges: mapleSettings.npcIdRanges ?? project.mapleSettings?.npcIdRanges ?? [],
          itemIdRanges: mapleSettings.itemIdRanges ?? project.mapleSettings?.itemIdRanges ?? [],
        };
        project.markModified('mapleSettings');
      }
      if (assetSchema) {
        project.assetSchema = {
          assetTypes: assetSchema.assetTypes ?? project.assetSchema?.assetTypes ?? [],
          valuePools: assetSchema.valuePools ?? project.assetSchema?.valuePools ?? [],
        };
        project.markModified('assetSchema');
      }
      await project.save();
      res.json(serializeProject(project));
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
        return;
      }
      this.handleError(res, error);
    }
  }

  // DELETE /projects/:id — owner only. The Inbox cannot be deleted; deleting a normal
  // project reassigns its questlines + sprites + characters to the Inbox (no data loss).
  async delete(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const project = await ProjectModel.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (project.ownerId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (project.isInbox) {
        return res.status(400).json({ error: 'The Inbox project cannot be deleted' });
      }

      const inbox = await ensureInboxProject(userId);
      const inboxId = inbox._id.toString();
      const projectId = project._id.toString();

      await Promise.all([
        QuestlineModel.updateMany({ projectId }, { projectId: inboxId }),
        SpriteModel.updateMany({ projectId }, { projectId: inboxId }),
        CharacterModel.updateMany({ projectId }, { projectId: inboxId }),
        ItemModel.updateMany({ projectId }, { projectId: inboxId }),
      ]);
      await ProjectModel.findByIdAndDelete(projectId);

      return res.json({ message: 'Project deleted; its questlines, sprites, characters and items moved to Inbox' });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // POST /projects/:id/duplicate — deep-clone a project and all its content
  async duplicate(req: AuthRequest, res: Response) {
    const userId = req.user?._id;
    try {
      const source = await ProjectModel.findById(req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (source.ownerId !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const copy = await ProjectModel.create({
        ownerId:             userId,
        name:                req.body.name?.trim() || `${source.name} (copy)`,
        description:         source.description,
        defaultThemeId:      source.defaultThemeId,
        defaultExportFormat: source.defaultExportFormat,
        isInbox:             false,
        assetSchema:         source.assetSchema ? {
          assetTypes: source.assetSchema.assetTypes ?? [],
          valuePools: source.assetSchema.valuePools ?? [],
        } : undefined,
        mapleSettings:       source.mapleSettings ? {
          enabled:           source.mapleSettings.enabled,
          targetVersion:     source.mapleSettings.targetVersion,
          defaultExportMode: source.mapleSettings.defaultExportMode,
          npcIdRanges:       source.mapleSettings.npcIdRanges,
          itemIdRanges:      source.mapleSettings.itemIdRanges,
        } : undefined,
        git:                 source.git ? {
          repoOwner:       source.git.repoOwner,
          repoName:        source.git.repoName,
          defaultBranch:   source.git.defaultBranch,
          defaultFilePath: source.git.defaultFilePath,
        } : undefined,
        gitTargets:          source.gitTargets?.map((target) => ({
          id:              target.id,
          name:            target.name,
          encryptedToken:  target.encryptedToken,
          repoOwner:       target.repoOwner,
          repoName:        target.repoName,
          defaultBranch:   target.defaultBranch,
          defaultFilePath: target.defaultFilePath,
        })) ?? [],
        defaultQuestExportTargetId: source.defaultQuestExportTargetId,
        defaultAssetExportTargetId: source.defaultAssetExportTargetId,
      });
      const newProjectId = copy._id.toString();
      const sourceId = source._id.toString();

      // Strip identity/timestamp fields so Mongo assigns fresh ones on insert.
      const stripForClone = (doc: Record<string, unknown>) => {
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        return { ...rest, projectId: newProjectId };
      };

      const cloneInto = async (model: Model<any>) => {
        const docs = await model.find({ ownerId: userId, projectId: sourceId }).lean();
        if (docs.length > 0) {
          await model.insertMany(docs.map((d: Record<string, unknown>) => stripForClone(d)));
        }
      };

      await Promise.all([
        cloneInto(QuestlineModel),
        cloneInto(SpriteModel),
        cloneInto(CharacterModel),
        cloneInto(ItemModel),
      ]);

      res.status(201).json(serializeProject(copy));
    } catch (error) {
      this.handleError(res, error);
    }
  }
}

/**
 * Backward-compat migration: ensure every owner with content has an Inbox project
 * and reassign any orphaned questlines / sprites / characters (missing or empty
 * projectId) to it. Runs once on startup so the multi-project feature is
 * compatible with data created before projects existed.
 */
export async function ensureDefaultProjects(): Promise<void> {
  const [questlineOwners, spriteOwners, characterOwners, itemOwners] = await Promise.all([
    QuestlineModel.distinct('ownerId'),
    SpriteModel.distinct('ownerId'),
    CharacterModel.distinct('ownerId'),
    ItemModel.distinct('ownerId'),
  ]);
  const owners = [...new Set([...questlineOwners, ...spriteOwners, ...characterOwners, ...itemOwners])].filter(Boolean) as string[];

  for (const ownerId of owners) {
    const inbox = await ensureInboxProject(ownerId);
    const projectId = inbox._id.toString();
    const orphanFilter = { ownerId, $or: [{ projectId: { $exists: false } }, { projectId: '' }] };

    await Promise.all([
      QuestlineModel.updateMany(orphanFilter, { $set: { projectId } }),
      SpriteModel.updateMany(orphanFilter, { $set: { projectId } }),
      CharacterModel.updateMany(orphanFilter, { $set: { projectId } }),
      ItemModel.updateMany(orphanFilter, { $set: { projectId } }),
    ]);
  }
}

export default new ProjectController();
