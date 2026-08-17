import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Github, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AssetPackageInput, pushAssetPackage } from '../../api/assetPackageApi';
import { ProjectGitTarget, updateProject } from '../../api/projectApi';
import { useProject } from '../../context/ProjectContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';

interface FormValues {
  gitTargetId: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  filePath: string;
  commitMessage: string;
  saveAsDefault: boolean;
}

interface AssetPackageGithubDialogProps {
  isOpen: boolean;
  input: AssetPackageInput | null;
  onClose: () => void;
  onPushed: () => Promise<void> | void;
}

const EMPTY_TARGETS: ProjectGitTarget[] = [];

function selectDefaultTarget(targets: ProjectGitTarget[], defaultId?: string): ProjectGitTarget | undefined {
  return targets.find((target) => target.id === defaultId) ?? targets[0];
}

export function AssetPackageGithubDialog({ isOpen, input, onClose, onPushed }: AssetPackageGithubDialogProps) {
  const { activeProject, activeProjectId, refreshProjects } = useProject();
  const targets = activeProject?.gitTargets ?? EMPTY_TARGETS;
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      gitTargetId: '',
      repoOwner: '',
      repoName: '',
      branch: 'main',
      filePath: 'tools/input/questflow-assets',
      commitMessage: 'Update asset package',
      saveAsDefault: false,
    },
  });
  const selectedTargetId = watch('gitTargetId');

  useEffect(() => {
    if (!isOpen) return;
    const target = selectDefaultTarget(targets, activeProject?.defaultAssetExportTargetId);
    const legacy = activeProject?.git;
    reset({
      gitTargetId: target?.id ?? '',
      repoOwner: target?.repoOwner ?? legacy?.repoOwner ?? '',
      repoName: target?.repoName ?? legacy?.repoName ?? '',
      branch: target?.defaultBranch ?? legacy?.defaultBranch ?? 'main',
      filePath: target?.defaultFilePath ?? legacy?.defaultFilePath ?? 'tools/input/questflow-assets',
      commitMessage: 'Update asset package',
      saveAsDefault: false,
    });
  }, [activeProject, isOpen, reset, targets]);

  useEffect(() => {
    if (!selectedTargetId) return;
    const target = targets.find((item) => item.id === selectedTargetId);
    if (!target) return;
    setValue('repoOwner', target.repoOwner ?? '');
    setValue('repoName', target.repoName ?? '');
    setValue('branch', target.defaultBranch ?? 'main');
    setValue('filePath', target.defaultFilePath ?? 'tools/input/questflow-assets');
  }, [selectedTargetId, setValue, targets]);

  const onSubmit = async (values: FormValues) => {
    if (!activeProjectId || !input) return;
    try {
      if (values.saveAsDefault) {
        await updateProject(activeProjectId, { defaultAssetExportTargetId: values.gitTargetId });
        await refreshProjects();
      }

      const result = await pushAssetPackage(activeProjectId, {
        ...input,
        gitTargetId: values.gitTargetId || undefined,
        repoOwner: values.repoOwner || undefined,
        repoName: values.repoName || undefined,
        branch: values.branch || undefined,
        filePath: values.filePath || undefined,
        commitMessage: values.commitMessage || undefined,
      });
      toast.success(result.message || 'Asset package exported');
      await onPushed();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to export asset package');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Github className="w-5 h-5" />
            Export Assets To GitHub
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <p className="text-steel-400 text-xs">
            Choose the configured target, branch, and folder where this asset package should be written.
          </p>

          <div>
            <label className="block text-steel-400 text-sm mb-1">Export Target</label>
            <select
              {...register('gitTargetId')}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 focus:outline-none focus:border-pulse text-sm"
            >
              <option value="">Manual repository</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>{target.name}</option>
              ))}
            </select>
            {targets.length === 0 && (
              <p className="text-steel-500 text-xs mt-1">Add named targets in Settings to avoid typing repository details each time.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-steel-400 text-sm mb-1">Owner</label>
              <input
                type="text"
                placeholder="my-org"
                {...register('repoOwner', { required: true })}
                className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
            <div>
              <label className="block text-steel-400 text-sm mb-1">Repository</label>
              <input
                type="text"
                placeholder="my-game"
                {...register('repoName', { required: true })}
                className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-steel-400 text-sm mb-1">Branch</label>
              <input
                type="text"
                placeholder="main"
                {...register('branch')}
                className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
            <div>
              <label className="block text-steel-400 text-sm mb-1">Folder</label>
              <input
                type="text"
                placeholder="tools/input/questflow-assets"
                {...register('filePath')}
                className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-steel-400 text-sm mb-1">Commit Message</label>
            <input
              type="text"
              placeholder="Update asset package"
              {...register('commitMessage')}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-steel-400 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              {...register('saveAsDefault')}
              className="h-4 w-4 rounded border-steel-600 bg-steel-800 text-pulse focus:ring-pulse"
            />
            Use this target as the Studio asset default
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-md transition-colors text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-md transition-[filter] text-sm cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              {isSubmitting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
