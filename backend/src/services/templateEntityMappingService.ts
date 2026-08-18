import mongoose from 'mongoose';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import KbDocumentModel from '../models/kbDocumentModel';
import TemplateKbMappingModel, { ITemplateKbMappingEntry } from '../models/templateKbMappingModel';
import { parseCollectionFile } from './structuredParse';
import { collectionName, KbType, qdrant } from './qdrant';

export type TemplateMappingEntry = Pick<
  ITemplateKbMappingEntry,
  'templatePath' | 'kbType' | 'kbFieldPath' | 'valueType' | 'purpose' | 'explanation'
>;

export type EntityValueOrigin = 'project' | 'kb';

export interface NormalizedMappedEntity {
  refId: string;
  kbType: KbType;
  name: string;
  role?: string;
  /** Author-authored fields on the Studio design. Outrank everything. */
  projectFields?: Record<string, unknown>;
  kbFields?: Record<string, unknown>;
  /**
   * Identity synthesized from `maple.mapleId` — itself a copy of a KB id taken
   * when the design was materialized. Consulted last, because a copy taken
   * before the KB file was re-uploaded is exactly the stale value the live KB
   * should be correcting.
   */
  canonicalFields?: Record<string, unknown>;
  kbRole?: string;
  kbRef?: string;
  hasProjectSource: boolean;
}

export interface MappedEntitySeed {
  refId: string;
  kbType: KbType;
  name: string;
  role?: string;
  projectFields?: Record<string, unknown>;
  canonicalFields?: Record<string, unknown>;
  /** Either a canonical entity name or the persisted "{gameId}:{entityName}" tag. */
  kbRef?: string;
  hasProjectSource?: boolean;
}

export interface TemplateMappingState {
  values: Record<string, unknown>;
  sources: Record<string, unknown>;
  warnings: string[];
}

export interface ExactKbEntity {
  name: string;
  role?: string;
  fields: Record<string, unknown>;
}

interface ReadMappedValue {
  value: unknown;
  origin: EntityValueOrigin;
}

const CASTABLE_KB_TYPES = new Set<KbType>(['characters', 'monsters', 'items']);

// A quest node is handed out by one NPC, so a character mapping fills every row
// of an array with the same value however many characters the node casts.
// Monsters and items genuinely differ per row — three of one mob, five of
// another — and keep the row-per-entity layout.
const SINGLE_SPEAKER_KB_TYPES = new Set<KbType>(['characters']);

export async function loadValidatedTemplateMappings(args: {
  ownerId: string;
  gameId?: string;
  templateId?: string;
}): Promise<TemplateMappingEntry[]> {
  if (!args.gameId || !args.templateId) return [];
  const mapping = await TemplateKbMappingModel.findOne({
    ownerId: args.ownerId,
    gameId: args.gameId,
    templateId: args.templateId,
  }).lean();
  return (mapping?.entries ?? [])
    .filter((entry) => entry.status === 'validated')
    .map((entry) => ({
      templatePath: entry.templatePath,
      kbType: entry.kbType,
      kbFieldPath: entry.kbFieldPath,
      valueType: entry.valueType,
      purpose: entry.purpose,
      explanation: entry.explanation,
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPath(root: unknown, path: string): unknown {
  if (!path) return root;
  return path.split('.').reduce<unknown>((current, part) => {
    if (!isRecord(current)) return undefined;
    return current[part];
  }, root);
}

function present(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function cleanKbFieldPath(path: string): string {
  return path.startsWith('fields.') ? path.slice('fields.'.length) : path;
}

/** The design's stored id, offered only when neither the author nor the KB has one. */
function canonicalFieldsFromMapleId(mapleId: unknown): Record<string, unknown> | undefined {
  const id = typeof mapleId === 'number' && Number.isInteger(mapleId) && mapleId > 0 ? mapleId : 0;
  return id ? { id, mapleId: id } : undefined;
}

function parseArrayItemPath(path: string): { arrayPath: string; itemPath: string } | null {
  const marker = '[].';
  const index = path.indexOf(marker);
  if (index < 0) return null;
  const arrayPath = path.slice(0, index);
  const itemPath = path.slice(index + marker.length);
  return arrayPath && itemPath && !itemPath.includes('.') ? { arrayPath, itemPath } : null;
}

function sourceKind(source: unknown): string | undefined {
  return isRecord(source) && typeof source.source === 'string' ? source.source : undefined;
}

function isManualPath(sources: Record<string, unknown>, templatePath: string): boolean {
  if (sourceKind(sources[templatePath]) === 'manual') return true;
  const parsed = parseArrayItemPath(templatePath);
  return parsed ? sourceKind(sources[parsed.arrayPath]) === 'manual' : false;
}

function entityNameFromKbRef(gameId: string, kbRef: string | undefined): string | undefined {
  const ref = stringField(kbRef);
  if (!ref) return undefined;
  const separator = ref.indexOf(':');
  if (separator < 0) return ref;
  return ref.slice(0, separator) === gameId ? stringField(ref.slice(separator + 1)) : undefined;
}

// ---------------------------------------------------------------------------
// Exact entity lookup.
//
// A KB entity's canonical id is identity data: it ends up in an exported quest
// and has to be the id the game actually uses. Qdrant's payload is a *derived*
// copy of the source document, written at embed time — re-uploading a document
// with richer fields leaves the old payload in place until a re-embed runs, and
// points orphaned by a deleted document survive indefinitely. Reading identity
// from that copy silently exports stale or missing ids.
//
// So the source document in Mongo is consulted first and the vector payload is
// only a fallback. Retrieval still runs entirely off Qdrant; this path is about
// exactness, not similarity.
// ---------------------------------------------------------------------------

interface KbEntityIndex {
  /** Doc ids + mtimes — any ingest, edit, or delete changes this. */
  fingerprint: string;
  byName: Map<string, ExactKbEntity>;
}

// Parsing a full collection file is expensive enough that materializing a batch
// of designs must not redo it per proposal, and cheap enough that a fingerprint
// check per call is the right invalidation.
const entityIndexCache = new Map<string, KbEntityIndex>();
const MAX_CACHED_INDEXES = 8;

async function loadKbEntityIndex(gameId: string, kbType: KbType): Promise<Map<string, ExactKbEntity>> {
  const cacheKey = `${gameId}:${kbType}`;
  const docs = await KbDocumentModel.find({ gameId, type: kbType, status: 'ready' })
    .select('updatedAt')
    .sort({ updatedAt: -1 })
    .lean();
  const fingerprint = docs.map((doc) => `${String(doc._id)}@${doc.updatedAt?.getTime() ?? 0}`).join(',');

  const cached = entityIndexCache.get(cacheKey);
  if (cached?.fingerprint === fingerprint) return cached.byName;

  const byName = new Map<string, ExactKbEntity>();
  if (docs.length) {
    // Newest first, and first writer wins — a superseded document that still
    // names the same entity cannot shadow the current one.
    const texts = await KbDocumentModel.find({ _id: { $in: docs.map((doc) => doc._id) } })
      .select('originalText updatedAt')
      .sort({ updatedAt: -1 })
      .lean();
    for (const doc of texts) {
      for (const entity of parseCollectionFile(doc.originalText) ?? []) {
        if (!byName.has(entity.name)) {
          byName.set(entity.name, { name: entity.name, role: entity.role, fields: entity.fields });
        }
      }
    }
  }

  if (entityIndexCache.size >= MAX_CACHED_INDEXES) entityIndexCache.clear();
  entityIndexCache.set(cacheKey, { fingerprint, byName });
  return byName;
}

export async function loadExactKbEntity(
  gameId: string,
  kbType: KbType,
  entityName: string,
): Promise<ExactKbEntity | undefined> {
  if (!mongoose.isValidObjectId(gameId) || !entityName.trim()) return undefined;
  const fromSource = (await loadKbEntityIndex(gameId, kbType)).get(entityName.trim());
  if (fromSource) return fromSource;
  return loadKbEntityFromVectors(gameId, kbType, entityName);
}

/** Fallback for entities whose source document no longer parses as a collection. */
async function loadKbEntityFromVectors(
  gameId: string,
  kbType: KbType,
  entityName: string,
): Promise<ExactKbEntity | undefined> {
  const result = await qdrant.scroll(collectionName(gameId, kbType), {
    filter: { must: [{ key: 'entity', match: { value: entityName.trim() } }] },
    limit: 10,
    with_payload: true,
  }).catch(() => null);
  const points = Array.isArray(result?.points) ? result.points : [];
  const candidates = points.flatMap((point) => {
    const payload = point.payload;
    if (!isRecord(payload)) return [];
    const name = stringField(payload.entity);
    const docId = stringField(payload.docId);
    if (!name || !docId || name !== entityName.trim()) return [];
    return [{
      name,
      docId,
      role: stringField(payload.entityRole),
      fields: isRecord(payload.fields) ? payload.fields : {},
    }];
  });
  if (!candidates.length) return undefined;

  const readyDocIds = await KbDocumentModel.find({
    _id: { $in: candidates.map((candidate) => candidate.docId) },
    gameId,
    type: kbType,
    status: 'ready',
  }).distinct('_id');
  const ready = new Set(readyDocIds.map(String));
  const candidate = candidates.find((entry) => ready.has(entry.docId));
  return candidate ? { name: candidate.name, role: candidate.role, fields: candidate.fields } : undefined;
}

/**
 * Load project-scoped designs and enrich KB-backed designs by exact entity name.
 * Client-supplied ids are always constrained by owner and project.
 */
export async function loadMappedProjectEntities(args: {
  ownerId: string;
  projectId: string;
  gameId: string;
  refIds: string[];
}): Promise<NormalizedMappedEntity[]> {
  const ids = [...new Set(args.refIds)].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return [];
  const [characters, items] = await Promise.all([
    CharacterModel.find({
      _id: { $in: ids },
      ownerId: args.ownerId,
      projectId: args.projectId,
    }).select('name kind customFields kbRef maple.mapleId').lean(),
    ItemModel.find({
      _id: { $in: ids },
      ownerId: args.ownerId,
      projectId: args.projectId,
    }).select('name customFields kbRef maple.mapleId').lean(),
  ]);
  const seeds: MappedEntitySeed[] = [
    ...characters.map((character) => ({
      refId: String(character._id),
      kbType: character.kind === 'monster' ? 'monsters' as const : 'characters' as const,
      name: character.name,
      projectFields: isRecord(character.customFields) ? character.customFields : {},
      canonicalFields: canonicalFieldsFromMapleId(character.maple?.mapleId),
      kbRef: character.kbRef,
      hasProjectSource: true,
    })),
    ...items.map((item) => ({
      refId: String(item._id),
      kbType: 'items' as const,
      name: item.name,
      projectFields: isRecord(item.customFields) ? item.customFields : {},
      canonicalFields: canonicalFieldsFromMapleId(item.maple?.mapleId),
      kbRef: item.kbRef,
      hasProjectSource: true,
    })),
  ];
  return enrichMappedEntitySeeds({ gameId: args.gameId, seeds });
}

/** Enrich wizard/temp-id seeds with exact KB fields without relying on semantic retrieval. */
export async function enrichMappedEntitySeeds(args: {
  gameId: string;
  seeds: MappedEntitySeed[];
}): Promise<NormalizedMappedEntity[]> {
  const cache = new Map<string, Promise<ExactKbEntity | undefined>>();
  const lookup = (type: KbType, name: string) => {
    const key = `${type}:${name}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = loadExactKbEntity(args.gameId, type, name);
    cache.set(key, pending);
    return pending;
  };

  return Promise.all(args.seeds.map(async (seed) => {
    const exactName = entityNameFromKbRef(args.gameId, seed.kbRef);
    const kbEntity = exactName ? await lookup(seed.kbType, exactName) : undefined;
    return {
      refId: seed.refId,
      kbType: seed.kbType,
      name: seed.name,
      role: seed.role,
      projectFields: seed.projectFields,
      canonicalFields: seed.canonicalFields,
      kbFields: kbEntity?.fields,
      kbRole: kbEntity?.role,
      kbRef: seed.kbRef,
      hasProjectSource: seed.hasProjectSource ?? Boolean(seed.projectFields),
    };
  }));
}

/** Convert already-retrieved KB candidates into normalized, non-project entities. */
export function normalizeReferenceEntities(
  entities: Array<{ name: string; role?: string; type: KbType; fields?: Record<string, unknown> }>,
): NormalizedMappedEntity[] {
  return entities.map((entity, index) => ({
    refId: `kb:${entity.type}:${index}:${entity.name}`,
    kbType: entity.type,
    name: entity.name,
    role: entity.role,
    kbFields: entity.fields,
    kbRole: entity.role,
    hasProjectSource: false,
  }));
}

export function readMappedEntityValue(entity: NormalizedMappedEntity, kbFieldPath: string): ReadMappedValue | undefined {
  if (kbFieldPath === 'entity.name') {
    return { value: entity.name, origin: entity.hasProjectSource ? 'project' : 'kb' };
  }
  if (kbFieldPath === 'entity.role') {
    const projectRole = readPath(entity.projectFields, 'role');
    if (present(projectRole)) return { value: projectRole, origin: 'project' };
    const role = entity.kbRole ?? entity.role;
    return present(role) ? { value: role, origin: 'kb' } : undefined;
  }

  const cleanPath = cleanKbFieldPath(kbFieldPath);
  const read = (fields: Record<string, unknown> | undefined) =>
    readPath(fields, cleanPath) ?? readPath(fields, kbFieldPath);

  const projectValue = read(entity.projectFields);
  if (present(projectValue)) return { value: projectValue, origin: 'project' };
  const kbValue = read(entity.kbFields);
  if (present(kbValue)) return { value: kbValue, origin: 'kb' };
  const canonicalValue = read(entity.canonicalFields);
  return present(canonicalValue) ? { value: canonicalValue, origin: 'project' } : undefined;
}

function coerceMappedValue(value: unknown, valueType: TemplateMappingEntry['valueType']): unknown {
  if (valueType === 'string') {
    return typeof value === 'string' ? value : String(value);
  }
  if (valueType === 'number') {
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (valueType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    return undefined;
  }
  if (valueType === 'array') return Array.isArray(value) ? value : undefined;
  if (valueType === 'object') return isRecord(value) ? value : undefined;
  return value;
}

function readMappingValue(entity: NormalizedMappedEntity, mapping: TemplateMappingEntry): ReadMappedValue | undefined {
  const mapped = readMappedEntityValue(entity, mapping.kbFieldPath);
  if (!mapped) return undefined;
  const value = coerceMappedValue(mapped.value, mapping.valueType);
  return value === undefined ? undefined : { ...mapped, value };
}

function mappingSource(
  mapping: TemplateMappingEntry,
  contributions: Array<{ entity: NormalizedMappedEntity; origin: EntityValueOrigin }>,
): Record<string, unknown> {
  return {
    source: 'kbMapping',
    kbType: mapping.kbType,
    kbFieldPath: mapping.kbFieldPath,
    purpose: mapping.purpose,
    entityIds: contributions.map(({ entity }) => entity.refId),
    entityNames: contributions.map(({ entity }) => entity.name),
    origins: contributions.map(({ origin }) => origin),
  };
}

/**
 * The NPC who hands out this quest: the first character cast on the entry node —
 * the one no edge leads to.
 *
 * Derived from the graph rather than stored, so it always reflects the questline
 * as it is now and there is no field to keep in sync. Every node of a quest is
 * dialogue with this NPC whatever the node's type, so a combat or collect node
 * that casts nobody still has a speaker.
 */
export function questGiverRefId(
  nodes: Array<{ id: string; npcIds?: string[] }>,
  edges: Array<{ source: string; target: string }>,
): string | undefined {
  const hasIncoming = new Set(edges.map((edge) => edge.target));
  const entry = nodes.find((node) => !hasIncoming.has(node.id)) ?? nodes[0];
  return (entry?.npcIds ?? []).find(Boolean)
    // A graph whose opening scene casts nobody still has a giver further in.
    ?? nodes.flatMap((node) => node.npcIds ?? []).find(Boolean);
}

/**
 * Everything a mapping resolves to on this node, in node order.
 *
 * A node that casts its own entity of the mapped type uses it — a scene
 * deliberately given another speaker keeps them. The quest giver stands in only
 * when that yields nothing: either the node casts nobody, or the ones it casts
 * carry no value for this field. A cast NPC with no id must not leave the node
 * speakerless when the giver has one.
 */
function contributionsFor<T>(
  mapping: TemplateMappingEntry,
  entities: NormalizedMappedEntity[],
  questGiver: NormalizedMappedEntity | undefined,
  read: (entity: NormalizedMappedEntity) => T[],
): T[] {
  const fromNode = entities
    .filter((entity) => entity.kbType === mapping.kbType)
    .flatMap(read);
  if (fromNode.length || !questGiver || questGiver.kbType !== mapping.kbType) return fromNode;
  return read(questGiver);
}

function orderedEntities(entities: NormalizedMappedEntity[], refIds: string[]): NormalizedMappedEntity[] {
  const byId = new Map(entities.map((entity) => [entity.refId, entity]));
  return refIds.flatMap((id) => {
    const entity = byId.get(id);
    return entity ? [entity] : [];
  });
}

function removeMappedChildValues(
  rows: unknown[],
  mappings: TemplateMappingEntry[],
  sources: Record<string, unknown>,
): Record<string, unknown>[] {
  return rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    const next = { ...row };
    for (const mapping of mappings) {
      if (isManualPath(sources, mapping.templatePath)) continue;
      const parsed = parseArrayItemPath(mapping.templatePath);
      if (parsed) delete next[parsed.itemPath];
    }
    return Object.keys(next).length ? [next] : [];
  });
}

/**
 * Deterministically apply castable entity mappings to one node. Non-castable
 * candidates remain model-generated and are validated separately by generation.
 */
export function applyEntityMappings(args: {
  values?: Record<string, unknown>;
  sources?: Record<string, unknown>;
  mappings: TemplateMappingEntry[];
  entities: NormalizedMappedEntity[];
  refIds: string[];
  /** Speaker for nodes that cast no character of their own. See questGiverRefId. */
  questGiver?: NormalizedMappedEntity;
}): TemplateMappingState {
  const values: Record<string, unknown> = { ...(args.values ?? {}) };
  const sources: Record<string, unknown> = { ...(args.sources ?? {}) };
  const entities = orderedEntities(args.entities, args.refIds);
  const { questGiver } = args;
  const castableMappings = args.mappings.filter((mapping) => CASTABLE_KB_TYPES.has(mapping.kbType));
  const scalarMappings = castableMappings.filter((mapping) => !parseArrayItemPath(mapping.templatePath));
  const arrayGroups = new Map<string, TemplateMappingEntry[]>();

  for (const mapping of castableMappings) {
    const parsed = parseArrayItemPath(mapping.templatePath);
    if (!parsed) continue;
    arrayGroups.set(parsed.arrayPath, [...(arrayGroups.get(parsed.arrayPath) ?? []), mapping]);
  }

  for (const mapping of scalarMappings) {
    if (isManualPath(sources, mapping.templatePath)) continue;
    const match = contributionsFor(mapping, entities, questGiver, (entity) => {
      const mapped = readMappingValue(entity, mapping);
      return mapped ? [{ entity, mapped }] : [];
    })[0];
    if (!match?.mapped) {
      delete values[mapping.templatePath];
      delete sources[mapping.templatePath];
      continue;
    }
    values[mapping.templatePath] = match.mapped.value;
    sources[mapping.templatePath] = mappingSource(mapping, [{ entity: match.entity, origin: match.mapped.origin }]);
  }

  for (const [arrayPath, mappings] of arrayGroups.entries()) {
    if (sourceKind(sources[arrayPath]) === 'manual') continue;
    const originalRows = Array.isArray(values[arrayPath]) ? values[arrayPath] as unknown[] : [];
    const rows = removeMappedChildValues(originalRows, mappings, sources);

    // Resolve each mapping against the node's entities before touching a row.
    // How many entities contribute is what decides the layout, so it has to be
    // known up front.
    const resolved = mappings.flatMap((mapping) => {
      if (isManualPath(sources, mapping.templatePath)) return [];
      const parsed = parseArrayItemPath(mapping.templatePath);
      if (!parsed) return [];
      const contributions = contributionsFor(mapping, entities, questGiver, (entity) => {
        const mapped = readMappingValue(entity, mapping);
        return mapped ? [{ entity, mapped }] : [];
      });
      return [{ mapping, parsed, contributions }];
    });

    // A value that identifies the row set as a whole goes on every row: either
    // because only one entity resolved it, or because the mapped type is
    // single-valued per node. Everything else is laid out one row per entity.
    // Deciding this from the resolved entities and the kbType, not from the
    // mapping's free-text `purpose`, is what keeps it working for mappings the
    // analyzer happened to word differently.
    const isSingleValued = (entry: typeof resolved[number]) =>
      entry.contributions.length === 1
      || SINGLE_SPEAKER_KB_TYPES.has(entry.mapping.kbType);
    const broadcast = resolved.filter((entry) => entry.contributions.length > 0 && isSingleValued(entry));
    const perEntityMappings = resolved
      .filter((entry) => entry.contributions.length > 1 && !isSingleValued(entry))
      .map((entry) => entry.mapping);

    for (const { mapping, parsed, contributions } of broadcast) {
      // First in node order — the node's own cast before the quest giver.
      const [{ entity, mapped }] = contributions;
      if (!rows.length) rows.push({});
      rows.forEach((row) => {
        row[parsed.itemPath] = mapped.value;
      });
      sources[mapping.templatePath] = mappingSource(mapping, [{ entity, origin: mapped.origin }]);
    }

    // A mapping no entity could satisfy keeps no provenance.
    for (const { mapping, contributions } of resolved) {
      if (!contributions.length) delete sources[mapping.templatePath];
    }

    const readRowEntity = (entity: NormalizedMappedEntity) => {
      const mapped = perEntityMappings.flatMap((mapping) => {
        if (mapping.kbType !== entity.kbType || isManualPath(sources, mapping.templatePath)) return [];
        const value = readMappingValue(entity, mapping);
        return value ? [{ mapping, value }] : [];
      });
      return mapped.length ? [{ entity, mapped }] : [];
    };
    const relevant = perEntityMappings.length
      ? contributionsFor(perEntityMappings[0], entities, questGiver, readRowEntity)
      : [];

    relevant.forEach(({ entity, mapped }, index) => {
      const row = { ...(rows[index] ?? {}) };
      for (const { mapping, value } of mapped) {
        const parsed = parseArrayItemPath(mapping.templatePath);
        if (parsed) row[parsed.itemPath] = value.value;
      }
      rows[index] = row;
    });
    values[arrayPath] = rows;

    for (const mapping of perEntityMappings) {
      if (isManualPath(sources, mapping.templatePath)) continue;
      const contributions = relevant.flatMap(({ entity, mapped }) => {
        const value = mapped.find((entry) => entry.mapping.templatePath === mapping.templatePath)?.value;
        return value ? [{ entity, origin: value.origin }] : [];
      });
      if (contributions.length) sources[mapping.templatePath] = mappingSource(mapping, contributions);
      else delete sources[mapping.templatePath];
    }
  }

  const mappedPaths = new Set(args.mappings.flatMap((mapping) => {
    const parsed = parseArrayItemPath(mapping.templatePath);
    return parsed ? [mapping.templatePath, parsed.arrayPath] : [mapping.templatePath];
  }));
  const warnings = Object.keys(values)
    .filter((path) => present(values[path]) && !mappedPaths.has(path))
    .slice(0, 8)
    .map((path) => `${path} was generated without a validated KB mapping.`);
  return { values, sources, warnings };
}

export function buildMappedEntityPromptBlock(
  mappings: TemplateMappingEntry[],
  entities: NormalizedMappedEntity[],
): string {
  const compact = entities.flatMap((entity) => {
    const mappedFields = mappings.flatMap((mapping) => {
      if (mapping.kbType !== entity.kbType) return [];
      const mapped = readMappingValue(entity, mapping);
      return mapped ? [{
        templatePath: mapping.templatePath,
        kbFieldPath: mapping.kbFieldPath,
        value: mapped.value,
      }] : [];
    });
    return mappedFields.length ? [{ refId: entity.refId, kbType: entity.kbType, name: entity.name, mappedFields }] : [];
  });
  if (!compact.length) return '';
  return `\nSTRUCTURED MAPPED ENTITY VALUES (use the refId to keep values on the node that references that entity):\n${JSON.stringify(compact, null, 2)}`;
}
