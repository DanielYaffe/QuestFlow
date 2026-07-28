import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2, Save, CheckCircle2, CircleDashed, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminLora,
  AdminCheckpoint,
  ComfyModels,
  createAdminLora,
  updateAdminLora,
  deleteAdminLora,
  createAdminCheckpoint,
  updateAdminCheckpoint,
  deleteAdminCheckpoint,
  CreateLoraPayload,
  CreateCheckpointPayload,
} from '../../../api/adminApi';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { AdminDialog, inputCls, labelCls, btnPrimaryCls } from './ui';

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (message) return message;
  }
  return fallback;
}

function InstalledBadge({ installed, reachable }: { installed: boolean; reachable: boolean }) {
  if (!reachable) return null;
  return installed ? (
    <span className="text-emerald-400 text-xs flex items-center gap-1" title="File present on ComfyUI host">
      <CheckCircle2 className="w-3.5 h-3.5" /> installed
    </span>
  ) : (
    <span className="text-amber-400 text-xs flex items-center gap-1" title="File not found on ComfyUI host — copy it into the models folder">
      <CircleDashed className="w-3.5 h-3.5" /> not installed
    </span>
  );
}

// ---------------------------------------------------------------------------
// LoRA registry
// ---------------------------------------------------------------------------

interface LoraFormValues {
  filename: string;
  displayName: string;
  triggerWord: string;
  defaultStrength: number;
  defaultStrengthClip: number;
  source: 'civitai' | 'huggingface' | 'handmade';
  sourceUrl: string;
  description: string;
}

export function LoraRegistryTab({ loras, comfy, onChanged }: { loras: AdminLora[]; comfy: ComfyModels | null; onChanged: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminLora | null>(null);
  const [deleting, setDeleting] = useState<AdminLora | null>(null);

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<LoraFormValues>();

  useEffect(() => {
    if (dialogOpen) {
      reset(editing ? {
        filename: editing.filename,
        displayName: editing.displayName,
        triggerWord: editing.triggerWord ?? '',
        defaultStrength: editing.defaultStrength,
        defaultStrengthClip: editing.defaultStrengthClip,
        source: editing.source,
        sourceUrl: editing.sourceUrl ?? '',
        description: editing.description ?? '',
      } : {
        filename: '', displayName: '', triggerWord: '', defaultStrength: 0.8, defaultStrengthClip: 0.8,
        source: 'civitai', sourceUrl: '', description: '',
      });
    }
  }, [dialogOpen, editing, reset]);

  const onSubmit = async (values: LoraFormValues) => {
    const payload: CreateLoraPayload = {
      filename: values.filename,
      displayName: values.displayName,
      triggerWord: values.triggerWord || undefined,
      defaultStrength: Number(values.defaultStrength),
      defaultStrengthClip: Number(values.defaultStrengthClip),
      source: values.source,
      sourceUrl: values.sourceUrl || undefined,
      description: values.description || undefined,
    };
    try {
      if (editing) {
        const { filename: _f, ...update } = payload;
        await updateAdminLora(editing.filename, update);
      } else {
        await createAdminLora(payload);
      }
      toast.success(editing ? 'LoRA updated' : 'LoRA registered');
      setDialogOpen(false);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to save LoRA'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAdminLora(deleting.filename);
      toast.success(`Removed "${deleting.displayName}"`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete LoRA'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-steel-400 text-sm">
          Register LoRA files after copying them into the ComfyUI <code className="text-steel-300">models/loras</code> folder.
        </p>
        <button onClick={() => { setEditing(null); setDialogOpen(true); }} className={btnPrimaryCls}>
          <Plus className="w-4 h-4" /> Register LoRA
        </button>
      </div>

      <div className="space-y-2">
        {loras.map((lora) => (
          <div key={lora.filename} className="bg-steel-850 border border-steel-700 rounded-md px-4 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-steel-100 text-sm font-medium truncate">{lora.displayName}</span>
                {lora.triggerWord && <code className="text-volt/80 text-xs">{lora.triggerWord}</code>}
                <InstalledBadge installed={Boolean(comfy?.loras.includes(lora.filename))} reachable={Boolean(comfy?.reachable)} />
              </div>
              <div className="text-steel-400 text-xs truncate mt-0.5">
                {lora.filename} · strength {lora.defaultStrength}/{lora.defaultStrengthClip} · {lora.source}
              </div>
            </div>
            {lora.sourceUrl && (
              <a href={lora.sourceUrl} target="_blank" rel="noreferrer" className="text-steel-400 hover:text-steel-100" title="Open source page">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button onClick={() => { setEditing(lora); setDialogOpen(true); }} className="text-steel-400 hover:text-steel-100 cursor-pointer" title="Edit">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => setDeleting(lora)} className="text-steel-400 hover:text-red-400 cursor-pointer" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {loras.length === 0 && <p className="text-steel-500 text-sm text-center py-10">No LoRAs registered yet.</p>}
      </div>

      <AdminDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit LoRA — ${editing.displayName}` : 'Register LoRA'}
        subtitle={editing?.filename}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Filename</label>
            <input
              {...register('filename', { required: true, pattern: /\.(safetensors|ckpt|pt)$/ })}
              disabled={editing !== null}
              list="registry-lora-files"
              placeholder="myStyle.safetensors"
              className={`${inputCls} disabled:opacity-50`}
            />
            <datalist id="registry-lora-files">
              {(comfy?.loras ?? []).map((l) => <option key={l} value={l} />)}
            </datalist>
            {errors.filename && <p className="text-red-400 text-xs mt-1">Must end in .safetensors, .ckpt or .pt</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Display name</label>
              <input {...register('displayName', { required: true })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Trigger word</label>
              <input {...register('triggerWord')} placeholder="optional" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Default strength</label>
              <input {...register('defaultStrength', { valueAsNumber: true })} type="number" step="0.05" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Default strength (CLIP)</label>
              <input {...register('defaultStrengthClip', { valueAsNumber: true })} type="number" step="0.05" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Source</label>
              <select {...register('source')} className={inputCls}>
                <option value="civitai">civitai</option>
                <option value="huggingface">huggingface</option>
                <option value="handmade">handmade</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Source URL</label>
            <input {...register('sourceUrl')} placeholder="https://civitai.com/models/…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea {...register('description')} rows={2} className={`${inputCls} resize-y`} />
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSubmitting} className={btnPrimaryCls}>
              <Save className="w-4 h-4" /> {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </AdminDialog>

      <ConfirmModal
        isOpen={deleting !== null}
        title="Delete LoRA"
        message={`Remove "${deleting?.displayName}" from the registry? The file on the ComfyUI host is not touched.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkpoint registry
// ---------------------------------------------------------------------------

interface CheckpointFormValues {
  filename: string;
  displayName: string;
  baseModel: 'SDXL' | 'SD1.5' | 'Flux';
  source: 'civitai' | 'huggingface' | 'handmade';
  sourceUrl: string;
  description: string;
}

export function CheckpointRegistryTab({ checkpoints, comfy, onChanged }: { checkpoints: AdminCheckpoint[]; comfy: ComfyModels | null; onChanged: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCheckpoint | null>(null);
  const [deleting, setDeleting] = useState<AdminCheckpoint | null>(null);

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<CheckpointFormValues>();

  useEffect(() => {
    if (dialogOpen) {
      reset(editing ? {
        filename: editing.filename,
        displayName: editing.displayName,
        baseModel: editing.baseModel,
        source: editing.source,
        sourceUrl: editing.sourceUrl ?? '',
        description: editing.description ?? '',
      } : {
        filename: '', displayName: '', baseModel: 'SDXL', source: 'civitai', sourceUrl: '', description: '',
      });
    }
  }, [dialogOpen, editing, reset]);

  const onSubmit = async (values: CheckpointFormValues) => {
    const payload: CreateCheckpointPayload = {
      filename: values.filename,
      displayName: values.displayName,
      baseModel: values.baseModel,
      source: values.source,
      sourceUrl: values.sourceUrl || undefined,
      description: values.description || undefined,
    };
    try {
      if (editing) {
        const { filename: _f, ...update } = payload;
        await updateAdminCheckpoint(editing.filename, update);
      } else {
        await createAdminCheckpoint(payload);
      }
      toast.success(editing ? 'Checkpoint updated' : 'Checkpoint registered');
      setDialogOpen(false);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to save checkpoint'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAdminCheckpoint(deleting.filename);
      toast.success(`Removed "${deleting.displayName}"`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete checkpoint'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-steel-400 text-sm">
          Register checkpoint files after copying them into the ComfyUI <code className="text-steel-300">models/checkpoints</code> folder.
        </p>
        <button onClick={() => { setEditing(null); setDialogOpen(true); }} className={btnPrimaryCls}>
          <Plus className="w-4 h-4" /> Register checkpoint
        </button>
      </div>

      <div className="space-y-2">
        {checkpoints.map((checkpoint) => (
          <div key={checkpoint.filename} className="bg-steel-850 border border-steel-700 rounded-md px-4 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-steel-100 text-sm font-medium truncate">{checkpoint.displayName}</span>
                <span className="text-steel-500 text-xs">{checkpoint.baseModel}</span>
                <InstalledBadge installed={Boolean(comfy?.checkpoints.includes(checkpoint.filename))} reachable={Boolean(comfy?.reachable)} />
              </div>
              <div className="text-steel-400 text-xs truncate mt-0.5">{checkpoint.filename} · {checkpoint.source}</div>
            </div>
            {checkpoint.sourceUrl && (
              <a href={checkpoint.sourceUrl} target="_blank" rel="noreferrer" className="text-steel-400 hover:text-steel-100" title="Open source page">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button onClick={() => { setEditing(checkpoint); setDialogOpen(true); }} className="text-steel-400 hover:text-steel-100 cursor-pointer" title="Edit">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => setDeleting(checkpoint)} className="text-steel-400 hover:text-red-400 cursor-pointer" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {checkpoints.length === 0 && <p className="text-steel-500 text-sm text-center py-10">No checkpoints registered yet.</p>}
      </div>

      <AdminDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit checkpoint — ${editing.displayName}` : 'Register checkpoint'}
        subtitle={editing?.filename}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={labelCls}>Filename</label>
            <input
              {...register('filename', { required: true, pattern: /\.(safetensors|ckpt|pt)$/ })}
              disabled={editing !== null}
              list="registry-checkpoint-files"
              placeholder="myCheckpoint.safetensors"
              className={`${inputCls} disabled:opacity-50`}
            />
            <datalist id="registry-checkpoint-files">
              {(comfy?.checkpoints ?? []).map((c) => <option key={c} value={c} />)}
            </datalist>
            {errors.filename && <p className="text-red-400 text-xs mt-1">Must end in .safetensors, .ckpt or .pt</p>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Display name</label>
              <input {...register('displayName', { required: true })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Base model</label>
              <select {...register('baseModel')} className={inputCls}>
                <option value="SDXL">SDXL</option>
                <option value="SD1.5">SD1.5</option>
                <option value="Flux">Flux</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Source</label>
              <select {...register('source')} className={inputCls}>
                <option value="civitai">civitai</option>
                <option value="huggingface">huggingface</option>
                <option value="handmade">handmade</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Source URL</label>
              <input {...register('sourceUrl')} placeholder="https://civitai.com/models/…" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea {...register('description')} rows={2} className={`${inputCls} resize-y`} />
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSubmitting} className={btnPrimaryCls}>
              <Save className="w-4 h-4" /> {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </AdminDialog>

      <ConfirmModal
        isOpen={deleting !== null}
        title="Delete checkpoint"
        message={`Remove "${deleting?.displayName}" from the registry? The file on the ComfyUI host is not touched.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
