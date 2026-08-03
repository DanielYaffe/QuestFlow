import { complete } from '../ai';
import { hasGenApiKey } from '../../config/ai';
import {
  GameplayRole,
  ParsedTemplate,
  TemplateFieldSummary,
  TemplateSchema,
} from './templateParser';

const VALID_ROLES = new Set<GameplayRole>([
  'questName',
  'questId',
  'questFlag',
  'preQuest',
  'ongoingQuestRequirement',
  'completedQuestRequirement',
  'requirement',
  'combatRequirement',
  'collectionRequirement',
  'reward',
  'itemReward',
  'currencyReward',
  'experienceReward',
  'questDialog',
  'other',
]);

type AnalysisResult = {
  templateSchema: TemplateSchema;
  schemaSummary: ParsedTemplate['schemaSummary'];
  inferredAiGuidance: ParsedTemplate['inferredAiGuidance'];
  analysisStatus: 'ready' | 'fallback' | 'failed';
  analysisError: string;
  analyzedAt: Date;
};

type TemplateGenerationContract = TemplateSchema['generationContract'];

type ExistingHintContext = {
  generationContract?: Partial<TemplateGenerationContract>;
};

function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

function fallbackResult(parsed: ParsedTemplate, error = ''): AnalysisResult {
  return {
    templateSchema: parsed.templateSchema,
    schemaSummary: parsed.schemaSummary,
    inferredAiGuidance: parsed.inferredAiGuidance,
    analysisStatus: error ? 'fallback' : 'fallback',
    analysisError: error,
    analyzedAt: new Date(),
  };
}

function schemaSummaryFromSchema(schema: TemplateSchema): ParsedTemplate['schemaSummary'] {
  const requirementFields = schema.editableFields
    .filter((field) => field.gameplayRole.includes('Requirement') || field.gameplayRole === 'requirement')
    .map((field) => field.path);
  const rewardFields = schema.editableFields
    .filter((field) => field.gameplayRole.includes('Reward') || field.gameplayRole === 'reward')
    .map((field) => field.path);
  const dialogFields = schema.editableFields
    .filter((field) => field.gameplayRole === 'questDialog')
    .map((field) => field.path);

  return {
    requirementFields,
    rewardFields,
    dialogFields,
    structureSummary: schema.summary,
  };
}

function guidanceFromSummary(summary: ParsedTemplate['schemaSummary']): ParsedTemplate['inferredAiGuidance'] {
  return {
    objectiveFields: summary.requirementFields,
    rewardFields: summary.rewardFields,
    structureSummary: summary.structureSummary,
  };
}

function compactField(field: TemplateFieldSummary) {
  return {
    path: field.path,
    label: field.label,
    kind: field.kind,
    valueType: field.valueType,
    control: field.control,
    shape: field.shape,
    gameplayRole: field.gameplayRole,
    fillSource: field.fillSource,
    itemSchema: field.itemSchema,
  };
}

function buildAnalysisPrompt(templateName: string, parsed: ParsedTemplate, existing?: ExistingHintContext): string {
  const existingContract = existing?.generationContract;
  return `You analyze quest export templates.

Template name: ${templateName}
Input format: ${parsed.format}

Parser-created schema fields. These paths, field kinds, controls, and item schemas are already the source of truth:
${JSON.stringify(parsed.fieldSchema.map(compactField), null, 2)}

Existing user examples and hints. Treat userExamples as high-priority corrections:
${JSON.stringify({
  fieldHints: existingContract?.fieldHints ?? [],
  relationshipHints: existingContract?.relationshipHints ?? [],
  generationHints: existingContract?.generationHints ?? [],
  userExamples: existingContract?.userExamples ?? [],
}, null, 2)}

Return ONLY valid JSON. Do not include markdown.

You may improve only labels, descriptions, gameplayRole, fillSource, required, and generationContract.
You must not invent new field paths. Use only paths from the detected editable fields.
You must not change field paths, nesting, kind, valueType, control, shape, defaultValue, or itemSchema. The parser owns the form structure, including date controls and recursive list/object fields.
Do not copy placeholder IDs, item values, monster values, amounts, or example text as answers.
If a field is under requirements.complete, that does not automatically mean dialog. It is dialog only when it clearly represents dialogue pages/conversation/script text.
For array item fields, refer to item fields by appending [] before the child path, for example "pages[].id". Only use those item paths when the parent array and child item path exist in the parser schema.
Infer relationships generically. A relationship means one field stores a value that references, controls, or changes another field. Do not assume a specific game template. Only describe relationships that are supported by the detected fields or existing user examples.

Allowed gameplayRole values:
questName, questId, questFlag, preQuest, ongoingQuestRequirement, completedQuestRequirement, requirement, combatRequirement, collectionRequirement, reward, itemReward, currencyReward, experienceReward, questDialog, other

Return this shape:
{
  "summary": "one sentence summary of the template's editable quest data",
  "editableFields": [
    {
      "path": "existing.path.only",
      "label": "Friendly label",
      "description": "What this field controls",
      "gameplayRole": "requirement",
      "fillSource": "ai",
      "required": false
    }
  ],
  "generationContract": {
    "requirementRoles": ["field paths relevant to quest requirements"],
    "rewardRoles": ["field paths relevant to rewards"],
    "dialogRoles": ["field paths relevant to dialog"],
    "promptSummary": "compact prompt guidance for quest generation",
    "fieldHints": [
      {
        "path": "existing.path or existing.array[].itemPath",
        "meaning": "what this field means in the game/template",
        "generationUse": "how quest generation should fill or avoid this field"
      }
    ],
    "relationshipHints": [
      {
        "kind": "reference",
        "from": "existing.array[].field",
        "to": "existing.array[].idField",
        "meaning": "how these fields are connected"
      }
    ],
    "generationHints": ["short template-specific generation instruction"],
    "userExamples": ["preserve existing user examples exactly"]
  }
}`;
}

function normalizeAiField(raw: any, fallback: TemplateFieldSummary): TemplateFieldSummary {
  const rawGameplayRole = VALID_ROLES.has(raw?.gameplayRole) ? raw.gameplayRole as GameplayRole : fallback.gameplayRole;
  const gameplayRole = normalizeGameplayRoleForPath(fallback.path, rawGameplayRole, fallback.gameplayRole);
  const rawFillSource = ['node', 'graph', 'ai', 'manual', 'templateDefault'].includes(raw?.fillSource)
    ? raw.fillSource
    : fallback.fillSource;
  const fillSource = normalizeFillSourceForPath(fallback.path, gameplayRole, rawFillSource);

  return {
    ...fallback,
    label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : fallback.label,
    description: typeof raw?.description === 'string' && raw.description.trim() ? raw.description.trim() : fallback.description,
    gameplayRole,
    fillSource,
    required: typeof raw?.required === 'boolean' ? raw.required : fallback.required,
  };
}

function normalizeGameplayRoleForPath(path: string, proposed: GameplayRole, fallback: GameplayRole): GameplayRole {
  const normalized = path.toLowerCase();
  const isExplicitPreQuestPath = /pre.*quest|prereq|require.*quest|ongoingquest|completedquest/.test(normalized);

  if (proposed === 'preQuest' && !isExplicitPreQuestPath) return fallback === 'preQuest' ? 'requirement' : fallback;
  if (proposed === 'ongoingQuestRequirement' && !/ongoing.*quest|ongoingquest/.test(normalized)) return fallback;
  if (proposed === 'completedQuestRequirement' && !/completed.*quest|completedquest|pre.*quest|prereq|require.*quest/.test(normalized)) return fallback;
  return proposed;
}

function normalizeFillSourceForPath(
  _path: string,
  role: GameplayRole,
  proposed: TemplateFieldSummary['fillSource'],
): TemplateFieldSummary['fillSource'] {
  if (role === 'preQuest' || role === 'completedQuestRequirement') return 'graph';
  if (role === 'ongoingQuestRequirement') return proposed === 'graph' ? 'ai' : proposed;
  return proposed;
}

function validateAiSchema(raw: any, fallback: TemplateSchema, existing?: ExistingHintContext): TemplateSchema {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.editableFields)) {
    throw new Error('AI template analysis did not return editableFields');
  }

  const fallbackByPath = new Map(fallback.editableFields.map((field) => [field.path, field]));
  const seen = new Set<string>();
  const editableFields: TemplateFieldSummary[] = raw.editableFields.flatMap((field: any) => {
    const path = typeof field?.path === 'string' ? field.path : '';
    const fallbackField = fallbackByPath.get(path);
    if (!fallbackField || seen.has(path)) return [];
    seen.add(path);
    return [normalizeAiField(field, fallbackField)];
  });

  for (const fallbackField of fallback.editableFields) {
    if (!seen.has(fallbackField.path)) editableFields.push(fallbackField);
  }

  const summary = typeof raw.summary === 'string' && raw.summary.trim()
    ? raw.summary.trim()
    : fallback.summary;

  const generationContract: TemplateGenerationContract = {
    requirementRoles: Array.isArray(raw.generationContract?.requirementRoles)
      ? raw.generationContract.requirementRoles.filter((path: unknown) => typeof path === 'string' && fallbackByPath.has(path))
      : editableFields.filter((field) => field.gameplayRole.includes('Requirement') || field.gameplayRole === 'requirement').map((field) => field.path),
    rewardRoles: Array.isArray(raw.generationContract?.rewardRoles)
      ? raw.generationContract.rewardRoles.filter((path: unknown) => typeof path === 'string' && fallbackByPath.has(path))
      : editableFields.filter((field) => field.gameplayRole.includes('Reward') || field.gameplayRole === 'reward').map((field) => field.path),
    dialogRoles: Array.isArray(raw.generationContract?.dialogRoles)
      ? raw.generationContract.dialogRoles.filter((path: unknown) => typeof path === 'string' && fallbackByPath.has(path))
      : editableFields.filter((field) => field.gameplayRole === 'questDialog').map((field) => field.path),
    promptSummary: typeof raw.generationContract?.promptSummary === 'string' && raw.generationContract.promptSummary.trim()
      ? raw.generationContract.promptSummary.trim()
      : summary,
    fieldHints: Array.isArray(raw.generationContract?.fieldHints)
      ? normalizeFieldHints(raw.generationContract.fieldHints, fallback)
      : normalizeFieldHints(existing?.generationContract?.fieldHints, fallback),
    relationshipHints: Array.isArray(raw.generationContract?.relationshipHints)
      ? normalizeRelationshipHints(raw.generationContract.relationshipHints, fallback)
      : normalizeRelationshipHints(existing?.generationContract?.relationshipHints, fallback),
    generationHints: Array.isArray(raw.generationContract?.generationHints)
      ? normalizeStringList(raw.generationContract.generationHints)
      : normalizeStringList(existing?.generationContract?.generationHints),
    userExamples: Array.isArray(raw.generationContract?.userExamples)
      ? normalizeStringList(raw.generationContract.userExamples)
      : normalizeStringList(existing?.generationContract?.userExamples),
  };

  return {
    ...fallback,
    summary,
    editableFields,
    generationContract,
    exportBindings: fallback.exportBindings,
  };
}

export async function analyzeTemplate(
  templateName: string,
  parsed: ParsedTemplate,
  options: { forceAi?: boolean; skipAi?: boolean; existingSchema?: ExistingHintContext } = {},
): Promise<AnalysisResult> {
  if (options.skipAi) {
    return fallbackResult(mergeExistingHintsIntoFallback(parsed, options.existingSchema));
  }

  if (!hasGenApiKey()) {
    return fallbackResult(mergeExistingHintsIntoFallback(parsed, options.existingSchema), 'AI provider API key is not configured; using parser fallback.');
  }

  try {
    const rawJson = stripJsonFences(await complete(buildAnalysisPrompt(templateName, parsed, options.existingSchema)));
    const aiSchema = validateAiSchema(JSON.parse(rawJson), parsed.templateSchema, options.existingSchema);
    const schemaSummary = schemaSummaryFromSchema(aiSchema);
    return {
      templateSchema: aiSchema,
      schemaSummary,
      inferredAiGuidance: guidanceFromSummary(schemaSummary),
      analysisStatus: 'ready',
      analysisError: '',
      analyzedAt: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI template analysis failed';
    return fallbackResult(mergeExistingHintsIntoFallback(parsed, options.existingSchema), options.forceAi ? message : message);
  }
}

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim());
}

function allowedHintPaths(schema: TemplateSchema): Set<string> {
  const paths = new Set(schema.editableFields.map((field) => field.path));
  for (const field of schema.editableFields) {
    for (const item of field.itemSchema ?? []) {
      paths.add(`${field.path}[].${item.path}`);
    }
  }
  return paths;
}

function normalizeFieldHints(raw: unknown, fallback: TemplateSchema): TemplateGenerationContract['fieldHints'] {
  if (!Array.isArray(raw)) return [];
  const allowed = allowedHintPaths(fallback);
  const seen = new Set<string>();
  return raw.flatMap((hint) => {
    const path = typeof hint?.path === 'string' ? hint.path.trim() : '';
    if (!allowed.has(path) || seen.has(path)) return [];
    const meaning = typeof hint?.meaning === 'string' ? hint.meaning.trim() : '';
    const generationUse = typeof hint?.generationUse === 'string' ? hint.generationUse.trim() : '';
    if (!meaning && !generationUse) return [];
    seen.add(path);
    return [{ path, meaning, generationUse }];
  });
}

function normalizeRelationshipHints(raw: unknown, fallback: TemplateSchema): TemplateGenerationContract['relationshipHints'] {
  if (!Array.isArray(raw)) return [];
  const allowed = allowedHintPaths(fallback);
  const validKinds = new Set(['reference', 'branch', 'sequence', 'state', 'other']);
  const seen = new Set<string>();
  return raw.flatMap((hint) => {
    const from = typeof hint?.from === 'string' ? hint.from.trim() : '';
    const to = typeof hint?.to === 'string' ? hint.to.trim() : '';
    if (!allowed.has(from) || !allowed.has(to)) return [];
    const kind = validKinds.has(hint?.kind) ? hint.kind as TemplateGenerationContract['relationshipHints'][number]['kind'] : 'other';
    const meaning = typeof hint?.meaning === 'string' ? hint.meaning.trim() : '';
    const key = `${kind}:${from}:${to}`;
    if (!meaning || seen.has(key)) return [];
    seen.add(key);
    return [{ kind, from, to, meaning }];
  });
}

function mergeExistingHintsIntoFallback(parsed: ParsedTemplate, existing?: ExistingHintContext): ParsedTemplate {
  if (!existing?.generationContract) return parsed;
  const fallback = parsed.templateSchema;
  const generationContract: TemplateGenerationContract = {
    ...fallback.generationContract,
    fieldHints: normalizeFieldHints(existing.generationContract.fieldHints, fallback),
    relationshipHints: normalizeRelationshipHints(existing.generationContract.relationshipHints, fallback),
    generationHints: normalizeStringList(existing.generationContract.generationHints),
    userExamples: normalizeStringList(existing.generationContract.userExamples),
  };
  return {
    ...parsed,
    templateSchema: {
      ...fallback,
      generationContract,
    },
  };
}
