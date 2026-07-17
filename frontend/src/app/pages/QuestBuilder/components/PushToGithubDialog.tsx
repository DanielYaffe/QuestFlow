import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Github, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { getGitSettings } from '../../../api/userSettingsApi';
import { pushToGithub, Format } from '../../../api/questExportApi';

interface PushToGithubDialogProps {
  isOpen: boolean;
  onClose: () => void;
  questlineId: string;
  format: Format;
  templateId?: string;
  nodeIds?: string[];
}

interface FormValues {
  repoOwner: string;
  repoName: string;
  branch: string;
  filePath: string;
  commitMessage: string;
}

export function PushToGithubDialog({ isOpen, onClose, questlineId, format, templateId, nodeIds }: PushToGithubDialogProps) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { repoOwner: '', repoName: '', branch: 'main', filePath: '', commitMessage: 'Update quest' },
  });

  useEffect(() => {
    if (!isOpen) return;
    getGitSettings()
      .then((s) => {
        reset((prev) => ({
          ...prev,
          repoOwner: s.repoOwner || prev.repoOwner,
          repoName:  s.repoName  || prev.repoName,
          branch:    s.defaultBranch   || prev.branch,
          filePath:  s.defaultFilePath || prev.filePath,
        }));
      })
      .catch(() => {});
  }, [isOpen, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await pushToGithub(questlineId, {
        format,
        templateId,
        nodeIds,
        repoOwner:     values.repoOwner || undefined,
        repoName:      values.repoName  || undefined,
        branch:        values.branch    || undefined,
        filePath:      values.filePath  || undefined,
        commitMessage: values.commitMessage || undefined,
      });
      toast.success(res.message);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Push failed');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Github className="w-5 h-5" />
            Push to GitHub
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-steel-400 text-sm mb-1">Owner</label>
              <input
                type="text"
                placeholder="my-org"
                {...register('repoOwner', { required: true })}
                className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
            <div>
              <label className="block text-steel-400 text-sm mb-1">Repository</label>
              <input
                type="text"
                placeholder="my-game"
                {...register('repoName', { required: true })}
                className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
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
                className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
            <div>
              <label className="block text-steel-400 text-sm mb-1">File Path</label>
              <input
                type="text"
                placeholder="Assets/Quests"
                {...register('filePath')}
                className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-steel-400 text-sm mb-1">Commit Message</label>
            <input
              type="text"
              placeholder="Update quest"
              {...register('commitMessage')}
              className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-400 focus:outline-none focus:border-pulse text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg transition-colors text-sm"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              {isSubmitting ? 'Pushing...' : 'Push'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
