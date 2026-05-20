import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Github, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getGitSettings, updateGitSettings, UpdateGitSettingsPayload } from '../../../api/userSettingsApi';

interface FormValues {
  token: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  defaultFilePath: string;
}

export function GitHubSettingsCard() {
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { token: '', repoOwner: '', repoName: '', defaultBranch: 'main', defaultFilePath: '' },
  });

  useEffect(() => {
    getGitSettings()
      .then((s) => {
        setHasToken(s.hasToken);
        reset({
          token: '',
          repoOwner: s.repoOwner,
          repoName: s.repoName,
          defaultBranch: s.defaultBranch || 'main',
          defaultFilePath: s.defaultFilePath,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (values: FormValues) => {
    const payload: UpdateGitSettingsPayload = {
      repoOwner:       values.repoOwner,
      repoName:        values.repoName,
      defaultBranch:   values.defaultBranch,
      defaultFilePath: values.defaultFilePath,
    };
    if (values.token) payload.token = values.token;

    try {
      const updated = await updateGitSettings(payload);
      setHasToken(updated.hasToken);
      reset({ ...values, token: '' });
      toast.success('GitHub settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 animate-pulse h-64" />
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-zinc-800 p-2 rounded-lg">
          <Github className="w-5 h-5 text-zinc-300" />
        </div>
        <div>
          <h2 className="text-white font-semibold">GitHub Integration</h2>
          <p className="text-zinc-400 text-sm">Push quest exports directly to a GitHub repository</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-zinc-400 text-sm mb-1">
            Personal Access Token
            {hasToken && <span className="ml-2 text-green-400 text-xs">Token saved</span>}
          </label>
          <input
            type="password"
            placeholder={hasToken ? 'Enter a new token to replace the saved one' : 'ghp_...'}
            {...register('token')}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
          />
          <p className="text-zinc-500 text-xs mt-1">
            Needs <code className="text-zinc-400">repo</code> scope.{' '}
            Generate one at GitHub → Settings → Developer settings → Personal access tokens.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Repository Owner</label>
            <input
              type="text"
              placeholder="my-org"
              {...register('repoOwner')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Repository Name</label>
            <input
              type="text"
              placeholder="my-game"
              {...register('repoName')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Default Branch</label>
            <input
              type="text"
              placeholder="main"
              {...register('defaultBranch')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1">Default File Path</label>
            <input
              type="text"
              placeholder="Assets/Quests"
              {...register('defaultFilePath')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
            />
            <p className="text-zinc-500 text-xs mt-1">Directory inside the repo where files will be placed</p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
