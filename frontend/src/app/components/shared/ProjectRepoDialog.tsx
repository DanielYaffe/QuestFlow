import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Github, Save, PlugZap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Project, updateProject } from '../../api/projectApi';
import { testGitConnection } from '../../api/userSettingsApi';

interface ProjectRepoDialogProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

interface FormValues {
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  defaultFilePath: string;
}

export function ProjectRepoDialog({ isOpen, project, onClose, onSaved }: ProjectRepoDialogProps) {
  const [testing, setTesting] = useState(false);
  const { register, handleSubmit, reset, getValues, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { repoOwner: '', repoName: '', defaultBranch: 'main', defaultFilePath: '' },
  });

  useEffect(() => {
    if (!isOpen) return;
    const g = project?.git;
    reset({
      repoOwner:       g?.repoOwner       ?? '',
      repoName:        g?.repoName        ?? '',
      defaultBranch:   g?.defaultBranch   ?? 'main',
      defaultFilePath: g?.defaultFilePath ?? '',
    });
  }, [isOpen, project, reset]);

  const handleTest = async () => {
    const values = getValues();
    if (!values.repoOwner || !values.repoName) {
      toast.error('Enter a repository owner and name to test.');
      return;
    }
    setTesting(true);
    try {
      const res = await testGitConnection({
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

  const onSubmit = async (values: FormValues) => {
    if (!project) return;
    try {
      await updateProject(project._id, {
        git: {
          repoOwner:       values.repoOwner,
          repoName:        values.repoName,
          defaultBranch:   values.defaultBranch,
          defaultFilePath: values.defaultFilePath,
        },
      });
      await onSaved();
      toast.success('Repository saved');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save repository');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-white text-lg flex items-center gap-2">
            <Github className="w-5 h-5 text-purple-400" />
            Repository{project ? ` — ${project.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <p className="text-zinc-500 text-xs">
            Questlines in this project export and push to this repository. The token is shared
            across projects — set it in Settings.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Owner</label>
              <input
                type="text"
                placeholder="my-org"
                {...register('repoOwner')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Repository</label>
              <input
                type="text"
                placeholder="my-game"
                {...register('repoName')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Branch</label>
              <input
                type="text"
                placeholder="main"
                {...register('defaultBranch')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">File Path</label>
              <input
                type="text"
                placeholder="Assets/Quests"
                {...register('defaultFilePath')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-lg transition-colors text-sm"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
              {testing ? 'Testing...' : 'Test connection'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
