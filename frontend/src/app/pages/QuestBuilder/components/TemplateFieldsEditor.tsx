import React from 'react';
import { ChevronDown, ChevronRight, Maximize2, X } from 'lucide-react';
import { TemplateFieldSummary, TemplateSchema } from '../../../api/exportTemplateApi';
import { QuestExportFields } from '../../../types/quest';
import { DialogFlowEditorDialog } from './DialogFlowEditorDialog';

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
  exportFields: QuestExportFields;
  templateValues: Record<string, unknown>;
  onExportFieldsChange: React.Dispatch<React.SetStateAction<QuestExportFields>>;
  onTemplateValuesChange: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}

type TemplateFieldGroup = {
  key: string;
  label: string;
  fields: TemplateFieldSummary[];
};

function isTemplateSnapshot(value: unknown): value is { fieldSchema?: TemplateFieldSummary[]; templateSchema?: TemplateSchema } {
  return value !== null && typeof value === 'object';
}

function getTemplateSchema(template?: TemplateRef | null): TemplateSchema | undefined {
  return isTemplateSnapshot(template?.snapshot) ? template.snapshot.templateSchema : undefined;
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

function groupTemplateFields(fields: TemplateFieldSummary[]): TemplateFieldGroup[] {
  const groups = new Map<string, TemplateFieldSummary[]>();
  for (const field of fields) {
    const key = field.path.split('.')[0] || 'quest';
    groups.set(key, [...(groups.get(key) ?? []), field]);
  }
  return [...groups.entries()].map(([key, groupFields]) => ({
    key,
    label: key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()),
    fields: groupFields,
  }));
}

export function getTemplateFieldSchema(template?: TemplateRef | null): TemplateFieldSummary[] {
  if (!isTemplateSnapshot(template?.snapshot)) return [];

  const fields = template.snapshot.templateSchema?.editableFields?.length
    ? template.snapshot.templateSchema.editableFields
    : template.snapshot.fieldSchema ?? [];

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

export function TemplateFieldsEditor({
  template,
  fields,
  title,
  exportFields,
  templateValues,
  onExportFieldsChange,
  onTemplateValuesChange,
}: TemplateFieldsEditorProps) {
  const updateTemplateValue = (path: string, value: unknown) => {
    onTemplateValuesChange((prev) => ({ ...prev, [path]: value }));
  };
  const fieldGroups = React.useMemo(() => groupTemplateFields(fields), [fields]);
  const templateSchema = getTemplateSchema(template);
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});
  const [dialogField, setDialogField] = React.useState<TemplateFieldSummary | null>(null);

  const isSectionExpanded = (key: string, index: number) => expandedSections[key] ?? index === 0;
  const toggleSection = (key: string, index: number) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !(prev[key] ?? index === 0) }));
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
        <label className="flex items-center gap-2 bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-sm text-steel-200">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-pulse"
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
        className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
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
          {value.length === 0 && <p className="text-xs text-steel-500 italic">No values yet</p>}
          {value.map((item, index) => (
            <div key={`${trail}.${index}`} className="rounded-lg border border-steel-700 bg-steel-950/50 p-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {renderRecursiveEditor(item, (next) => onChange(value.map((row, rowIndex) => rowIndex === index ? next : row)), `${trail}.${index}`, depth + 1, groupKeys)}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}
                  className="px-2 py-2 text-steel-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={addValue} className="text-xs text-pulse hover:text-pulse">Add value</button>
            {availableGroupKeys.map((key) => (
              <button key={key} type="button" onClick={() => addGroup(key)} className="text-xs text-pulse hover:text-pulse">
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
        <div className={`space-y-3 ${depth > 0 ? 'border-l border-steel-700 pl-3' : ''}`}>
          {entries.length === 0 && <p className="text-xs text-steel-500 italic">No properties yet</p>}
          {entries.map(([key, child]) => (
            <div key={`${trail}.${key}`} className="space-y-2">
              <div className="flex items-center gap-2">
                {conditionGroup ? (
                  <span className="text-[10px] uppercase tracking-wide text-steel-400 w-20">{key}</span>
                ) : (
                  <input
                    value={key}
                    onChange={(e) => updateKey(key, e.target.value)}
                    className="w-32 bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-xs focus:outline-none focus:border-pulse"
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
              className="text-xs text-pulse hover:text-pulse"
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
      const promptCount = pages.filter((page) => page.prompt.trim()).length;
      return (
        <div className="rounded-lg border border-steel-700 bg-steel-950/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-steel-100 font-medium">{pages.length} dialog pages</p>
              <p className="text-xs text-steel-500">{promptCount} pages with generated text</p>
            </div>
            <button
              type="button"
              onClick={() => setDialogField(field)}
              className="flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 text-steel-100 rounded-lg text-xs"
            >
              <Maximize2 className="w-4 h-4" />
              Open dialog graph
            </button>
          </div>
          {pages[0]?.prompt && <p className="mt-3 text-xs text-steel-400 line-clamp-2">{pages[0].prompt}</p>}
        </div>
      );
    }
    if (field.kind === 'boolean' || field.control === 'checkbox') {
      return (
        <label className="inline-flex items-center gap-2 text-sm text-steel-200">
          <input type="checkbox" checked={Boolean(current)} onChange={(e) => updateTemplateFieldValue(field, e.target.checked)} className="accent-pulse" />
          Enabled
        </label>
      );
    }
    if (field.kind === 'number' || field.control === 'number') {
      return <input type="number" value={typeof current === 'number' ? current : Number(current) || 0} onChange={(e) => updateTemplateFieldValue(field, Number(e.target.value) || 0)} className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse" />;
    }
    if (field.control === 'date') {
      return <input type="date" value={typeof current === 'string' ? current : ''} onChange={(e) => updateTemplateFieldValue(field, e.target.value)} className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse" />;
    }
    if (field.kind === 'array' && field.itemSchema?.length) {
      const rows = Array.isArray(current) ? current as Record<string, unknown>[] : [];
      return (
        <div className="space-y-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${field.itemSchema.length}, minmax(0, 1fr)) auto` }}>
            {field.itemSchema.map((itemField) => <span key={itemField.path} className="text-[10px] uppercase tracking-wide text-steel-400">{itemField.label}</span>)}
            <span />
          </div>
          {rows.length === 0 && <p className="text-xs text-steel-500 italic">No rows yet</p>}
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${field.itemSchema!.length}, minmax(0, 1fr)) auto` }}>
              {field.itemSchema!.map((itemField) => (
                <input
                  key={itemField.path}
                  type={itemField.valueType === 'number' ? 'number' : 'text'}
                  placeholder={itemField.label}
                  value={String(row[itemField.path] ?? '')}
                  onChange={(e) => {
                    const value = itemField.valueType === 'number' ? Number(e.target.value) || 0 : e.target.value;
                    updateArrayField(path, rows.map((item, index) => index === rowIndex ? { ...item, [itemField.path]: value } : item));
                  }}
                  className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                />
              ))}
              <button type="button" onClick={() => updateArrayField(path, rows.filter((_, index) => index !== rowIndex))} className="px-3 py-2 text-steel-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateArrayField(path, [...rows, Object.fromEntries(field.itemSchema!.map((itemField) => [itemField.path, itemField.valueType === 'number' ? 0 : '']))])}
            className="text-xs text-pulse hover:text-pulse"
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
          {rows.length === 0 && <p className="text-xs text-steel-500 italic">No values yet</p>}
          {rows.map((item, rowIndex) => (
            <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              {valueType === 'boolean' ? (
                <label className="flex items-center gap-2 bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-sm text-steel-200">
                  <input type="checkbox" checked={Boolean(item)} onChange={(e) => setRow(rowIndex, e.target.checked)} className="accent-pulse" />
                  Enabled
                </label>
              ) : (
                <input type={valueType === 'number' ? 'number' : 'text'} value={String(item)} onChange={(e) => setRow(rowIndex, valueType === 'number' ? Number(e.target.value) || 0 : e.target.value)} placeholder="Value" className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse" />
              )}
              <button type="button" onClick={() => updateScalarRows(rows.filter((_, index) => index !== rowIndex))} className="px-3 py-2 text-steel-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => updateScalarRows([...rows, emptyValue])} className="text-xs text-pulse hover:text-pulse">
            Add value
          </button>
        </div>
      );
    }
    if (field.kind === 'array' || field.kind === 'object' || field.control === 'json' || field.control === 'rows') {
      return <textarea value={formatComplexValue(current, field.kind)} onChange={(e) => updateTemplateFieldValue(field, parseComplexValue(e.target.value))} rows={4} className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm font-mono focus:outline-none focus:border-pulse resize-y" />;
    }
    return <input value={String(current ?? '')} onChange={(e) => updateTemplateFieldValue(field, e.target.value)} className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse" />;
  };

  return (
    <div className="border-t border-steel-700 pt-5 space-y-4">
      <div>
        <h3 className="text-steel-100 text-sm font-semibold">Template Fields</h3>
        <p className="text-steel-400 text-xs mt-1">
          Editing values for {template?.name}. These values override template placeholders in export.
        </p>
      </div>

      <div className="space-y-3">
        {fieldGroups.map((group, index) => {
          const expanded = isSectionExpanded(group.key, index);
          return (
            <section key={group.key} className="rounded-lg border border-steel-700 bg-steel-950/40">
              <button
                type="button"
                onClick={() => toggleSection(group.key, index)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-steel-800/60"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {expanded ? <ChevronDown className="w-4 h-4 text-steel-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-steel-400 shrink-0" />}
                  <span className="text-steel-100 text-sm font-medium truncate">{group.label}</span>
                </span>
                <span className="text-[11px] text-steel-500 shrink-0">{group.fields.length} fields</span>
              </button>

              {expanded && (
                <div className="border-t border-steel-700 px-3 py-3 space-y-3">
                  {group.fields.map((field) => {
                    const current = isGraphQuestField(field)
                      ? getSchemaDefaultValue(field)
                      : templateValues[field.path] ?? getSchemaDefaultValue(field);
                    return (
                      <div key={field.path}>
                        <label className="text-steel-400 text-xs uppercase tracking-wide mb-1 block">
                          {field.label}
                          <span className="ml-2 normal-case text-steel-500">{field.templatePath ?? field.path}</span>
                        </label>
                        {field.description && <p className="text-steel-500 text-xs mb-2">{field.description}</p>}
                        {renderTemplateFieldInput(field, current)}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <DialogFlowEditorDialog
        isOpen={Boolean(dialogField)}
        field={dialogField}
        templateSchema={templateSchema}
        value={dialogField ? templateValues[dialogField.path] ?? getSchemaDefaultValue(dialogField) : []}
        onClose={() => setDialogField(null)}
        onChange={(next) => {
          if (dialogField) updateTemplateValue(dialogField.path, next);
        }}
      />
    </div>
  );
}
