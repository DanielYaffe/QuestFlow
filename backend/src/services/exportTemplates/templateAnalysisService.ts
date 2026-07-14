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

function buildAnalysisPrompt(templateName: string, parsed: ParsedTemplate): string {
  return `You analyze quest export templates.

Template name: ${templateName}
Input format: ${parsed.format}

Parser-created schema fields. These paths, field kinds, controls, and item schemas are already the source of truth:
${JSON.stringify(parsed.fieldSchema.map(compactField), null, 2)}

Return ONLY valid JSON. Do not include markdown.

You may improve only labels, descriptions, gameplayRole, fillSource, required, and generationContract.
You must not invent new field paths. Use only paths from the detected editable fields.
You must not change field paths, nesting, kind, valueType, control, shape, defaultValue, or itemSchema. The parser owns the form structure, including date controls and recursive list/object fields.
Do not copy placeholder IDs, item values, monster values, amounts, or example text as answers.
If a field is under requirements.complete, that does not automatically mean dialog. It is dialog only when it clearly represents dialogue pages/conversation/script text.

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
    "promptSummary": "compact prompt guidance for quest generation"
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
    promptSummary: typeof raw.generationContract?.promptSummary === 'string' && raw.generationContract.promptSummary.trim()
      ? raw.generationContract.promptSummary.trim()
      : summary,
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
  options: { forceAi?: boolean } = {},
): Promise<AnalysisResult> {
  if (!hasGenApiKey()) {
    return fallbackResult(parsed, 'AI provider API key is not configured; using parser fallback.');
  }

  try {
    const rawJson = stripJsonFences(await complete(buildAnalysisPrompt(templateName, parsed)));
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
