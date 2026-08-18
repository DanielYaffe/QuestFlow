import mongoose from 'mongoose';
import { complete } from './ai';
import { hasGenApiKey } from '../config/ai';
import { KB_TYPES, KbType, collectionName, isKbType, qdrant } from './qdrant';
import KbDocumentModel from '../models/kbDocumentModel';
import { TemplateFieldSummary, TemplateSchema } from './exportTemplates/templateParser';
import { parseCollectionFile } from './structuredParse';
import TemplateKbMappingModel, {
  ITemplateKbMappingEntry,
  TemplateKbMappingStatus,
  TemplateKbMappingValueType,
} from '../models/templateKbMappingModel';

type MappingEntryInput = Partial<ITemplateKbMappingEntry>;

interface KbFieldSample {
  kbType: KbType;
  entity: string;
  entityRole?: string;
  fields: Record<string, unknown>;
}

interface TemplateFieldCandidate {
  path: string;
  label?: string;
  valueType: TemplateKbMappingValueType;
  gameplayRole?: string;
  description?: string;
}

interface KbFieldCandidate {
  kbType: KbType;
  path: string;
  valueType: TemplateKbMappingValueType;
  entity: string;
  tokens: Set<string>;
}

const METADATA_KB_PATHS = new Set(['entity.name', 'entity.role']);
const VALID_STATUSES = new Set<TemplateKbMappingStatus>(['proposed', 'validated', 'disabled']);

function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

function flattenFields(value: unknown, prefix = 'fields', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    out[prefix] = value;
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenFields(child, `${prefix}.${key}`, out);
    }
    return out;
  }
  out[prefix] = value;
  return out;
}

function valueTypeOf(value: unknown): TemplateKbMappingValueType {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value !== null && typeof value === 'object') return 'object';
  return 'string';
}

function coerceValueType(value: unknown): TemplateKbMappingValueType | undefined {
  return ['string', 'number', 'boolean', 'array', 'object'].includes(String(value))
    ? String(value) as TemplateKbMappingValueType
    : undefined;
}

function valueTypesCompatible(templateType: TemplateKbMappingValueType, kbType: TemplateKbMappingValueType): boolean {
  if (templateType === kbType) return true;
  return (templateType === 'string' && kbType === 'number') || (templateType === 'number' && kbType === 'string');
}

function splitTokens(value: string | undefined): string[] {
  return String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function fieldTokens(field: TemplateFieldCandidate): Set<string> {
  return new Set([
    ...splitTokens(field.path),
    ...splitTokens(field.label),
    ...splitTokens(field.gameplayRole),
    ...splitTokens(field.description),
  ]);
}

function leafTokens(path: string): Set<string> {
  const cleanPath = path.replace(/\[\]/g, '');
  const leaf = cleanPath.split('.').pop() ?? cleanPath;
  return new Set(splitTokens(leaf));
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function tokensHaveAny(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function kbTypeHintScore(tokens: Set<string>, kbType: KbType): number {
  const values = Array.from(tokens);
  const contains = (parts: string[]) => parts.some((part) => values.some((value) => value.includes(part)));
  if (kbType === 'characters' && contains(['npc', 'character', 'speaker', 'dialog', 'dialogue'])) return 3;
  if (kbType === 'monsters' && contains(['monster', 'mob', 'enemy', 'kill', 'combat'])) return 3;
  if (kbType === 'items' && contains(['item', 'reward', 'collect', 'loot', 'gain', 'lose'])) return 3;
  if (kbType === 'maps' && contains(['map', 'field', 'location', 'portal'])) return 3;
  if (kbType === 'quests' && contains(['quest', 'pre', 'previous', 'ongoing', 'completed'])) return 3;
  return 0;
}

function inferPurpose(templateTokens: Set<string>, kbTokens: Set<string>, kbType: KbType): string {
  const allTokens = new Set([...templateTokens, ...kbTokens]);
  if (tokensHaveAny(allTokens, ['name', 'title'])) return 'entityName';
  if (tokensHaveAny(allTokens, ['amount', 'count', 'quantity', 'qty'])) return 'quantity';
  if (tokensHaveAny(allTokens, ['level', 'lv', 'min', 'max'])) return 'level';
  if (tokensHaveAny(allTokens, ['id'])) {
    if (kbType === 'characters') return 'dialogSpeakerId';
    if (kbType === 'items' && tokensHaveAny(allTokens, ['reward', 'gain', 'lose'])) return 'rewardEntityId';
    if (kbType === 'monsters') return 'requirementEntityId';
    if (kbType === 'items') return 'itemEntityId';
    if (kbType === 'maps') return 'locationId';
    if (kbType === 'quests') return 'questReferenceId';
    return 'entityId';
  }
  if (tokensHaveAny(allTokens, ['flag', 'state', 'enabled', 'complete', 'accept', 'daily', 'silent'])) return 'stateFlag';
  return 'templateValue';
}

function fieldCandidates(schema: TemplateSchema | undefined): TemplateFieldCandidate[] {
  const fields = Array.isArray(schema?.editableFields) ? schema.editableFields : [];
  return fields.flatMap((field: TemplateFieldSummary) => {
    const parent: TemplateFieldCandidate = {
      path: field.path,
      label: field.label,
      valueType: field.valueType,
      gameplayRole: field.gameplayRole,
      description: field.description,
    };
    const itemFields = (field.itemSchema ?? []).map((item) => ({
      path: `${field.path}[].${item.path}`,
      label: item.label,
      valueType: item.valueType,
      gameplayRole: field.gameplayRole,
      description: field.description,
    }));
    return [parent, ...itemFields];
  });
}

async function sampleKbType(gameId: string, kbType: KbType): Promise<KbFieldSample[]> {
  const collection = collectionName(gameId, kbType);
  const result = await qdrant.scroll(collection, {
    limit: 8,
    with_payload: true,
  }).catch(() => null);
  const points = Array.isArray(result?.points) ? result.points : [];
  const qdrantSamples = points.flatMap((point) => {
    const payload = point.payload;
    if (!payload || typeof payload !== 'object') return [];
    const entity = (payload as Record<string, unknown>).entity;
    const fields = (payload as Record<string, unknown>).fields;
    if (typeof entity !== 'string' && (!fields || typeof fields !== 'object' || Array.isArray(fields))) return [];
    return [{
      kbType,
      entity: typeof entity === 'string' ? entity : String((payload as Record<string, unknown>).title ?? kbType),
      entityRole: typeof (payload as Record<string, unknown>).entityRole === 'string'
        ? (payload as Record<string, unknown>).entityRole as string
        : undefined,
      fields: fields && typeof fields === 'object' && !Array.isArray(fields)
        ? fields as Record<string, unknown>
        : {},
    }];
  });
  if (qdrantSamples.length > 0) return qdrantSamples;

  const docs = await KbDocumentModel.find({ gameId, type: kbType, status: 'ready' })
    .select('originalText')
    .limit(3)
    .lean();
  return docs.flatMap((doc) => {
    const entities = parseCollectionFile(doc.originalText) ?? [];
    return entities.slice(0, 8).map((entity) => ({
      kbType,
      entity: entity.name,
      entityRole: entity.role,
      fields: entity.fields,
    }));
  }).slice(0, 8);
}

export async function sampleKbFields(gameId: string): Promise<KbFieldSample[]> {
  if (!mongoose.isValidObjectId(gameId)) return [];
  const samples = await Promise.all(KB_TYPES.map((type) => sampleKbType(gameId, type)));
  return samples.flat();
}

function compactSamples(samples: KbFieldSample[]) {
  return samples.map((sample) => ({
    kbType: sample.kbType,
    entity: sample.entity,
    entityRole: sample.entityRole,
    fieldPaths: Object.entries(flattenFields(sample.fields))
      .slice(0, 20)
      .map(([path, value]) => ({ path, valueType: valueTypeOf(value), example: value })),
  }));
}

function buildMappingPrompt(templateName: string, schema: TemplateSchema, samples: KbFieldSample[]): string {
  const contract = schema.generationContract;
  return `You propose generic mappings from a game's Knowledge Base fields to a quest export template.

Template: ${templateName}

Template fields. Use only these exact templatePath values:
${JSON.stringify(fieldCandidates(schema), null, 2)}

Existing template hints:
${JSON.stringify({
  fieldHints: contract.fieldHints ?? [],
  relationshipHints: contract.relationshipHints ?? [],
  generationHints: contract.generationHints ?? [],
  userExamples: contract.userExamples ?? [],
}, null, 2)}

Knowledge Base field samples. Use only kbFieldPath values shown here, or metadata paths "entity.name" and "entity.role":
${JSON.stringify(compactSamples(samples), null, 2)}

Return ONLY valid JSON. Do not include markdown.

A good mapping explains how generation can copy a concrete value from a KB entity into a template field. Examples of valid purposes are generic labels like "requirementEntityId", "dialogSpeakerId", "rewardEntityId", "entityName", "quantity", "level", "locationId", or "stateFlag".

Do not force mappings. If there is no clear relationship between a template field and KB field, omit it.
Do not use game-specific assumptions. Use field names, labels, hints, examples, and sampled KB fields.

Return this shape:
{
  "entries": [
    {
      "templatePath": "exact template path",
      "kbType": "monsters",
      "kbFieldPath": "fields.id",
      "valueType": "number",
      "purpose": "requirementEntityId",
      "confidence": 0.85,
      "explanation": "why this KB value belongs in this template field"
    }
  ]
}`;
}

function knownKbPathsByType(samples: KbFieldSample[]): Map<KbType, Map<string, TemplateKbMappingValueType>> {
  const byType = new Map<KbType, Map<string, TemplateKbMappingValueType>>();
  for (const sample of samples) {
    const paths = byType.get(sample.kbType) ?? new Map<string, TemplateKbMappingValueType>();
    paths.set('entity.name', 'string');
    if (sample.entityRole) paths.set('entity.role', 'string');
    for (const [path, value] of Object.entries(flattenFields(sample.fields))) {
      paths.set(path, valueTypeOf(value));
    }
    byType.set(sample.kbType, paths);
  }
  return byType;
}

function kbFieldCandidates(samples: KbFieldSample[]): KbFieldCandidate[] {
  const seen = new Set<string>();
  return samples.flatMap((sample) => {
    const flattened = flattenFields(sample.fields);
    const candidates: KbFieldCandidate[] = [
      {
        kbType: sample.kbType,
        path: 'entity.name',
        valueType: 'string',
        entity: sample.entity,
        tokens: new Set([...splitTokens('entity name'), ...splitTokens(sample.entity)]),
      },
    ];

    if (sample.entityRole) {
      candidates.push({
        kbType: sample.kbType,
        path: 'entity.role',
        valueType: 'string',
        entity: sample.entity,
        tokens: new Set([...splitTokens('entity role'), ...splitTokens(sample.entityRole)]),
      });
    }

    for (const [path, value] of Object.entries(flattened)) {
      candidates.push({
        kbType: sample.kbType,
        path,
        valueType: valueTypeOf(value),
        entity: sample.entity,
        tokens: new Set([...splitTokens(path), ...splitTokens(sample.entity)]),
      });
    }

    return candidates.filter((candidate) => {
      const key = `${candidate.kbType}:${candidate.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

function scoreMapping(templateField: TemplateFieldCandidate, kbField: KbFieldCandidate): number {
  if (templateField.valueType === 'array' || templateField.valueType === 'object') return 0;
  if (!valueTypesCompatible(templateField.valueType, kbField.valueType)) return 0;

  const templateTokens = fieldTokens(templateField);
  const templateLeafTokens = leafTokens(templateField.path);
  const kbLeafTokens = leafTokens(kbField.path);
  const templateHasId = tokensHaveAny(templateLeafTokens, ['id']);
  const kbHasId = tokensHaveAny(kbLeafTokens, ['id']);
  const templateHasQuantity = tokensHaveAny(templateLeafTokens, ['amount', 'count', 'quantity', 'qty']);
  const templateHasProgression = tokensHaveAny(templateLeafTokens, ['level', 'lv', 'min', 'max']);
  const typeHintScore = kbTypeHintScore(templateTokens, kbField.kbType);
  const isBareTopLevelId = templateHasId && !templateField.path.includes('.') && !templateField.path.includes('[]');

  if (isBareTopLevelId) return 0;
  if (kbHasId && !templateHasId) return 0;
  if (templateHasId && kbHasId && typeHintScore === 0 && kbField.kbType !== 'quests') return 0;
  if (templateHasQuantity && !tokensHaveAny(kbLeafTokens, ['amount', 'count', 'quantity', 'qty'])) return 0;
  if (templateHasProgression && !tokensHaveAny(kbLeafTokens, ['level', 'lv', 'min', 'max'])) return 0;

  let score = overlapCount(templateTokens, kbField.tokens);

  score += overlapCount(templateLeafTokens, kbLeafTokens) * 3;
  score += typeHintScore;
  if (templateHasId && kbHasId) score += 4;

  if (tokensHaveAny(templateLeafTokens, ['name', 'title']) && tokensHaveAny(kbLeafTokens, ['name', 'title'])) score += 4;
  if (tokensHaveAny(templateLeafTokens, ['amount', 'count', 'quantity', 'qty'])
    && tokensHaveAny(kbLeafTokens, ['amount', 'count', 'quantity', 'qty'])) score += 4;
  if (tokensHaveAny(templateLeafTokens, ['level', 'lv']) && tokensHaveAny(kbLeafTokens, ['level', 'lv'])) score += 3;

  return score;
}

function heuristicMappingEntries(schema: TemplateSchema, samples: KbFieldSample[]): ITemplateKbMappingEntry[] {
  const kbFields = kbFieldCandidates(samples);
  const seen = new Set<string>();

  return fieldCandidates(schema).flatMap((templateField) => {
    const best = kbFields
      .map((kbField) => ({ kbField, score: scoreMapping(templateField, kbField) }))
      .filter(({ score }) => score >= 5)
      .sort((a, b) => b.score - a.score)[0];

    if (!best) return [];
    const key = `${templateField.path}:${best.kbField.kbType}:${best.kbField.path}`;
    if (seen.has(key)) return [];
    seen.add(key);

    const templateTokens = fieldTokens(templateField);
    const kbTokens = best.kbField.tokens;
    return [{
      templatePath: templateField.path,
      kbType: best.kbField.kbType,
      kbFieldPath: best.kbField.path,
      valueType: templateField.valueType,
      purpose: inferPurpose(templateTokens, kbTokens, best.kbField.kbType),
      status: 'proposed' as TemplateKbMappingStatus,
      confidence: Math.max(0.35, Math.min(0.9, best.score / 12)),
      explanation: `Suggested by matching template field "${templateField.path}" to KB field "${best.kbField.path}" from ${best.kbField.kbType}.`,
    }];
  }).slice(0, 60);
}

function mergeMappingSuggestions(primary: ITemplateKbMappingEntry[], fallback: ITemplateKbMappingEntry[]): ITemplateKbMappingEntry[] {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((entry) => {
    const key = `${entry.templatePath}:${entry.kbType}:${entry.kbFieldPath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 60);
}

export function normalizeMappingEntries(
  rawEntries: unknown,
  schema: TemplateSchema | undefined,
  samples: KbFieldSample[],
  defaultStatus: TemplateKbMappingStatus,
): ITemplateKbMappingEntry[] {
  const candidates = new Map(fieldCandidates(schema).map((field) => [field.path, field]));
  const kbPaths = knownKbPathsByType(samples);
  const rawList = Array.isArray(rawEntries) ? rawEntries : [];
  const seen = new Set<string>();

  return rawList.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as MappingEntryInput;
    const templatePath = typeof entry.templatePath === 'string' ? entry.templatePath.trim() : '';
    const kbType = isKbType(entry.kbType) ? entry.kbType : undefined;
    const kbFieldPath = typeof entry.kbFieldPath === 'string' ? entry.kbFieldPath.trim() : '';
    const templateField = candidates.get(templatePath);
    if (!templateField || !kbType || !kbFieldPath) return [];

    const pathsForType = kbPaths.get(kbType) ?? new Map<string, TemplateKbMappingValueType>();
    const kbValueType = pathsForType.get(kbFieldPath) ?? (METADATA_KB_PATHS.has(kbFieldPath) ? 'string' : undefined);
    const valueType = coerceValueType(entry.valueType) ?? templateField.valueType;
    if (!kbValueType || !valueTypesCompatible(templateField.valueType, kbValueType) || !valueTypesCompatible(valueType, kbValueType)) {
      return [];
    }

    const key = `${templatePath}:${kbType}:${kbFieldPath}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      templatePath,
      kbType,
      kbFieldPath,
      valueType,
      purpose: typeof entry.purpose === 'string' ? entry.purpose.trim().slice(0, 80) : '',
      status: VALID_STATUSES.has(entry.status as TemplateKbMappingStatus)
        ? entry.status as TemplateKbMappingStatus
        : defaultStatus,
      confidence: typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? Math.max(0, Math.min(1, entry.confidence))
        : 0,
      explanation: typeof entry.explanation === 'string' ? entry.explanation.trim().slice(0, 500) : '',
    }];
  });
}

export async function proposeTemplateKbMappings(args: {
  ownerId: string;
  gameId: string;
  templateId: string;
  templateName: string;
  schema: TemplateSchema;
}): Promise<ITemplateKbMappingEntry[]> {
  const samples = await sampleKbFields(args.gameId);
  if (samples.length === 0) return [];
  const heuristicEntries = heuristicMappingEntries(args.schema, samples);
  if (!hasGenApiKey()) return heuristicEntries;
  try {
    const json = await complete(buildMappingPrompt(args.templateName, args.schema, samples));
    const parsed = JSON.parse(stripJsonFences(json)) as { entries?: unknown };
    const aiEntries = normalizeMappingEntries(parsed.entries, args.schema, samples, 'proposed');
    return mergeMappingSuggestions(aiEntries, heuristicEntries);
  } catch (error) {
    console.warn('[templateKbMapping] AI proposal failed, using parser fallback:', error);
    return heuristicEntries;
  }
}

export async function upsertTemplateKbMappings(args: {
  ownerId: string;
  gameId: string;
  templateId: string;
  entries: ITemplateKbMappingEntry[];
}) {
  return TemplateKbMappingModel.findOneAndUpdate(
    { ownerId: args.ownerId, gameId: args.gameId, templateId: args.templateId },
    {
      ownerId: args.ownerId,
      gameId: args.gameId,
      templateId: args.templateId,
      entries: args.entries,
      analyzedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}
