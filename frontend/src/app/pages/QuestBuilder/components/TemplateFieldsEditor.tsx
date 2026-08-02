import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { TemplateFieldSummary, TemplateSchema } from '../../../api/exportTemplateApi';
import { QuestExportFields } from '../../../types/quest';

type QuestDialogPage = {
  id: string;
  npcId: number;
  type?: 'next' | 'nextPrev' | 'yesNo' | 'ok';
  next?: string;
  prev?: string;
  yes?: string;
  no?: string;
  accept?: boolean;
  complete?: boolean;
  end?: boolean;
  prompt: string;
};

type TemplateRef = {
  id: string;
  name: string;
  snapshot: unknown;
};

interface TemplateFieldsEditorProps {
  template: TemplateRef | null;
  fields: TemplateFieldSummary[];
  title: string;
  heading?: string;
  helpText?: string;
  surface?: 'section' | 'modal';
  exportFields: QuestExportFields;
  templateValues: Record<string, unknown>;
  onExportFieldsChange: React.Dispatch<React.SetStateAction<QuestExportFields>>;
  onTemplateValuesChange: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}

function isTemplateSnapshot(value: unknown): value is { fieldSchema?: TemplateFieldSummary[]; templateSchema?: TemplateSchema } {
  return value !== null && typeof value === 'object';
}

type TemplateItemField = NonNullable<TemplateFieldSummary['itemSchema']>[number];

function scalarValueType(value: unknown): TemplateItemField['valueType'] | undefined {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return 'boolean';
  if (typeof value === 'string' || value === null || value === undefined) return 'string';
  return undefined;
}

function mergeItemSchemas(...schemas: Array<TemplateFieldSummary['itemSchema'] | undefined>): TemplateFieldSummary['itemSchema'] {
  const byPath = new Map<string, TemplateItemField>();
  schemas.forEach((schema) => {
    schema?.forEach((field) => {
      if (!field.path) return;
      const existing = byPath.get(field.path);
      if (existing && existing.valueType === 'string' && field.valueType !== 'string') {
        byPath.set(field.path, { ...existing, valueType: field.valueType });
        return;
      }
      if (existing) return;
      byPath.set(field.path, field);
    });
  });
  return byPath.size ? [...byPath.values()] : undefined;
}

function inferItemSchemaFromRows(value: unknown): TemplateFieldSummary['itemSchema'] {
  if (!Array.isArray(value)) return undefined;
  const byPath = new Map<string, TemplateItemField>();
  value.forEach((row) => {
    if (!isRecordValue(row)) return;
    Object.entries(row).forEach(([key, child]) => {
      if (byPath.has(key)) return;
      const valueType = scalarValueType(child);
      if (!valueType) return;
      byPath.set(key, {
        path: key,
        label: toFieldLabel(key),
        valueType,
        required: false,
      });
    });
  });
  return byPath.size ? [...byPath.values()] : undefined;
}

function itemSchemaFromPromptField(field: NonNullable<TemplateSchema['promptScheme']>['fields'][number]): TemplateFieldSummary['itemSchema'] {
  return field.itemFields?.map((item) => ({
    path: item.path,
    label: item.label || toFieldLabel(item.path),
    valueType: item.valueType,
    required: false,
  }));
}

function hydrateFieldSchema(field: TemplateFieldSummary): TemplateFieldSummary {
  const itemSchema = mergeItemSchemas(field.itemSchema, inferItemSchemaFromRows(field.defaultValue));
  if (typeof field.defaultValue === 'string' && /^(true|false)$/i.test(field.defaultValue.trim())) {
    return {
      ...field,
      kind: 'boolean',
      valueType: 'boolean',
      control: 'checkbox',
      itemSchema,
    };
  }
  return itemSchema ? { ...field, itemSchema } : field;
}

function leafName(path: string) {
  return path.replace(/\[\]/g, '').split('.').pop()?.replace(/[_-]/g, '').toLowerCase() ?? '';
}

function toFieldLabel(path: string) {
  const leaf = path.replace(/\[\]/g, '').split('.').pop() ?? path;
  return leaf
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPromptLikeField(path: string) {
  return /prompt|text|message|description|body|content|script|dialog|dialogue/i.test(path);
}

function isTruthyValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return Boolean(value);
}

function emptyValueForItemField(field: TemplateItemField): string | number | boolean {
  if (field.valueType === 'number') return 0;
  if (field.valueType === 'boolean') return false;
  return '';
}

function isPromptMetadataPath(path: string) {
  return new Set([
    'id',
    'name',
    'title',
    'type',
    'kind',
    'mode',
    'npcid',
    'npc',
    'speakerid',
    'speaker',
    'characterid',
    'character',
    'next',
    'prev',
    'previous',
    'yes',
    'no',
    'accept',
    'accepted',
    'complete',
    'completed',
    'end',
    'done',
  ]).has(leafName(path));
}

function normalizePromptFieldPaths<T extends { path: string; kind?: TemplateFieldSummary['kind'] }>(fields: T[]): T[] {
  return fields.filter((field) => {
    if (isPromptMetadataPath(field.path)) return false;
    return field.kind !== 'object'
      || !fields.some((candidate) => candidate.path !== field.path && candidate.path.startsWith(`${field.path}.`));
  });
}

function defaultValueForKind(kind: TemplateFieldSummary['kind']): unknown {
  if (kind === 'number') return 0;
  if (kind === 'boolean') return false;
  if (kind === 'array') return [];
  if (kind === 'object') return {};
  return '';
}

function formatComplexValue(value: unknown, kind: TemplateFieldSummary['kind']) {
  const fallback = defaultValueForKind(kind);
  return JSON.stringify(value ?? fallback, null, 2);
}

function parseComplexValue(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function fallbackQuestIdFromTitle(title: string): number {
  const match = title.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function normalizeDialogPages(value: unknown): QuestDialogPage[] {
  if (!Array.isArray(value)) return [];
  return value.map((page, index) => {
    const raw = page && typeof page === 'object' ? page as Record<string, unknown> : {};
    return {
      id: String(raw.id ?? `page_${index + 1}`),
      npcId: Number(raw.npcId) || 0,
      type: ['next', 'nextPrev', 'yesNo', 'ok'].includes(String(raw.type)) ? raw.type as QuestDialogPage['type'] : 'ok',
      next: typeof raw.next === 'string' ? raw.next : undefined,
      prev: typeof raw.prev === 'string' ? raw.prev : undefined,
      yes: typeof raw.yes === 'string' ? raw.yes : undefined,
      no: typeof raw.no === 'string' ? raw.no : undefined,
      accept: Boolean(raw.accept),
      complete: Boolean(raw.complete),
      end: Boolean(raw.end),
      prompt: String(raw.prompt ?? ''),
    };
  });
}

function normalizeScalarArray(value: unknown): Array<string | number | boolean> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
    .map((item) => {
      if (typeof item === 'number' || typeof item === 'boolean') return item;
      return String(item ?? '');
    });
}

function scalarArrayValueType(field: TemplateFieldSummary, values: Array<string | number | boolean>): 'string' | 'number' | 'boolean' {
  if (field.gameplayRole === 'preQuest' || field.gameplayRole === 'completedQuestRequirement' || /id|ids|quest|level|amount|count|min|max|hour|minute/i.test(field.path)) return 'number';
  if (values.some((item) => typeof item === 'boolean')) return 'boolean';
  if (values.some((item) => typeof item === 'number')) return 'number';
  return 'string';
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isConditionObject(value: unknown): boolean {
  if (!isRecordValue(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0
    && entries.every(([, child]) => Array.isArray(child)
      && child.every((item) => !isRecordValue(item) || isConditionObject(item)));
}

function cloneTemplateValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function emptyConditionGroupFromSample(value: unknown): Record<string, unknown[]> {
  if (!isConditionObject(value)) return { group: [] };
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).map((key) => [key, []]));
}

function collectConditionKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isConditionObject(current)) return;
    Object.entries(current).forEach(([key, child]) => {
      keys.add(key);
      visit(child);
    });
  };
  visit(value);
  return [...keys];
}

function fillConditionGroupWithQuestIds(sample: unknown, questIds: number[]): unknown {
  if (!isConditionObject(sample)) return questIds;
  const keys = Object.keys(sample as Record<string, unknown>);
  return { [keys[0] ?? 'group']: questIds };
}

function extractNumericQuestIds(value: unknown): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? [parsed] : [];
  }
  if (Array.isArray(value)) return value.flatMap(extractNumericQuestIds);
  if (isRecordValue(value)) return Object.values(value).flatMap(extractNumericQuestIds);
  return [];
}

function isGraphQuestField(field: TemplateFieldSummary): boolean {
  return field.gameplayRole === 'preQuest' || field.gameplayRole === 'completedQuestRequirement';
}

function emptyValueForField(field: TemplateFieldSummary): unknown {
  if (field.shape === 'conditionGroup') return emptyConditionGroupFromSample(field.defaultValue);
  if (field.shape === 'conditionList' || field.shape === 'mixedList' || field.shape === 'scalarList' || field.shape === 'objectRows') return [];
  if (field.shape === 'object') return {};
  if (field.shape === 'date') return '';
  return defaultValueForKind(field.kind);
}

export function getTemplateFieldSchema(template?: TemplateRef | null): TemplateFieldSummary[] {
  if (!isTemplateSnapshot(template?.snapshot)) return [];

  const fields = (template.snapshot.templateSchema?.editableFields?.length
    ? template.snapshot.templateSchema.editableFields
    : template.snapshot.fieldSchema ?? []).map(hydrateFieldSchema);

  const arrayParents = new Set(
    fields
      .filter((field) => field.kind === 'array' && field.itemSchema?.length)
      .map((field) => field.path),
  );
  const recursiveParents = new Set(
    fields
      .filter((field) => field.shape === 'conditionGroup' || field.shape === 'mixedList')
      .map((field) => field.path),
  );

  return fields.filter((field) => {
    if (recursiveParents.has(field.path)) return true;
    if ([...recursiveParents].some((parent) => field.path.startsWith(`${parent}.`))) return false;
    if (field.kind === 'object') return false;
    const arrayChildMatch = field.path.match(/^(.*)\[\]\./);
    if (arrayChildMatch && arrayParents.has(arrayChildMatch[1])) return false;
    return true;
  });
}

export function getTemplatePromptFieldSchema(template?: TemplateRef | null): TemplateFieldSummary[] {
  if (!isTemplateSnapshot(template?.snapshot)) return [];
  const fields = (template.snapshot.templateSchema?.editableFields?.length
    ? template.snapshot.templateSchema.editableFields
    : template.snapshot.fieldSchema ?? []).map(hydrateFieldSchema);
  const byPath = new Map(fields.map((field) => [field.path, field]));
  const promptFields = normalizePromptFieldPaths(template.snapshot.templateSchema?.promptScheme?.fields ?? []);

  return promptFields.flatMap((promptField) => {
    const existing = byPath.get(promptField.path);
    const mergedItemSchema = mergeItemSchemas(
      existing?.itemSchema,
      itemSchemaFromPromptField(promptField),
      inferItemSchemaFromRows(promptField.defaultValue),
    );
    if (existing) {
      return [{
        ...existing,
        label: promptField.label || existing.label,
        description: promptField.description || existing.description,
        control: existing.control === 'dialogFlow' ? (mergedItemSchema?.length ? 'rows' : 'json') : existing.control,
        itemSchema: mergedItemSchema,
        fillSource: promptField.fillSource ?? existing.fillSource,
      }];
    }
    if (!promptField.path) return [];
    return [{
      path: promptField.path,
      templatePath: promptField.path,
      label: promptField.label,
      kind: promptField.kind,
      valueType: promptField.kind === 'text' ? 'string' : promptField.kind,
      control: promptField.control ?? 'text',
      shape: promptField.shape ?? 'scalar',
      gameplayRole: 'questDialog',
      fillSource: promptField.fillSource ?? 'ai',
      required: false,
      description: promptField.description ?? `Prompt field "${promptField.path}" detected from template scheme.`,
      defaultValue: promptField.defaultValue,
      itemSchema: mergedItemSchema,
    } satisfies TemplateFieldSummary];
  });
}

export function TemplateFieldsEditor({
  template,
  fields,
  title,
  heading = 'Template Fields',
  helpText,
  surface = 'section',
  exportFields,
  templateValues,
  onExportFieldsChange,
  onTemplateValuesChange,
}: TemplateFieldsEditorProps) {
  const [sectionOpen, setSectionOpen] = useState(surface === 'modal');

  const updateTemplateValue = (path: string, value: unknown) => {
    onTemplateValuesChange((prev) => ({ ...prev, [path]: value }));
  };

  const updateTemplateFieldValue = (field: TemplateFieldSummary, value: unknown) => {
    updateTemplateValue(field.path, value);
    if (field.gameplayRole === 'preQuest' || field.gameplayRole === 'completedQuestRequirement') {
      onExportFieldsChange((prev) => ({ ...prev, preQuest: extractNumericQuestIds(value) }));
    }
  };

  const updateArrayField = (path: string, rows: Record<string, unknown>[]) => updateTemplateValue(path, rows);

  const getSchemaDefaultValue = (field: TemplateFieldSummary): unknown => {
    if (field.gameplayRole === 'questName') return title;
    if (field.gameplayRole === 'questId') return exportFields.questId ?? fallbackQuestIdFromTitle(title);
    if (field.gameplayRole === 'preQuest') return exportFields.preQuest;
    if (field.gameplayRole === 'completedQuestRequirement') {
      return field.shape === 'conditionGroup'
        ? fillConditionGroupWithQuestIds(field.defaultValue, exportFields.preQuest)
        : exportFields.preQuest;
    }
    if (field.fillSource === 'templateDefault') return cloneTemplateValue(field.defaultValue ?? defaultValueForKind(field.kind));
    return emptyValueForField(field);
  };

  const renderScalarEditor = (value: unknown, onChange: (next: unknown) => void, placeholder = 'Value') => {
    if (typeof value === 'boolean') {
      return (
        <label className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-purple-600"
          />
          Enabled
        </label>
      );
    }
    return (
      <input
        type={typeof value === 'number' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) || 0 : e.target.value)}
        placeholder={placeholder}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
      />
    );
  };

  const renderRecursiveEditor = (
    value: unknown,
    onChange: (next: unknown) => void,
    trail: string,
    depth = 0,
    groupKeys: string[] = collectConditionKeys(value),
  ): React.ReactNode => {
    if (Array.isArray(value)) {
      const addValue = () => onChange([...value, 0]);
      const availableGroupKeys = groupKeys.length ? groupKeys : ['group'];
      const addGroup = (operator: string) => onChange([...value, { [operator]: [] }]);
      return (
        <div className="space-y-2">
          {value.length === 0 && <p className="text-xs text-zinc-600 italic">No values yet</p>}
          {value.map((item, index) => (
            <div key={`${trail}.${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {renderRecursiveEditor(item, (next) => onChange(value.map((row, rowIndex) => rowIndex === index ? next : row)), `${trail}.${index}`, depth + 1, groupKeys)}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}
                  className="px-2 py-2 text-zinc-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={addValue} className="text-xs text-purple-300 hover:text-purple-200">Add value</button>
            {availableGroupKeys.map((key) => (
              <button key={key} type="button" onClick={() => addGroup(key)} className="text-xs text-purple-300 hover:text-purple-200">
                Add {key} group
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (isRecordValue(value)) {
      const entries = Object.entries(value);
      const conditionGroup = isConditionObject(value);
      const updateKey = (oldKey: string, newKey: string) => {
        if (!newKey.trim() || newKey === oldKey) return;
        const next = { ...value };
        next[newKey.trim()] = next[oldKey];
        delete next[oldKey];
        onChange(next);
      };
      const updateChild = (key: string, nextValue: unknown) => onChange({ ...value, [key]: nextValue });
      const removeKey = (key: string) => {
        const next = { ...value };
        delete next[key];
        onChange(next);
      };
      return (
        <div className={`space-y-3 ${depth > 0 ? 'border-l border-zinc-800 pl-3' : ''}`}>
          {entries.length === 0 && <p className="text-xs text-zinc-600 italic">No properties yet</p>}
          {entries.map(([key, child]) => (
            <div key={`${trail}.${key}`} className="space-y-2">
              <div className="flex items-center gap-2">
                {conditionGroup ? (
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500 w-20">{key}</span>
                ) : (
                  <input
                    value={key}
                    onChange={(e) => updateKey(key, e.target.value)}
                    className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-purple-500"
                  />
                )}
                {!conditionGroup && (
                  <button
                    type="button"
                    onClick={() => removeKey(key)}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    Remove
                  </button>
                )}
              </div>
              {renderRecursiveEditor(child, (next) => updateChild(key, next), `${trail}.${key}`, depth + 1, groupKeys)}
            </div>
          ))}
          {!conditionGroup && (
            <button
              type="button"
              onClick={() => onChange({ ...value, field: '' })}
              className="text-xs text-purple-300 hover:text-purple-200"
            >
              Add property
            </button>
          )}
        </div>
      );
    }

    return renderScalarEditor(value ?? '', onChange);
  };

  const renderTemplateFieldInput = (field: TemplateFieldSummary, current: unknown) => {
    const path = field.path;
    if (field.shape === 'conditionGroup' || field.shape === 'conditionList' || field.shape === 'mixedList') {
      const groupKeys = collectConditionKeys(field.defaultValue).length
        ? collectConditionKeys(field.defaultValue)
        : collectConditionKeys(current);
      return renderRecursiveEditor(current, (next) => updateTemplateFieldValue(field, next), path, 0, groupKeys);
    }
    if (field.control === 'dialogFlow') {
      const pages = normalizeDialogPages(current);
      const updatePage = (index: number, updates: Partial<QuestDialogPage>) => {
        updateTemplateValue(path, pages.map((page, pageIndex) => pageIndex === index ? { ...page, ...updates } : page));
      };
      return (
        <div className="space-y-3">
          {pages.length === 0 && <p className="text-xs text-zinc-600 italic">No dialog pages yet</p>}
          {pages.map((page, index) => (
            <div key={`${page.id}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={page.id} onChange={(e) => updatePage(index, { id: e.target.value })} placeholder="Page ID" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                <input type="number" value={page.npcId || ''} onChange={(e) => updatePage(index, { npcId: Number(e.target.value) || 0 })} placeholder="NPC ID" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <select value={page.type ?? 'ok'} onChange={(e) => updatePage(index, { type: e.target.value as QuestDialogPage['type'] })} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500">
                  <option value="ok">OK</option>
                  <option value="next">Next</option>
                  <option value="nextPrev">Next/Prev</option>
                  <option value="yesNo">Yes/No</option>
                </select>
                <input value={page.next ?? ''} onChange={(e) => updatePage(index, { next: e.target.value || undefined })} placeholder="Next" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                <input value={page.prev ?? ''} onChange={(e) => updatePage(index, { prev: e.target.value || undefined })} placeholder="Prev" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                <input value={page.yes ?? ''} onChange={(e) => updatePage(index, { yes: e.target.value || undefined })} placeholder="Yes" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                <input value={page.no ?? ''} onChange={(e) => updatePage(index, { no: e.target.value || undefined })} placeholder="No" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <textarea value={page.prompt} onChange={(e) => updatePage(index, { prompt: e.target.value })} rows={3} placeholder="Dialog prompt" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-y" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3">
                  {(['accept', 'complete', 'end'] as const).map((flag) => (
                    <label key={flag} className="flex items-center gap-1.5 text-xs text-zinc-400 capitalize">
                      <input type="checkbox" checked={Boolean(page[flag])} onChange={(e) => updatePage(index, { [flag]: e.target.checked })} className="accent-purple-600" />
                      {flag}
                    </label>
                  ))}
                </div>
                <button type="button" onClick={() => updateTemplateValue(path, pages.filter((_, pageIndex) => pageIndex !== index))} className="text-xs text-red-300 hover:text-red-200">
                  Remove page
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateTemplateValue(path, [...pages, { id: `page_${pages.length + 1}`, npcId: 0, type: 'ok', prompt: '' }])}
            className="text-xs text-purple-300 hover:text-purple-200"
          >
            Add dialog page
          </button>
        </div>
      );
    }
    if (field.kind === 'boolean' || field.control === 'checkbox') {
      return (
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={isTruthyValue(current)} onChange={(e) => updateTemplateFieldValue(field, e.target.checked)} className="accent-purple-600" />
          Enabled
        </label>
      );
    }
    if (field.kind === 'number' || field.control === 'number') {
      return <input type="number" value={typeof current === 'number' ? current : Number(current) || 0} onChange={(e) => updateTemplateFieldValue(field, Number(e.target.value) || 0)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />;
    }
    if (field.control === 'date') {
      return <input type="date" value={typeof current === 'string' ? current : ''} onChange={(e) => updateTemplateFieldValue(field, e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />;
    }
    if (field.kind === 'array' && field.itemSchema?.length) {
      const rows = Array.isArray(current) ? current as Record<string, unknown>[] : [];
      const cardLayout = field.itemSchema.length > 4 || field.itemSchema.some((itemField) => isPromptLikeField(itemField.path));
      const updateRow = (rowIndex: number, itemField: TemplateItemField, rawValue: string | boolean) => {
        const value = itemField.valueType === 'number'
          ? Number(rawValue) || 0
          : itemField.valueType === 'boolean'
            ? Boolean(rawValue)
            : String(rawValue);
        updateArrayField(path, rows.map((item, index) => index === rowIndex ? { ...item, [itemField.path]: value } : item));
      };
      const renderItemField = (row: Record<string, unknown>, rowIndex: number, itemField: TemplateItemField) => {
        const value = row[itemField.path] ?? emptyValueForItemField(itemField);
        const promptField = isPromptLikeField(itemField.path);
        if (itemField.valueType === 'boolean') {
          return (
            <label className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={isTruthyValue(value)}
                onChange={(e) => updateRow(rowIndex, itemField, e.target.checked)}
                className="accent-purple-600"
              />
              {itemField.label}
            </label>
          );
        }
        if (promptField) {
          return (
            <textarea
              rows={4}
              placeholder={itemField.label}
              value={String(value ?? '')}
              onChange={(e) => updateRow(rowIndex, itemField, e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm leading-relaxed focus:outline-none focus:border-purple-500 resize-y"
            />
          );
        }
        return (
          <input
            type={itemField.valueType === 'number' ? 'number' : 'text'}
            placeholder={itemField.label}
            value={String(value ?? '')}
            onChange={(e) => updateRow(rowIndex, itemField, e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
          />
        );
      };

      return (
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-xs text-zinc-600 italic">No rows yet</p>}
          {!cardLayout && (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${field.itemSchema.length}, minmax(0, 1fr)) auto` }}>
              {field.itemSchema.map((itemField) => <span key={itemField.path} className="text-[10px] uppercase tracking-wide text-zinc-500">{itemField.label}</span>)}
              <span />
            </div>
          )}
          {rows.map((row, rowIndex) => cardLayout ? (
            <div key={rowIndex} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-400">Row {rowIndex + 1}</span>
                <button type="button" onClick={() => updateArrayField(path, rows.filter((_, index) => index !== rowIndex))} className="text-xs text-red-300 hover:text-red-200">
                  Remove row
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {field.itemSchema!.map((itemField) => (
                  <div key={itemField.path} className={isPromptLikeField(itemField.path) ? 'sm:col-span-2' : ''}>
                    <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 block">{itemField.label}</label>
                    {renderItemField(row, rowIndex, itemField)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${field.itemSchema!.length}, minmax(0, 1fr)) auto` }}>
              {field.itemSchema!.map((itemField) => <div key={itemField.path}>{renderItemField(row, rowIndex, itemField)}</div>)}
              <button type="button" onClick={() => updateArrayField(path, rows.filter((_, index) => index !== rowIndex))} className="px-3 py-2 text-zinc-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateArrayField(path, [...rows, Object.fromEntries(field.itemSchema!.map((itemField) => [itemField.path, emptyValueForItemField(itemField)]))])}
            className="text-xs text-purple-300 hover:text-purple-200"
          >
            Add row
          </button>
        </div>
      );
    }
    if (field.kind === 'array') {
      const rows = normalizeScalarArray(current);
      const valueType = scalarArrayValueType(field, rows);
      const emptyValue = valueType === 'number' ? 0 : valueType === 'boolean' ? false : '';
      const updateScalarRows = (nextRows: Array<string | number | boolean>) => updateTemplateFieldValue(field, nextRows);
      const setRow = (rowIndex: number, value: string | number | boolean) => {
        updateScalarRows(rows.map((item, index) => index === rowIndex ? value : item));
      };

      return (
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-xs text-zinc-600 italic">No values yet</p>}
          {rows.map((item, rowIndex) => (
            <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              {valueType === 'boolean' ? (
                <label className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={Boolean(item)} onChange={(e) => setRow(rowIndex, e.target.checked)} className="accent-purple-600" />
                  Enabled
                </label>
              ) : (
                <input type={valueType === 'number' ? 'number' : 'text'} value={String(item)} onChange={(e) => setRow(rowIndex, valueType === 'number' ? Number(e.target.value) || 0 : e.target.value)} placeholder="Value" className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
              )}
              <button type="button" onClick={() => updateScalarRows(rows.filter((_, index) => index !== rowIndex))} className="px-3 py-2 text-zinc-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => updateScalarRows([...rows, emptyValue])} className="text-xs text-purple-300 hover:text-purple-200">
            Add value
          </button>
        </div>
      );
    }
    if (field.kind === 'array' || field.kind === 'object' || field.control === 'json' || field.control === 'rows') {
      return <textarea value={formatComplexValue(current, field.kind)} onChange={(e) => updateTemplateFieldValue(field, parseComplexValue(e.target.value))} rows={4} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-purple-500 resize-y" />;
    }
    return <input value={String(current ?? '')} onChange={(e) => updateTemplateFieldValue(field, e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />;
  };

  return (
    <div className={`${surface === 'section' ? 'border-t border-zinc-800 pt-5' : ''} space-y-4`}>
      {surface === 'section' ? (
        <button
          type="button"
          onClick={() => setSectionOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-white text-sm font-semibold">{heading}</span>
            <span className="block text-zinc-500 text-xs mt-1">
              {helpText ?? `Editing values for ${template?.name}. These values override template placeholders in export.`}
            </span>
          </span>
          {sectionOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </button>
      ) : (
        <div>
          <h3 className="text-white text-sm font-semibold">{heading}</h3>
          <p className="text-zinc-500 text-xs mt-1">
            {helpText ?? `Editing values for ${template?.name}. These values override template placeholders in export.`}
          </p>
        </div>
      )}

      {sectionOpen && <div className="grid grid-cols-1 gap-3">
        {fields.map((field) => {
          const current = isGraphQuestField(field)
            ? getSchemaDefaultValue(field)
            : templateValues[field.path] ?? getSchemaDefaultValue(field);
          return (
            <div key={field.path}>
              <label className="text-zinc-400 text-xs uppercase tracking-wide mb-1 block">
                {field.label}
                <span className="ml-2 normal-case text-zinc-600">{field.templatePath ?? field.path}</span>
              </label>
              {field.description && <p className="text-zinc-600 text-xs mb-2">{field.description}</p>}
              {renderTemplateFieldInput(field, current)}
            </div>
          );
        })}
      </div>}
    </div>
  );
}
