import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Pencil, Trash2, Save, CheckCircle2, CircleDashed, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminLora,
  RunpodManifest,
  manifestLoras,
  createAdminLora,
  updateAdminLora,
  deleteAdminLora,
  CreateLoraPayload,
} from '../../../api/adminApi';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { AdminDialog, inputCls, labelCls, btnPrimaryCls, apiError } from './ui';

// Model files are baked into the Docker images at build time, so "deployed"
// means "listed in the manifest" — there is no host to copy a file onto.
function DeployedBadge({ deployed, manifest }: { deployed: boolean; manifest: RunpodManifest | null }) {
  if (!manifest) return null;
  return deployed ? (
    <span className="text-emerald-400 text-xs flex items-center gap-1" title={`Baked into an image in manifest ${manifest.version}`}>
      <CheckCircle2 className="w-3.5 h-3.5" /> deployed
    </span>
  ) : (
    <span className="text-amber-400 text-xs flex items-center gap-1" title={`Not in manifest ${manifest.version} — rebuild the image with this file, update the endpoint, then regenerate the manifest`}>
      <CircleDashed className="w-3.5 h-3.5" /> not deployed
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

export function LoraRegistryTab({ loras, manifest, onChanged }: { loras: AdminLora[]; manifest: RunpodManifest | null; onChanged: () => void }) {
  const deployedLoras = manifestLoras(manifest);
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
          Register LoRA files after baking them into the <code className="text-steel-300">sdxl-lora</code> image and regenerating the manifest. LoRAs only exist in that image.
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
                <DeployedBadge deployed={deployedLoras.includes(lora.filename)} manifest={manifest} />
              </div>
              <div className="text-steel-400 text-xs truncate mt-0.5">
                {lora.filename} Â· strength {lora.defaultStrength}/{lora.defaultStrengthClip} Â· {lora.source}
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
              {deployedLoras.map((l) => <option key={l} value={l} />)}
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
        message={`Remove "${deleting?.displayName}" from the registry? The file baked into the image is not touched.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

