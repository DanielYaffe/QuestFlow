import React, { useEffect, useMemo, useState } from 'react';
import { Braces, ChevronDown, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AssetFieldType,
  Project,
  ProjectAssetField,
  ProjectAssetSchema,
  ProjectValuePool,
  ProjectValueRange,
  updateProject,
} from '../../../api/projectApi';
import { useProject } from '../../../context/ProjectContext';

const DEFAULT_ASSET_TYPES = [
  { key: 'npc', name: 'NPC', fields: [] },
  { key: 'monster', name: 'Monster', fields: [] },
  { key: 'item', name: 'Item', fields: [] },
];

const FIELD_TYPES: AssetFieldType[] = [
  'text',
  'number',
  'boolean',
  'date',
  'object',
  'list',
  'image',
  'enum',
  'reference',
];

const REMOVED_ADAPTER_FIELD_KEYS = new Set(['exportEnabled', 'operation', 'nativePath']);

function cloneSchema(schema: ProjectAssetSchema): ProjectAssetSchema {
  return JSON.parse(JSON.stringify(schema)) as ProjectAssetSchema;
}

function normalizeFields(fields?: ProjectAssetField[]): ProjectAssetField[] {
  return Array.isArray(fields)
    ? fields.filter((field) => !REMOVED_ADAPTER_FIELD_KEYS.has(field.key)).map((field) => ({
      key: field.key,
      label: field.label || field.key,
      type: field.type || 'text',
      required: Boolean(field.required),
      nullable: field.nullable !== false,
      description: field.description ?? '',
      poolKey: field.poolKey ?? '',
      itemType: field.itemType,
      fields: normalizeFields(field.fields),
    }))
    : [];
}

function defaultSchema(schema?: Partial<ProjectAssetSchema> | null): ProjectAssetSchema {
  const assetTypes = Array.isArray(schema?.assetTypes) && schema.assetTypes.length > 0
    ? schema.assetTypes.map((assetType) => ({
      key: assetType.key,
      name: assetType.name || assetType.key,
      description: assetType.description ?? '',
      fields: normalizeFields(assetType.fields),
    }))
    : DEFAULT_ASSET_TYPES.map((assetType) => ({ ...assetType, fields: [] }));

  const valuePools = Array.isArray(schema?.valuePools)
    ? schema.valuePools.map((pool) => ({
      key: pool.key,
      name: pool.name || pool.key,
      description: pool.description ?? '',
      valueType: pool.valueType ?? 'text',
      options: Array.isArray(pool.options) ? pool.options : [],
      ranges: Array.isArray(pool.ranges) ? pool.ranges : [],
    }))
    : [];

  return { assetTypes, valuePools };
}

function upsertIdPool(schema: ProjectAssetSchema, pool: ProjectValuePool) {
  if (pool.ranges.length === 0) return;
  const existing = schema.valuePools.find((entry) => entry.key === pool.key);
  if (existing) {
    if (existing.ranges.length === 0) existing.ranges = pool.ranges;
    return;
  }
  schema.valuePools.push(pool);
}

function upsertIdAttribute(schema: ProjectAssetSchema, assetType: string, poolKey: string) {
  const target = schema.assetTypes.find((entry) => entry.key === assetType);
  if (!target || target.fields.some((field) => field.key === 'id')) return;
  target.fields.unshift({
    key: 'id',
    label: 'ID',
    type: 'number',
    required: true,
    nullable: false,
    poolKey,
    fields: [],
  });
}

function projectSchema(project?: Project | null): ProjectAssetSchema {
  const schema = defaultSchema(project?.assetSchema);
  const npcRanges = project?.mapleSettings?.npcIdRanges ?? [];
  const itemRanges = project?.mapleSettings?.itemIdRanges ?? [];

  upsertIdPool(schema, {
    key: 'npcIds',
    name: 'NPC IDs',
    valueType: 'number',
    options: [],
    ranges: npcRanges,
  });
  upsertIdPool(schema, {
    key: 'itemIds',
    name: 'Item IDs',
    valueType: 'number',
    options: [],
    ranges: itemRanges,
  });
  if (npcRanges.length > 0) upsertIdAttribute(schema, 'npc', 'npcIds');
  if (itemRanges.length > 0) upsertIdAttribute(schema, 'item', 'itemIds');

  return schema;
}

function parseOptionValue(value: string, type: ProjectValuePool['valueType']): string | number | boolean {
  if (type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (type === 'boolean') return value.toLowerCase() === 'true';
  return value;
}

function formatPoolOptions(pool: ProjectValuePool): string {
  return pool.options.map((option) => `${option.label}=${String(option.value)}`).join('\n');
}

function parsePoolOptions(input: string, valueType: ProjectValuePool['valueType']): ProjectValuePool['options'] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('=');
      const label = separator >= 0 ? line.slice(0, separator).trim() : line;
      const value = separator >= 0 ? line.slice(separator + 1).trim() : line;
      return { label, value: parseOptionValue(value, valueType) };
    });
}

function formatRanges(ranges?: ProjectValueRange[]): string {
  return (ranges ?? []).map((range) => `${range.min}-${range.max}`).join(', ');
}

function parseRanges(input: string): ProjectValueRange[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [minRaw, maxRaw] = part.split('-').map((value) => Number(value.trim()));
      if (!Number.isInteger(minRaw) || !Number.isInteger(maxRaw) || minRaw <= 0 || maxRaw < minRaw) {
        throw new Error(`Invalid range "${part}". Use min-max, for example 1000-1999.`);
      }
      return { min: minRaw, max: maxRaw };
    });
}

interface AssetSchemaSettingsCardProps {
  project?: Project | null;
  onSaved?: (project: Project) => void;
  initiallyOpen?: boolean;
}

const inputClass = 'w-full min-w-0 bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 text-sm focus:outline-none focus:border-pulse';
const labelClass = 'block text-steel-200 text-[11px] uppercase tracking-wide mb-1';

export function AssetSchemaSettingsCard({ project, onSaved, initiallyOpen = false }: AssetSchemaSettingsCardProps) {
  const { activeProject, activeProjectId, refreshProjects } = useProject();
  const targetProject = project ?? activeProject;
  const targetProjectId = targetProject?._id ?? activeProjectId;
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [schema, setSchema] = useState<ProjectAssetSchema>(() => projectSchema(targetProject));
  const [assetType, setAssetType] = useState('npc');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = projectSchema(targetProject);
    setSchema(next);
    if (!next.assetTypes.some((entry) => entry.key === assetType)) {
      setAssetType(next.assetTypes[0]?.key ?? 'npc');
    }
  }, [targetProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAsset = useMemo(
    () => schema.assetTypes.find((entry) => entry.key === assetType) ?? schema.assetTypes[0],
    [assetType, schema.assetTypes],
  );
  const selectedAssetIndex = useMemo(
    () => Math.max(0, schema.assetTypes.findIndex((entry) => entry.key === selectedAsset?.key)),
    [schema.assetTypes, selectedAsset?.key],
  );

  const patchSchema = (updater: (draft: ProjectAssetSchema) => void) => {
    setSchema((current) => {
      const next = cloneSchema(current);
      updater(next);
      return next;
    });
  };

  const save = async () => {
    if (!targetProjectId) {
      toast.error('No project selected.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProject(targetProjectId, { assetSchema: defaultSchema(schema) });
      await refreshProjects();
      onSaved?.(updated);
      toast.success('Asset attributes saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save asset attributes');
    } finally {
      setSaving(false);
    }
  };

  const uniqueKey = (keys: string[], base: string) => {
    let index = 1;
    let candidate = base;
    while (keys.includes(candidate)) {
      index += 1;
      candidate = `${base}${index}`;
    }
    return candidate;
  };

  const removeSelectedAssetType = () => {
    if (!selectedAsset) return;
    if (schema.assetTypes.length <= 1) {
      toast.error('At least one asset type is required.');
      return;
    }
    if (selectedAsset.fields.length > 0) {
      toast.error('Delete all attributes from this asset type before deleting it.');
      return;
    }
    const nextAsset = schema.assetTypes[selectedAssetIndex + 1] ?? schema.assetTypes[selectedAssetIndex - 1];
    patchSchema((draft) => {
      draft.assetTypes = draft.assetTypes.filter((_, index) => index !== selectedAssetIndex);
    });
    setAssetType(nextAsset?.key ?? 'npc');
  };

  const addField = () => {
    const target = selectedAsset;
    if (!target) return;
    const key = uniqueKey(target.fields.map((field) => field.key), 'attribute');
    patchSchema((draft) => {
      const asset = draft.assetTypes.find((entry) => entry.key === target.key);
      asset?.fields.push({
        key,
        label: 'New Attribute',
        type: 'text',
        required: false,
        nullable: true,
        poolKey: '',
        fields: [],
      });
    });
  };

  const addPool = () => {
    const key = uniqueKey(schema.valuePools.map((pool) => pool.key), 'pool');
    patchSchema((draft) => {
      draft.valuePools.push({
        key,
        name: 'New Pool',
        valueType: 'number',
        options: [],
        ranges: [],
      });
    });
  };

  return (
    <section className="bg-steel-850 border border-steel-700 rounded-md">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="bg-steel-800 p-2 rounded-lg">
          <Braces className="w-5 h-5 text-steel-200" />
        </div>
        <div className="min-w-0">
          <h2 className="text-steel-100 font-semibold">Project Asset Attributes</h2>
          <p className="text-steel-400 text-sm">
            Configure attributes and value pools for {targetProject?.name ?? 'this project'}.
          </p>
        </div>
        <ChevronDown className={`ml-auto w-5 h-5 text-steel-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
      <div className="border-t border-steel-700 p-4 space-y-4">
        <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !targetProjectId}
          className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg transition-colors text-sm"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        </div>

      <div className="border border-steel-700 rounded-lg p-4 bg-steel-900/35">
        <h3 className="text-steel-100 text-sm font-semibold mb-3">Asset types</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {schema.assetTypes.map((entry, index) => (
            <button
              key={`${entry.key}:${index}`}
              type="button"
              onClick={() => setAssetType(entry.key)}
              className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                selectedAsset?.key === entry.key
                  ? 'bg-volt text-steel-950 border-volt font-semibold'
                  : 'bg-steel-800 border-steel-700 text-steel-200 hover:border-steel-500'
              }`}
            >
              {entry.name}
            </button>
          ))}
        </div>
        {selectedAsset && (
        <div className="bg-steel-900/40 border border-steel-700 rounded-md p-3 mb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Selected asset key</label>
              <input
                value={selectedAsset.key}
                onChange={(event) => {
                  const nextKey = event.target.value;
                  patchSchema((draft) => {
                    draft.assetTypes[selectedAssetIndex].key = nextKey;
                  });
                  setAssetType(nextKey);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Selected asset name</label>
              <input
                value={selectedAsset.name}
                onChange={(event) => patchSchema((draft) => {
                  draft.assetTypes[selectedAssetIndex].name = event.target.value;
                })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={removeSelectedAssetType}
              disabled={selectedAsset.fields.length > 0}
              className="flex items-center gap-2 px-3 py-2 text-red-300 hover:text-red-200 disabled:text-steel-600 disabled:cursor-not-allowed text-sm rounded-md transition-colors"
              title={selectedAsset.fields.length > 0 ? 'Delete all attributes first' : 'Delete asset type'}
            >
              <Trash2 className="w-4 h-4" />
              Delete asset type
            </button>
          </div>
        </div>
        )}
      </div>

      <div className="border border-steel-700 rounded-lg p-4 bg-steel-900/35">
        <h3 className="text-steel-100 text-sm font-semibold mb-3">{selectedAsset?.name ?? 'Asset'} attributes</h3>
        <div className="space-y-3 mb-4">
          {(selectedAsset?.fields ?? []).map((field, index) => (
            <div key={`asset-field-${index}`} className="bg-steel-900/40 border border-steel-700 rounded-md p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className={labelClass}>Key</label>
                <input
                  value={field.key}
                  onChange={(event) => patchSchema((draft) => {
                    const asset = draft.assetTypes.find((entry) => entry.key === selectedAsset?.key);
                    if (asset) asset.fields[index].key = event.target.value;
                  })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Label</label>
                <input
                  value={field.label}
                  onChange={(event) => patchSchema((draft) => {
                    const asset = draft.assetTypes.find((entry) => entry.key === selectedAsset?.key);
                    if (asset) asset.fields[index].label = event.target.value;
                  })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={field.type}
                  onChange={(event) => patchSchema((draft) => {
                    const asset = draft.assetTypes.find((entry) => entry.key === selectedAsset?.key);
                    if (asset) asset.fields[index].type = event.target.value as AssetFieldType;
                  })}
                  className={inputClass}
                >
                  {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Pool</label>
                <select
                  value={field.poolKey ?? ''}
                  onChange={(event) => patchSchema((draft) => {
                    const asset = draft.assetTypes.find((entry) => entry.key === selectedAsset?.key);
                    if (asset) asset.fields[index].poolKey = event.target.value;
                  })}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {schema.valuePools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-steel-100 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => patchSchema((draft) => {
                    const asset = draft.assetTypes.find((entry) => entry.key === selectedAsset?.key);
                    if (asset) asset.fields[index].required = event.target.checked;
                  })}
                  className="accent-pulse"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-steel-100 text-sm">
                <input
                  type="checkbox"
                  checked={field.nullable}
                  onChange={(event) => patchSchema((draft) => {
                    const asset = draft.assetTypes.find((entry) => entry.key === selectedAsset?.key);
                    if (asset) asset.fields[index].nullable = event.target.checked;
                  })}
                  className="accent-pulse"
                />
                Nullable
              </label>
              <button
                type="button"
                onClick={() => patchSchema((draft) => {
                  const asset = draft.assetTypes.find((entry) => entry.key === selectedAsset?.key);
                  if (asset) asset.fields = asset.fields.filter((_, fieldIndex) => fieldIndex !== index);
                })}
                className="ml-auto flex items-center justify-center h-9 w-9 text-red-300 hover:text-red-200"
                title="Remove attribute"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addField}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-100 text-sm rounded-md transition-colors"
        >
          <Plus className="w-4 h-4 text-pulse" />
          Add attribute
        </button>
      </div>

      <div className="border border-steel-700 rounded-lg p-4 bg-steel-900/35">
        <h3 className="text-steel-100 text-sm font-semibold mb-3">Value pools</h3>
        <div className="space-y-3 mb-4">
          {schema.valuePools.map((pool, index) => (
            <div key={`value-pool-${index}`} className="bg-steel-900/40 border border-steel-700 rounded-md p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div>
                <label className={labelClass}>Key</label>
                <input
                  value={pool.key}
                  onChange={(event) => {
                    const previousKey = pool.key;
                    const nextKey = event.target.value;
                    patchSchema((draft) => {
                      draft.valuePools[index].key = nextKey;
                      draft.assetTypes.forEach((asset) => {
                        asset.fields.forEach((field) => {
                          if (field.poolKey === previousKey) field.poolKey = nextKey;
                        });
                      });
                    });
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Name</label>
                <input
                  value={pool.name}
                  onChange={(event) => patchSchema((draft) => { draft.valuePools[index].name = event.target.value; })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={pool.valueType}
                  onChange={(event) => patchSchema((draft) => { draft.valuePools[index].valueType = event.target.value as ProjectValuePool['valueType']; })}
                  className={inputClass}
                >
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Options</label>
                <textarea
                  value={formatPoolOptions(pool)}
                  onChange={(event) => patchSchema((draft) => {
                    draft.valuePools[index].options = parsePoolOptions(event.target.value, draft.valuePools[index].valueType);
                  })}
                  rows={3}
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className={labelClass}>Ranges</label>
                <textarea
                  value={formatRanges(pool.ranges)}
                  onChange={(event) => {
                    try {
                      const ranges = parseRanges(event.target.value);
                      patchSchema((draft) => { draft.valuePools[index].ranges = ranges; });
                    } catch {
                      patchSchema((draft) => { draft.valuePools[index].ranges = []; });
                    }
                  }}
                  rows={3}
                  className={`${inputClass} font-mono`}
                />
              </div>
              <button
                type="button"
                onClick={() => patchSchema((draft) => { draft.valuePools = draft.valuePools.filter((_, poolIndex) => poolIndex !== index); })}
                className="md:col-span-2 ml-auto flex items-center justify-center h-9 w-9 text-red-300 hover:text-red-200"
                title="Remove pool"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addPool}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-100 text-sm rounded-md transition-colors"
        >
          <Plus className="w-4 h-4 text-pulse" />
          Add pool
        </button>
      </div>
      </div>
      )}
    </section>
  );
}
