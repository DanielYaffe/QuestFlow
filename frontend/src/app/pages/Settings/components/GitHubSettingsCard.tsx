import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Github, Save, PlugZap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getGitSettings, updateGitSettings, testGitConnection } from '../../../api/userSettingsApi';
import { useProject } from '../../../context/ProjectContext';
import { updateProject } from '../../../api/projectApi';

interface FormValues {
  token: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  defaultFilePath: string;
}

export function GitHubSettingsCard() {
  const { activeProject, activeProjectId, refreshProjects } = useProject();
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  const { register, handleSubmit, reset, getValues, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { token: '', repoOwner: '', repoName: '', defaultBranch: 'main', defaultFilePath: '' },
  });

  // The token is shared at the user level; load it once for the "saved" badge.
  useEffect(() => {
    getGitSettings()
      .then((s) => setHasToken(s.hasToken))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // The repository binds to the active project — re-fill the repo fields whenever
  // the active project changes so the form always edits the current project.
  useEffect(() => {
    const g = activeProject?.git;
    reset((prev) => ({
      ...prev,
      token: '',
      repoOwner:       g?.repoOwner       ?? '',
      repoName:        g?.repoName        ?? '',
      defaultBranch:   g?.defaultBranch   ?? 'main',
      defaultFilePath: g?.defaultFilePath ?? '',
    }));
  }, [activeProject, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!activeProjectId) {
      toast.error('No active project selected.');
      return;
    }
    try {
      // Token (user-level) is only sent when the user typed a new one.
      if (values.token) {
        const updated = await updateGitSettings({ token: values.token });
        setHasToken(updated.hasToken);
      }
      // Repository is saved on the active project.
      await updateProject(activeProjectId, {
        git: {
          repoOwner:       values.repoOwner,
          repoName:        values.repoName,
          defaultBranch:   values.defaultBranch,
          defaultFilePath: values.defaultFilePath,
        },
      });
      await refreshProjects();
      reset((prev) => ({ ...prev, token: '' }));
      toast.success('GitHub settings saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save settings');
    }
  };

  const handleTest = async () => {
    const values = getValues();
    if (!values.repoOwner || !values.repoName) {
      toast.error('Enter a repository owner and name to test.');
      return;
    }
    setTesting(true);
    try {
      const res = await testGitConnection({
        token: values.token || undefined,
        repoOwner: values.repoOwner,
        repoName: values.repoName,
        branch: values.defaultBranch || undefined,
      });
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-steel-850 border border-steel-700 rounded-md p-6 animate-pulse h-64" />
    );
  }

  return (
    <div className="bg-steel-850 border border-steel-700 rounded-md p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-steel-800 p-2 rounded-lg">
          <Github className="w-5 h-5 text-steel-200" />
        </div>
        <div>
          <h2 className="text-steel-100 font-semibold">GitHub Integration</h2>
          <p className="text-steel-400 text-sm">Authorize pushing quest exports to GitHub, and set the repository for each project.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-steel-400 text-sm mb-1">
            Personal Access Token
            {hasToken && <span className="ml-2 text-green-400 text-xs">Token saved</span>}
          </label>
          <input
            type="password"
            placeholder={hasToken ? 'Enter a new token to replace the saved one' : 'ghp_...'}
            {...register('token')}
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
          />
          <p className="text-steel-400 text-xs mt-1">
            {hasToken && <span className="text-green-400">A token is saved. Leave this blank to keep it. </span>}
            Shared across all projects. Needs <code className="text-steel-400">repo</code> scope.{' '}
            Generate one at GitHub → Settings → Developer settings → Personal access tokens.
          </p>
        </div>

        <p className="text-steel-400 text-xs border-t border-steel-700 pt-4">
          Repository for project{' '}
          <span className="text-steel-200 font-medium">{activeProject?.name ?? '—'}</span>.
          Switch projects to edit a different one.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-steel-400 text-sm mb-1">Repository Owner</label>
            <input
              type="text"
              placeholder="my-org"
              {...register('repoOwner')}
              className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
            />
          </div>
          <div>
            <label className="block text-steel-400 text-sm mb-1">Repository Name</label>
            <input
              type="text"
              placeholder="my-game"
              {...register('repoName')}
              className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-steel-400 text-sm mb-1">Default Branch</label>
            <input
              type="text"
              placeholder="main"
              {...register('defaultBranch')}
              className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
            />
          </div>
          <div>
            <label className="block text-steel-400 text-sm mb-1">Default File Path</label>
            <input
              type="text"
              placeholder="Assets/Quests"
              {...register('defaultFilePath')}
              className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
            />
            <p className="text-steel-400 text-xs mt-1">Directory inside the repo where files will be placed</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || isSubmitting}
            className="flex items-center gap-2 px-4 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 text-steel-200 rounded-lg transition-colors text-sm"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            {testing ? 'Testing...' : 'Test connection'}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !activeProjectId}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
