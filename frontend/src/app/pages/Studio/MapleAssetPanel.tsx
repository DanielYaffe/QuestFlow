import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  checkMapleIdAvailability,
  MapleAssetMetadata,
  MapleAssetType,
} from '../../api/mapleAssetApi';

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return fallback;
}

function defaultMaple(): MapleAssetMetadata {
  return {
    mapleId: 0,
    exportEnabled: false,
    operation: 'create',
    nativePath: '',
    lastExportHash: '',
    validationWarnings: [],
    validationErrors: [],
  };
}

export function MapleAssetPanel({
  assetType,
  projectId,
  recordId,
  value,
  onSave,
}: {
  assetType: MapleAssetType;
  projectId: string;
  recordId: string;
  value?: Partial<MapleAssetMetadata>;
  onSave: (value: Partial<MapleAssetMetadata>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MapleAssetMetadata>(() => ({ ...defaultMaple(), ...value }));
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<{ warnings: string[]; errors: string[] }>({ warnings: [], errors: [] });

  useEffect(() => {
    setDraft({ ...defaultMaple(), ...value });
    setMessages({ warnings: value?.validationWarnings ?? [], errors: value?.validationErrors ?? [] });
  }, [value]);

  const checkId = async () => {
    if (!draft.mapleId) {
      const nextMessages = { warnings: [], errors: ['Maple ID is required.'] };
      setMessages(nextMessages);
      return { available: false, messages: nextMessages };
    }
    setChecking(true);
    try {
      const result = await checkMapleIdAvailability({
        projectId,
        assetType,
        mapleId: draft.mapleId,
        excludeRecordId: recordId,
        allowNativePatch: draft.operation === 'patch',
      });
      const nextMessages = { warnings: result.warnings, errors: result.errors };
      setMessages(nextMessages);
      return { available: result.available, messages: nextMessages };
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to check Maple ID'));
      return { available: false, messages };
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    const { available, messages: nextMessages } = await checkId();
    if (!available) return;
    setSaving(true);
    try {
      await onSave({
        ...draft,
        validationWarnings: nextMessages.warnings,
        validationErrors: nextMessages.errors,
      });
      toast.success('Maple export settings saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save Maple export settings'));
    } finally {
      setSaving(false);
    }
  };

  const title = assetType === 'npc' ? 'Maple NPC Export' : 'Maple ETC Item Export';
  const hasErrors = messages.errors.length > 0;
  const hasWarnings = messages.warnings.length > 0;

  return (
    <section className="bg-steel-850 border border-steel-700 rounded-md">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-steel-700">
        <Database className="w-4 h-4 text-pulse" />
        <h2 className="text-steel-100 text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={() => void save()}
          disabled={checking || saving}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
        >
          {(checking || saving) && <Loader2 className="w-3 h-3 animate-spin" />}
          Save
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-steel-200">
          <input
            type="checkbox"
            checked={draft.exportEnabled}
            onChange={(e) => setDraft((current) => ({ ...current, exportEnabled: e.target.checked }))}
            className="accent-pulse"
          />
          Include in Maple client export
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-steel-400 text-xs mb-1">Maple ID</label>
            <input
              type="number"
              min={1}
              value={draft.mapleId || ''}
              onChange={(e) => setDraft((current) => ({ ...current, mapleId: Number(e.target.value) || 0 }))}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
            />
          </div>
          <div>
            <label className="block text-steel-400 text-xs mb-1">Operation</label>
            <select
              value={draft.operation}
              onChange={(e) => setDraft((current) => ({ ...current, operation: e.target.value === 'patch' ? 'patch' : 'create' }))}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
            >
              <option value="create">Create new</option>
              <option value="patch">Patch existing</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void checkId()}
          disabled={checking}
          className="self-start text-xs text-pulse hover:text-pulse/80 disabled:opacity-50"
        >
          Check ID
        </button>

        {(hasErrors || hasWarnings) && (
          <div className="space-y-1.5">
            {messages.errors.map((message) => (
              <p key={message} className="flex items-start gap-1.5 text-xs text-red-300">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {message}
              </p>
            ))}
            {messages.warnings.map((message) => (
              <p key={message} className="flex items-start gap-1.5 text-xs text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {message}
              </p>
            ))}
          </div>
        )}

        {!hasErrors && !hasWarnings && draft.mapleId > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ready to validate for export.
          </p>
        )}
      </div>
    </section>
  );
}
