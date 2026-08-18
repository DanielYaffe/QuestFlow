import React, { useEffect, useState } from 'react';
import { Github, Loader2, Plus, PlugZap, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectGitTarget, updateProject } from '../../../api/projectApi';
import { getGitSettings, testGitConnection, updateGitSettings } from '../../../api/userSettingsApi';
import { useProject } from '../../../context/ProjectContext';

type EditableTarget = ProjectGitTarget & { token?: string };

function newTargetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `target-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyTarget(): EditableTarget {
  return {
    id: newTargetId(),
    name: 'New export target',
    repoOwner: '',
    repoName: '',
    defaultBranch: 'main',
    defaultFilePath: '',
    hasToken: false,
    token: '',
  };
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown; message?: unknown }; status?: number } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
    if (typeof response?.data?.message === 'string') return response.data.message;
    if (response?.status) return `${fallback} (HTTP ${response.status})`;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function targetsFromProject(project: ReturnType<typeof useProject>['activeProject']): EditableTarget[] {
  const targets = project?.gitTargets ?? [];
  if (targets.length > 0) return targets.map((target) => ({ ...target, token: '' }));
  const legacy = project?.git;
  if (legacy?.repoOwner || legacy?.repoName) {
    return [{
      id: 'legacy-project-repo',
      name: 'Project repository',
      hasToken: false,
      repoOwner: legacy.repoOwner ?? '',
      repoName: legacy.repoName ?? '',
      defaultBranch: legacy.defaultBranch ?? 'main',
      defaultFilePath: legacy.defaultFilePath ?? '',
      token: '',
    }];
  }
  return [];
}

export function GitHubSettingsCard() {
  const { activeProject, activeProjectId, refreshProjects } = useProject();
  const [hasGlobalToken, setHasGlobalToken] = useState(false);
  const [globalToken, setGlobalToken] = useState('');
  const [targets, setTargets] = useState<EditableTarget[]>([]);
  const [defaultQuestTargetId, setDefaultQuestTargetId] = useState('');
  const [defaultAssetTargetId, setDefaultAssetTargetId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    getGitSettings()
      .then((settings) => setHasGlobalToken(settings.hasToken))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const nextTargets = targetsFromProject(activeProject);
    setTargets(nextTargets);
    setDefaultQuestTargetId(activeProject?.defaultQuestExportTargetId || nextTargets[0]?.id || '');
    setDefaultAssetTargetId(activeProject?.defaultAssetExportTargetId || nextTargets[0]?.id || '');
    setGlobalToken('');
  }, [activeProject]);

  const updateTarget = (id: string, patch: Partial<EditableTarget>) => {
    setTargets((current) => current.map((target) => target.id === id ? { ...target, ...patch } : target));
  };

  const addTarget = () => {
    const target = emptyTarget();
    setTargets((current) => [...current, target]);
    if (!defaultQuestTargetId) setDefaultQuestTargetId(target.id);
    if (!defaultAssetTargetId) setDefaultAssetTargetId(target.id);
  };

  const removeTarget = (id: string) => {
    setTargets((current) => {
      const next = current.filter((target) => target.id !== id);
      if (defaultQuestTargetId === id) setDefaultQuestTargetId(next[0]?.id || '');
      if (defaultAssetTargetId === id) setDefaultAssetTargetId(next[0]?.id || '');
      return next;
    });
  };

  const validateTargets = (): boolean => {
    const names = new Set<string>();
    for (const target of targets) {
      if (!target.name.trim()) {
        toast.error('Every GitHub target needs a name.');
        return false;
      }
      if (!target.repoOwner?.trim() || !target.repoName?.trim()) {
        toast.error(`Target "${target.name}" needs repository owner and name.`);
        return false;
      }
      const key = target.name.trim().toLowerCase();
      if (names.has(key)) {
        toast.error(`Target name "${target.name}" is used more than once.`);
        return false;
      }
      names.add(key);
    }
    return true;
  };

  const handleSave = async () => {
    if (!activeProjectId) {
      toast.error('No active project selected.');
      return;
    }
    if (!validateTargets()) return;

    setSaving(true);
    try {
      if (globalToken.trim()) {
        try {
          const settings = await updateGitSettings({ token: globalToken.trim() });
          setHasGlobalToken(settings.hasToken);
        } catch (err) {
          toast.error(errorMessage(err, 'Failed to save fallback GitHub token'));
          return;
        }
      }

      try {
        await updateProject(activeProjectId, {
          gitTargets: targets.map((target) => ({
            id: target.id,
            name: target.name.trim(),
            token: target.token?.trim() || undefined,
            repoOwner: target.repoOwner?.trim() || undefined,
            repoName: target.repoName?.trim() || undefined,
            defaultBranch: target.defaultBranch?.trim() || 'main',
            defaultFilePath: target.defaultFilePath?.trim() || '',
          })),
          defaultQuestExportTargetId: defaultQuestTargetId,
          defaultAssetExportTargetId: defaultAssetTargetId,
          git: targets[0] ? {
            repoOwner: targets[0].repoOwner,
            repoName: targets[0].repoName,
            defaultBranch: targets[0].defaultBranch,
            defaultFilePath: targets[0].defaultFilePath,
          } : {},
        });
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to save project GitHub targets'));
        return;
      }

      try {
        await refreshProjects();
      } catch (err) {
        toast.error(errorMessage(err, 'GitHub targets saved, but failed to refresh projects'));
        return;
      }
      setGlobalToken('');
      toast.success('GitHub export targets saved');
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to save GitHub settings'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (target: EditableTarget) => {
    if (!activeProjectId) return;
    if (!target.repoOwner?.trim() || !target.repoName?.trim()) {
      toast.error('Enter a repository owner and name to test.');
      return;
    }
    setTestingId(target.id);
    try {
      const result = await testGitConnection({
        projectId: activeProjectId,
        gitTargetId: target.id,
        token: target.token?.trim() || undefined,
        repoOwner: target.repoOwner,
        repoName: target.repoName,
        branch: target.defaultBranch || undefined,
      });
      toast.success(result.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Connection failed');
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return <div className="bg-steel-850 border border-steel-700 rounded-md p-6 animate-pulse h-64" />;
  }

  return (
    <div className="bg-steel-850 border border-steel-700 rounded-md p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="bg-steel-800 p-2 rounded-lg">
          <Github className="w-5 h-5 text-steel-200" />
        </div>
        <div className="min-w-0">
          <h2 className="text-steel-100 font-semibold">GitHub Export Targets</h2>
          <p className="text-steel-400 text-sm">
            Configure named repositories for {activeProject?.name ?? 'the active project'}, then choose one during export.
          </p>
        </div>
        <button
          type="button"
          onClick={addTarget}
          disabled={!activeProjectId}
          className="ml-auto flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 text-steel-100 rounded-md transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add target
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-steel-400 text-sm mb-1">
            Fallback Personal Access Token
            {hasGlobalToken && <span className="ml-2 text-green-400 text-xs">Token saved</span>}
          </label>
          <input
            type="password"
            value={globalToken}
            onChange={(event) => setGlobalToken(event.target.value)}
            placeholder={hasGlobalToken ? 'Enter a new fallback token' : 'ghp_...'}
            className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
          />
          <p className="text-steel-400 text-xs mt-1">
            Optional fallback. A target can also store its own token, which is useful when different repositories use different access.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-steel-400 text-sm mb-1">Default Quest Builder Target</label>
            <select
              value={defaultQuestTargetId}
              onChange={(event) => setDefaultQuestTargetId(event.target.value)}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 focus:outline-none focus:border-pulse text-sm"
            >
              <option value="">No default</option>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-steel-400 text-sm mb-1">Default Studio Asset Target</label>
            <select
              value={defaultAssetTargetId}
              onChange={(event) => setDefaultAssetTargetId(event.target.value)}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 focus:outline-none focus:border-pulse text-sm"
            >
              <option value="">No default</option>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {targets.length === 0 ? (
            <div className="border border-dashed border-steel-700 rounded-md p-6 text-center text-steel-400 text-sm">
              No GitHub targets yet. Add one for quests, assets, or any other export destination.
            </div>
          ) : targets.map((target, index) => (
            <div key={target.id} className="border border-steel-700 rounded-md p-4 bg-steel-900/40 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={target.name}
                  onChange={(event) => updateTarget(target.id, { name: event.target.value })}
                  placeholder="47-Assets-FinalProject"
                  className="flex-1 bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeTarget(target.id)}
                  className="p-2 text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded-md transition-colors"
                  title="Remove target"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={target.repoOwner ?? ''}
                  onChange={(event) => updateTarget(target.id, { repoOwner: event.target.value })}
                  placeholder="Repository owner"
                  className="bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
                />
                <input
                  type="text"
                  value={target.repoName ?? ''}
                  onChange={(event) => updateTarget(target.id, { repoName: event.target.value })}
                  placeholder="Repository name"
                  className="bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
                />
                <input
                  type="text"
                  value={target.defaultBranch ?? 'main'}
                  onChange={(event) => updateTarget(target.id, { defaultBranch: event.target.value })}
                  placeholder="Branch"
                  className="bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
                />
                <input
                  type="text"
                  value={target.defaultFilePath ?? ''}
                  onChange={(event) => updateTarget(target.id, { defaultFilePath: event.target.value })}
                  placeholder={index === 0 ? 'custom_quests or tools/input/questflow-assets' : 'Folder inside repo'}
                  className="bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-steel-500 text-xs mb-1">
                    Target token {target.hasToken && <span className="text-green-400">(saved)</span>}
                  </label>
                  <input
                    type="password"
                    value={target.token ?? ''}
                    onChange={(event) => updateTarget(target.id, { token: event.target.value })}
                    placeholder={target.hasToken ? 'Leave blank to keep saved token' : 'Uses fallback token if blank'}
                    className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleTest(target)}
                  disabled={testingId === target.id || saving}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 text-steel-200 rounded-md transition-colors text-sm"
                >
                  {testingId === target.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
                  Test
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !activeProjectId}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-md transition-[filter] text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save GitHub Targets'}
          </button>
        </div>
      </div>
    </div>
  );
}
