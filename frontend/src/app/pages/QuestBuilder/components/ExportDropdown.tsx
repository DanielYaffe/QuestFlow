import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, Github, ChevronDown, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadExport, pushToGithub, ExportFormat } from '../../../api/questExportApi';
import { getGitSettings } from '../../../api/userSettingsApi';

interface ExportDropdownProps {
  questlineId: string;
}

interface FormatOption {
  value: ExportFormat;
  label: string;
}

const FORMATS: FormatOption[] = [
  { value: 'questflow-json',   label: 'QuestFlow JSON (.json)' },
  { value: 'questflow-yaml',   label: 'QuestFlow YAML (.yaml)' },
  { value: 'unity-asset',      label: 'Unity ScriptableObject (.asset)' },
  { value: 'unreal-datatable', label: 'Unreal DataTable (.json)' },
  { value: 'godot-tres',       label: 'Godot Resource (.tres)' },
];

interface PushFormValues {
  format: ExportFormat;
  repoOwner: string;
  repoName: string;
  branch: string;
  filePath: string;
  commitMessage: string;
}

function triggerBrowserDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDropdown({ questlineId }: ExportDropdownProps) {
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<PushFormValues>({
    defaultValues: {
      format: 'questflow-json',
      repoOwner: '',
      repoName: '',
      branch: 'main',
      filePath: '',
      commitMessage: 'Update quest',
    },
  });

  // Pre-fill push form from saved git settings when dialog opens
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    if (!pushDialogOpen || settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
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
  }, [pushDialogOpen, reset]);

  const handleDownload = async (format: ExportFormat) => {
    setDownloading(format);
    try {
      const result = await downloadExport(questlineId, format);
      triggerBrowserDownload(result.filename, result.content, result.mimeType);
      toast.success(`Downloaded ${result.filename}`);
    } catch {
      toast.error('Export failed');
    } finally {
      setDownloading(null);
    }
  };

  const onPushSubmit = async (values: PushFormValues) => {
    try {
      const res = await pushToGithub(questlineId, {
        format:        values.format,
        repoOwner:     values.repoOwner || undefined,
        repoName:      values.repoName  || undefined,
        branch:        values.branch    || undefined,
        filePath:      values.filePath  || undefined,
        commitMessage: values.commitMessage || undefined,
      });
      toast.success(res.message);
      setPushDialogOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Push failed';
      toast.error(msg);
    }
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm">
            Export Quest
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 min-w-[220px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-1.5 mt-1"
            sideOffset={4}
            align="end"
          >
            <div className="px-2 py-1 text-zinc-500 text-xs uppercase tracking-wider">Download</div>
            {FORMATS.map((f) => (
              <DropdownMenu.Item
                key={f.value}
                disabled={downloading !== null}
                onSelect={() => handleDownload(f.value)}
                className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer outline-none data-[disabled]:opacity-50"
              >
                {downloading === f.value
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />
                }
                {f.label}
              </DropdownMenu.Item>
            ))}

            <DropdownMenu.Separator className="my-1.5 h-px bg-zinc-700" />

            <div className="px-2 py-1 text-zinc-500 text-xs uppercase tracking-wider">Push to GitHub</div>
            <DropdownMenu.Item
              onSelect={() => setPushDialogOpen(true)}
              className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer outline-none"
            >
              <Github className="w-3.5 h-3.5" />
              Push to repository…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
          <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-white font-semibold text-lg">Push to GitHub</Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit(onPushSubmit)} className="space-y-4">
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Format</label>
                <select
                  {...register('format')}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                >
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Owner</label>
                  <input
                    type="text"
                    placeholder="my-org"
                    {...register('repoOwner', { required: true })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Repository</label>
                  <input
                    type="text"
                    placeholder="my-game"
                    {...register('repoName', { required: true })}
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
                    {...register('branch')}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">File Path</label>
                  <input
                    type="text"
                    placeholder="Assets/Quests"
                    {...register('filePath')}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 text-sm mb-1">Commit Message</label>
                <input
                  type="text"
                  placeholder="Update quest"
                  {...register('commitMessage')}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                  {isSubmitting ? 'Pushing...' : 'Push'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
