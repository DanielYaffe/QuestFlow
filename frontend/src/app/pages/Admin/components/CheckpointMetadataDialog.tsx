import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminCheckpoint,
  CreateCheckpointPayload,
  createAdminCheckpoint,
  updateAdminCheckpoint,
} from '../../../api/adminApi';
import { AdminDialog, inputCls, labelCls, btnPrimaryCls, apiError } from './ui';

// ---------------------------------------------------------------------------
// Checkpoint metadata — display name, provenance, notes.
//
// The manifest decides which checkpoints exist; this only decorates them. So
// the filename is never free text when opened from an endpoint card: it is
// whatever that image has baked in.
// ---------------------------------------------------------------------------

interface CheckpointFormValues {
  filename: string;
  displayName: string;
  baseModel: 'SDXL' | 'SD1.5' | 'Flux';
  source: 'civitai' | 'huggingface' | 'handmade';
  sourceUrl: string;
  description: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Existing metadata to edit, or null to create it. */
  checkpoint: AdminCheckpoint | null;
  /** Filename to register when creating — comes from the manifest, so it is fixed. */
  filename: string;
}

export function CheckpointMetadataDialog({ isOpen, onClose, onSaved, checkpoint, filename }: Props) {
  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<CheckpointFormValues>();

  useEffect(() => {
    if (!isOpen) return;
    reset(checkpoint ? {
      filename: checkpoint.filename,
      displayName: checkpoint.displayName,
      baseModel: checkpoint.baseModel,
      source: checkpoint.source,
      sourceUrl: checkpoint.sourceUrl ?? '',
      description: checkpoint.description ?? '',
    } : {
      filename,
      // A sensible starting point beats an empty box: the filename is usually
      // close to what you want the display name to be.
      displayName: filename.replace(/\.(safetensors|ckpt|pt)$/, ''),
      baseModel: 'SDXL',
      source: 'civitai',
      sourceUrl: '',
      description: '',
    });
  }, [isOpen, checkpoint, filename, reset]);

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
      if (checkpoint) {
        const { filename: _f, ...update } = payload;
        await updateAdminCheckpoint(checkpoint.filename, update);
      } else {
        await createAdminCheckpoint(payload);
      }
      toast.success(checkpoint ? 'Checkpoint details updated' : 'Checkpoint details saved');
      onClose();
      onSaved();
    } catch (err) {
      toast.error(apiError(err, 'Failed to save checkpoint details'));
    }
  };

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      title={checkpoint ? `Edit — ${checkpoint.displayName}` : 'Add checkpoint details'}
      subtitle={filename}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input type="hidden" {...register('filename', { required: true })} />

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Display name</label>
            <input {...register('displayName', { required: true })} className={inputCls} />
            {errors.displayName && <p className="text-red-400 text-xs mt-1">Display name is required</p>}
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
  );
}
