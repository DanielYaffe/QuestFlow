import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/config';
import {
  GameplayRole,
  ParsedTemplate,
  TemplateFieldSummary,
  TemplatePromptRelationship,
  TemplatePromptScheme,
  TemplateSchema,
  normalizeTemplatePromptScheme,
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
  const promptFields = schema.promptScheme?.fields?.map((field) => field.path) ?? dialogFields;

  return {
    requirementFields,
    rewardFields,
    dialogFields,
    promptFields,
    structureSummary: schema.summary,
  };
}

function guidanceFromSummary(summary: ParsedTemplate['schemaSummary']): ParsedTemplate['inferredAiGuidance'] {
  return {
    objectiveFields: summary.requirementFields,
    rewardFields: summary.rewardFields,
    promptFields: summary.promptFields,
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

function buildAnalysisPrompt(templateName: string, parsed: ParsedTemplate): string {
  return `You analyze quest export templates.

Template name: ${templateName}
Input format: ${parsed.format}

Parser-created schema fields. These paths, field kinds, controls, and item schemas are already the source of truth:
${JSON.stringify(parsed.fieldSchema.map(compactField), null, 2)}

Parser-created prompt scheme candidates. The parser only detects structure; you must analyze semantic relationships between these fields:
${JSON.stringify(parsed.templateSchema.promptScheme, null, 2)}

Return ONLY valid JSON. Do not include markdown.

You may improve only labels, descriptions, gameplayRole, fillSource, required, generationContract, and promptScheme.relationships.
You must not invent new field paths. Use only paths from the detected editable fields.
You must not change field paths, nesting, kind, valueType, control, shape, defaultValue, or itemSchema. The parser owns the form structure, including date controls and recursive list/object fields.
Do not copy placeholder IDs, item values, monster values, amounts, or example text as answers.
Do not assume field names from one example template. A prompt/dialog/monologue role must come from field meaning or structure: player-facing text, ordered text arrays, prompt-like object arrays, speaker/reference fields, navigation/choice fields, or state/control flags.
Do not use a fixed relationship contract from examples. Infer relationships only from the detected field names, itemSchema, shapes, and defaults in this template.

For promptScheme.relationships:
- Describe how fields inside each prompt/dialog/monologue structure relate to each other.
- Use fieldPath for the prompt field path, such as a list/object path from the prompt scheme.
- relatedFields must contain only child field names from that prompt field's itemFields, or the fieldPath itself for scalar prompt fields.
- itemFields is the complete neutral list of child fields. The categorized lists like textFields, navigationFields, stateFields, optionFields, and referenceFields are hints only.
- relationType should be generic and semantic, such as "sequence", "branch", "speaker-reference", "text-content", "state-flag", "control-type", "terminal-state", or another concise type inferred from the template.
- explanation should describe the relationship in plain language.
- generationGuidance should tell quest generation how to fill those related fields consistently.
- If no relationship is clear, return an empty relationships array instead of guessing.

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
    "promptRoles": ["field paths relevant to player-facing prompt generation"],
    "promptSummary": "compact prompt guidance for quest generation"
  },
  "promptScheme": {
    "relationships": [
      {
        "fieldPath": "existing.prompt.field.path",
        "relationType": "semantic relationship type",
        "relatedFields": ["childFieldName"],
        "explanation": "How these fields relate in this template",
        "generationGuidance": "How generation should fill them consistently",
        "required": true
      }
    ]
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

function validateAiSchema(raw: any, fallback: TemplateSchema): TemplateSchema {
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

  const generationContract = {
    requirementRoles: Array.isArray(raw.generationContract?.requirementRoles)
      ? raw.generationContract.requirementRoles.filter((path: unknown) => typeof path === 'string' && fallbackByPath.has(path))
      : editableFields.filter((field) => field.gameplayRole.includes('Requirement') || field.gameplayRole === 'requirement').map((field) => field.path),
    rewardRoles: Array.isArray(raw.generationContract?.rewardRoles)
      ? raw.generationContract.rewardRoles.filter((path: unknown) => typeof path === 'string' && fallbackByPath.has(path))
      : editableFields.filter((field) => field.gameplayRole.includes('Reward') || field.gameplayRole === 'reward').map((field) => field.path),
    dialogRoles: Array.isArray(raw.generationContract?.dialogRoles)
      ? raw.generationContract.dialogRoles.filter((path: unknown) => typeof path === 'string' && fallbackByPath.has(path))
      : editableFields.filter((field) => field.gameplayRole === 'questDialog').map((field) => field.path),
    promptRoles: Array.isArray(raw.generationContract?.promptRoles)
      ? raw.generationContract.promptRoles.filter((path: unknown) => typeof path === 'string' && fallbackByPath.has(path))
      : fallback.promptScheme.fields.map((field) => field.path),
    promptSummary: typeof raw.generationContract?.promptSummary === 'string' && raw.generationContract.promptSummary.trim()
      ? raw.generationContract.promptSummary.trim()
      : summary,
  };

  const promptScheme = mergePromptSchemeRelationships(fallback.promptScheme, raw.promptScheme);

  return {
    ...fallback,
    summary,
    editableFields,
    promptScheme,
    generationContract,
    exportBindings: fallback.exportBindings,
  };
}

function mergePromptSchemeRelationships(
  fallback: TemplatePromptScheme,
  rawPromptScheme: unknown,
): TemplatePromptScheme {
  const validFieldByPath = new Map(fallback.fields.map((field) => [field.path, field]));
  const rawRelationships = rawPromptScheme
    && typeof rawPromptScheme === 'object'
    && Array.isArray((rawPromptScheme as { relationships?: unknown }).relationships)
    ? (rawPromptScheme as { relationships: unknown[] }).relationships
    : [];

  const relationships: TemplatePromptRelationship[] = rawRelationships.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const value = raw as Record<string, unknown>;
    const fieldPath = typeof value.fieldPath === 'string' ? value.fieldPath : '';
    const promptField = validFieldByPath.get(fieldPath);
    if (!promptField) return [];

    const itemFieldNames = new Set([
      ...promptField.itemFields.map((field) => field.path),
      ...promptField.textFields,
      ...promptField.optionFields,
      ...promptField.referenceFields,
      ...promptField.navigationFields,
      ...promptField.stateFields,
    ]);
    const relatedFields = Array.isArray(value.relatedFields)
      ? value.relatedFields.filter((field): field is string => {
        if (typeof field !== 'string') return false;
        return field === fieldPath || itemFieldNames.has(field);
      })
      : [];

    if (relatedFields.length === 0) return [];

    return [{
      fieldPath,
      relationType: typeof value.relationType === 'string' && value.relationType.trim()
        ? value.relationType.trim()
        : 'relationship',
      relatedFields,
      explanation: typeof value.explanation === 'string' ? value.explanation.trim() : '',
      generationGuidance: typeof value.generationGuidance === 'string' ? value.generationGuidance.trim() : '',
      required: typeof value.required === 'boolean' ? value.required : false,
    }];
  });

  return normalizeTemplatePromptScheme({
    ...fallback,
    relationships,
  }) ?? fallback;
}

export async function analyzeTemplate(
  templateName: string,
  parsed: ParsedTemplate,
  options: { forceAi?: boolean } = {},
): Promise<AnalysisResult> {
  if (!config.GEMINI_API_KEY) {
    return fallbackResult(parsed, 'Gemini API key is not configured; using parser fallback.');
  }

  try {
    const genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: buildAnalysisPrompt(templateName, parsed),
    });
    const rawJson = stripJsonFences(result.text ?? '');
    const aiSchema = validateAiSchema(JSON.parse(rawJson), parsed.templateSchema);
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
    return fallbackResult(parsed, options.forceAi ? message : message);
  }
}
