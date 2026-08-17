import React, { useEffect, useMemo, useState } from 'react';
import { Braces, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AssetFieldType,
  ProjectAssetField,
  ProjectAssetSchema,
  ProjectValuePool,
} from '../../api/projectApi';

function cloneFields(value?: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

const REMOVED_ADAPTER_FIELD_KEYS = new Set(['exportEnabled', 'operation', 'nativePath']);

function removeRemovedAdapterFields(value: Record<string, unknown>): Record<string, unknown> {
  const next = cloneFields(value);
  for (const key of REMOVED_ADAPTER_FIELD_KEYS) delete next[key];
  return next;
}

function setNestedValue(
  root: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const next = cloneFields(root);
  let cursor: Record<string, unknown> = next;
  for (const segment of path.slice(0, -1)) {
    const existing = cursor[segment];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

function getNestedValue(root: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function parseValue(value: string, type: AssetFieldType): unknown {
  if (type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (type === 'boolean') return value === 'true';
  return value;
}

function parsePrimitiveList(value: string, itemType: AssetFieldType | undefined): unknown[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseValue(line, itemType ?? 'text'));
}

function formatPrimitiveList(value: unknown): string {
  return Array.isArray(value) ? value.map((entry) => String(entry)).join('\n') : '';
}

function poolFor(field: ProjectAssetField, pools: ProjectValuePool[]): ProjectValuePool | undefined {
  return field.poolKey ? pools.find((pool) => pool.key === field.poolKey) : undefined;
}

function objectRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {}))
    : [];
}

function FieldInput({
  field,
  path,
  value,
  pools,
  onChange,
}: {
  field: ProjectAssetField;
  path: string[];
  value: unknown;
  pools: ProjectValuePool[];
  onChange: (path: string[], value: unknown) => void;
}) {
  const pool = poolFor(field, pools);
  const label = (
    <label className="block text-steel-400 text-[11px] uppercase tracking-wide mb-1">
      {field.label}
      {field.required && <span className="text-red-300 ml-1">*</span>}
    </label>
  );
  const inputClass = 'w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-sm focus:outline-none focus:border-pulse';

  if (field.type === 'object') {
    return (
      <div className="border border-steel-700 rounded-md p-3">
        <div className="text-steel-200 text-xs font-semibold mb-2">{field.label}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(field.fields ?? []).map((child) => (
            <FieldInput
              key={child.key}
              field={child}
              path={[...path, child.key]}
              value={getNestedValue(value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}, [child.key])}
              pools={pools}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div>
        {label}
        <label className="flex items-center gap-2 bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(path, event.target.checked)}
            className="accent-pulse"
          />
          Enabled
        </label>
      </div>
    );
  }

  if (pool?.options.length) {
    return (
      <div>
        {label}
        <select
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => {
            const option = pool.options.find((entry) => String(entry.value) === event.target.value);
            onChange(path, option?.value ?? '');
          }}
          className={inputClass}
        >
          <option value="">None</option>
          {pool.options.map((option) => (
            <option key={`${option.label}:${String(option.value)}`} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'list') {
    const complex = field.itemType === 'object' || Boolean(field.fields?.length);
    if (complex && field.fields?.length) {
      const rows = objectRows(value);
      const addRow = () => onChange(path, [...rows, {}]);
      const removeRow = (index: number) => onChange(path, rows.filter((_, rowIndex) => rowIndex !== index));
      const updateRow = (index: number, childPath: string[], nextValue: unknown) => {
        const nextRows = rows.map((row, rowIndex) => (
          rowIndex === index ? setNestedValue(row, childPath, nextValue) : row
        ));
        onChange(path, nextRows);
      };

      return (
        <div className="sm:col-span-2 border border-steel-700 rounded-md p-3">
          <div className="flex items-center gap-2 mb-3">
            <div>
              <div className="text-steel-200 text-xs font-semibold">
                {field.label}
                {field.required && <span className="text-red-300 ml-1">*</span>}
              </div>
              {field.description && <p className="text-steel-500 text-[11px] mt-0.5">{field.description}</p>}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-pulse" />
              Add row
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="text-steel-500 text-xs">No rows yet.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div key={index} className="border border-steel-700/80 rounded-md p-3 bg-steel-900/35">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-steel-400 text-xs font-semibold">Row {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="ml-auto flex items-center gap-1.5 px-2 py-1 text-red-300 hover:text-red-200 text-xs rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {field.fields.map((child) => (
                      <FieldInput
                        key={child.key}
                        field={child}
                        path={[child.key]}
                        value={getNestedValue(row, [child.key])}
                        pools={pools}
                        onChange={(childPath, nextValue) => updateRow(index, childPath, nextValue)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="sm:col-span-2">
        {label}
        <textarea
          value={complex ? JSON.stringify(value ?? [], null, 2) : formatPrimitiveList(value)}
          onChange={(event) => {
            if (!complex) {
              onChange(path, parsePrimitiveList(event.target.value, field.itemType));
              return;
            }
            try {
              onChange(path, JSON.parse(event.target.value));
            } catch {
              onChange(path, event.target.value);
            }
          }}
          rows={complex ? 6 : 3}
          placeholder={complex ? '[{ "field": "value" }]' : 'One value per line'}
          className={`${inputClass} resize-y font-mono text-xs`}
        />
      </div>
    );
  }

  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
  return (
    <div>
      {label}
      <input
        type={inputType}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(event) => onChange(path, parseValue(event.target.value, field.type))}
        className={inputClass}
      />
    </div>
  );
}

export function CustomFieldsPanel({
  assetType,
  schema,
  value,
  onSave,
}: {
  assetType: string;
  schema?: ProjectAssetSchema;
  value?: Record<string, unknown>;
  onSave: (value: Record<string, unknown>) => Promise<void>;
}) {
  const assetSchema = useMemo(
    () => schema?.assetTypes?.find((entry) => entry.key === assetType),
    [assetType, schema],
  );
  const [draft, setDraft] = useState<Record<string, unknown>>(() => cloneFields(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(cloneFields(value));
  }, [value]);

  if (!assetSchema || assetSchema.fields.length === 0) {
    return (
      <section className="bg-steel-850 border border-steel-700 rounded-md">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-steel-700">
          <Braces className="w-4 h-4 text-pulse" />
          <h2 className="text-steel-100 text-sm font-semibold">Project Attributes</h2>
        </div>
        <div className="p-4">
          <p className="text-steel-400 text-xs">
            No attributes are configured for this asset type yet. Add project attributes from Settings to edit game-specific values here.
          </p>
        </div>
      </section>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const sanitized = removeRemovedAdapterFields(draft);
      await onSave(sanitized);
      setDraft(sanitized);
      toast.success('Attributes saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save attributes';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-steel-850 border border-steel-700 rounded-md">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-steel-700">
        <Braces className="w-4 h-4 text-pulse" />
        <h2 className="text-steel-100 text-sm font-semibold">{assetSchema.name} Attributes</h2>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Save
        </button>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {assetSchema.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              path={[field.key]}
              value={draft[field.key]}
              pools={schema?.valuePools ?? []}
              onChange={(path, nextValue) => setDraft((current) => setNestedValue(current, path, nextValue))}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
