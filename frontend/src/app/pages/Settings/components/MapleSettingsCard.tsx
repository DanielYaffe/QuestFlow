import React, { useEffect, useState } from 'react';
import { Database, Save } from 'lucide-react';
import { toast } from 'sonner';
import { MapleExportMode, MapleIdRange, MapleProjectSettings } from '../../../api/mapleAssetApi';
import { updateProject } from '../../../api/projectApi';
import { useProject } from '../../../context/ProjectContext';

function formatRanges(ranges?: MapleIdRange[]): string {
  return (ranges ?? []).map((range) => `${range.min}-${range.max}`).join(', ');
}

function parseRanges(input: string): MapleIdRange[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawMin, rawMax] = part.split('-').map((value) => Number(value.trim()));
      const min = Number.isInteger(rawMin) ? rawMin : 0;
      const max = Number.isInteger(rawMax) ? rawMax : min;
      if (min <= 0 || max <= 0 || max < min) {
        throw new Error(`Invalid range "${part}". Use values like 9000000-9999999.`);
      }
      return { min, max };
    });
}

function defaultSettings(settings?: Partial<MapleProjectSettings>): MapleProjectSettings {
  return {
    targetVersion: 'v83',
    defaultExportMode: settings?.defaultExportMode ?? 'changed-only',
    npcIdRanges: settings?.npcIdRanges ?? [],
    itemIdRanges: settings?.itemIdRanges ?? [],
  };
}

export function MapleSettingsCard() {
  const { activeProject, activeProjectId, refreshProjects } = useProject();
  const [defaultExportMode, setDefaultExportMode] = useState<MapleExportMode>('changed-only');
  const [npcRanges, setNpcRanges] = useState('');
  const [itemRanges, setItemRanges] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const settings = defaultSettings(activeProject?.mapleSettings);
    setDefaultExportMode(settings.defaultExportMode);
    setNpcRanges(formatRanges(settings.npcIdRanges));
    setItemRanges(formatRanges(settings.itemIdRanges));
  }, [activeProject]);

  const save = async () => {
    if (!activeProjectId) {
      toast.error('No active project selected.');
      return;
    }
    setSaving(true);
    try {
      await updateProject(activeProjectId, {
        mapleSettings: {
          targetVersion: 'v83',
          defaultExportMode,
          npcIdRanges: parseRanges(npcRanges),
          itemIdRanges: parseRanges(itemRanges),
        },
      });
      await refreshProjects();
      toast.success('Maple settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Maple settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-steel-850 border border-steel-700 rounded-md p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-steel-800 p-2 rounded-lg">
          <Database className="w-5 h-5 text-steel-200" />
        </div>
        <div>
          <h2 className="text-steel-100 font-semibold">Maple v83 Client Assets</h2>
          <p className="text-steel-400 text-sm">Configure ID ranges and the default package mode for the active project.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-steel-400 text-sm mb-1">Default export mode</label>
          <select
            value={defaultExportMode}
            onChange={(event) => setDefaultExportMode(event.target.value as MapleExportMode)}
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 focus:outline-none focus:border-pulse text-sm"
          >
            <option value="changed-only">Changed only</option>
            <option value="full-snapshot">Full snapshot</option>
          </select>
        </div>

        <div>
          <label className="block text-steel-400 text-sm mb-1">NPC ID ranges</label>
          <input
            type="text"
            value={npcRanges}
            onChange={(event) => setNpcRanges(event.target.value)}
            placeholder="9000000-9999999"
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
          />
          <p className="text-steel-400 text-xs mt-1">Comma-separated. Leave empty to allow any positive ID, while still checking KB collisions.</p>
        </div>

        <div>
          <label className="block text-steel-400 text-sm mb-1">ETC item ID ranges</label>
          <input
            type="text"
            value={itemRanges}
            onChange={(event) => setItemRanges(event.target.value)}
            placeholder="4000000-4999999"
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !activeProjectId}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
