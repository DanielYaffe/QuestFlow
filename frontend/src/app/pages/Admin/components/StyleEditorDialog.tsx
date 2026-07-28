import React, { useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminSpriteStyle,
  AdminLora,
  AdminCheckpoint,
  ComfyModels,
  WorkflowPresetInfo,
  CreateStylePayload,
  UpdateStylePayload,
  StyleCategory,
  createAdminStyle,
  updateAdminStyle,
} from '../../../api/adminApi';
import { AdminDialog, inputCls, labelCls, btnPrimaryCls } from './ui';

interface LoraRow {
  loraFilename: string;
  strength: number;
  strengthClip: number;
  triggerWord: string;
}

interface StyleFormValues {
  styleId: string;
  name: string;
  description: string;
  previewImagePath: string;
  category: StyleCategory;
  presetId: string;
  checkpointFilename: string;
  promptPrefix: string;
  negativePrompt: string;
  width: number;
  height: number;
  removeBackground: boolean;
  targetSize: string;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  loras: LoraRow[];
}

// Shown when ComfyUI is offline and its live /object_info lists are unavailable
const FALLBACK_SAMPLERS = [
  'euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms',
  'dpmpp_2s_ancestral', 'dpmpp_sde', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_3m_sde',
  'ddpm', 'lcm', 'ddim', 'uni_pc', 'uni_pc_bh2',
];
const FALLBACK_SCHEDULERS = [
  'normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta',
];

interface StyleEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  style: AdminSpriteStyle | null; // null → create
  presets: WorkflowPresetInfo[];
  registryLoras: AdminLora[];
  registryCheckpoints: AdminCheckpoint[];
  comfy: ComfyModels | null;
}

function defaultsFor(style: AdminSpriteStyle | null, presets: WorkflowPresetInfo[]): StyleFormValues {
  if (style) {
    return {
      styleId: style.styleId,
      name: style.name,
      description: style.description,
      previewImagePath: style.previewImagePath,
      category: style.category,
      presetId: '', // '' = keep current workflow
      checkpointFilename: style.checkpointFilename,
      promptPrefix: style.promptPrefix,
      negativePrompt: style.negativePrompt,
      width: style.defaultDimensions.width,
      height: style.defaultDimensions.height,
      removeBackground: style.removeBackground,
      targetSize: style.targetSize ? String(style.targetSize) : '',
      steps: style.sampler.steps,
      cfg: style.sampler.cfg,
      sampler: style.sampler.sampler,
      scheduler: style.sampler.scheduler,
      loras: style.loras.map((l) => ({ ...l, triggerWord: l.triggerWord ?? '' })),
    };
  }
  const preset = presets[0];
  return {
    styleId: '',
    name: '',
    description: '',
    previewImagePath: '',
    category: 'pixel',
    presetId: preset?.presetId ?? '',
    checkpointFilename: '',
    promptPrefix: '',
    negativePrompt: 'blurry, low quality, text, watermark, signature, jpeg artifacts',
    width: 1024,
    height: 1024,
    removeBackground: false,
    targetSize: '',
    steps: preset?.defaultSampler.steps ?? 20,
    cfg: preset?.defaultSampler.cfg ?? 7,
    sampler: preset?.defaultSampler.sampler ?? 'dpmpp_2m',
    scheduler: preset?.defaultSampler.scheduler ?? 'karras',
    loras: [],
  };
}

export function StyleEditorDialog({
  isOpen, onClose, onSaved, style, presets, registryLoras, registryCheckpoints, comfy,
}: StyleEditorDialogProps) {
  const isEdit = style !== null;

  const { register, handleSubmit, reset, watch, setValue, control, formState: { isSubmitting, errors } } =
    useForm<StyleFormValues>({ defaultValues: defaultsFor(style, presets) });
  const { fields, append, remove } = useFieldArray({ control, name: 'loras' });

  useEffect(() => {
    if (isOpen) reset(defaultsFor(style, presets));
  }, [isOpen, style, presets, reset]);

  const presetId = watch('presetId');
  const selectedPreset = presets.find((p) => p.presetId === presetId);
  // With "keep current workflow" selected, capability comes from the existing style
  const supportsLoras = selectedPreset ? selectedPreset.supportsLoras : (style?.loras.length ?? 0) > 0 || Boolean(style?.presetId && presets.find((p) => p.presetId === style.presetId)?.supportsLoras);
  const samplerEditable = selectedPreset ? selectedPreset.samplerEditable : true;

  // Only registered models are offered — the registries in the LoRAs /
  // Checkpoints tabs are the curated catalog, not the raw ComfyUI folder
  const checkpointOptions = useMemo(
    () => registryCheckpoints.filter((c) => c.isActive).map((c) => c.filename).sort(),
    [registryCheckpoints],
  );

  const loraOptions = useMemo(
    () => registryLoras.filter((l) => l.isActive).map((l) => l.filename).sort(),
    [registryLoras],
  );

  const samplerOptions = comfy?.reachable && comfy.samplers.length > 0 ? comfy.samplers : FALLBACK_SAMPLERS;
  const schedulerOptions = comfy?.reachable && comfy.schedulers.length > 0 ? comfy.schedulers : FALLBACK_SCHEDULERS;

  const checkpointValue = watch('checkpointFilename');
  const checkpointMissing = Boolean(comfy?.reachable && checkpointValue && !comfy.checkpoints.includes(checkpointValue));

  const applyPresetSampler = (id: string) => {
    const preset = presets.find((p) => p.presetId === id);
    if (!preset) return;
    setValue('steps', preset.defaultSampler.steps);
    setValue('cfg', preset.defaultSampler.cfg);
    setValue('sampler', preset.defaultSampler.sampler);
    setValue('scheduler', preset.defaultSampler.scheduler);
  };

  const prefillLoraRow = (index: number, filename: string) => {
    const registered = registryLoras.find((l) => l.filename === filename);
    if (!registered) return;
    setValue(`loras.${index}.strength`, registered.defaultStrength);
    setValue(`loras.${index}.strengthClip`, registered.defaultStrengthClip);
    if (registered.triggerWord) setValue(`loras.${index}.triggerWord`, registered.triggerWord);
  };

  const onSubmit = async (values: StyleFormValues) => {
    const base: UpdateStylePayload = {
      name: values.name,
      description: values.description,
      previewImagePath: values.previewImagePath,
      category: values.category,
      checkpointFilename: values.checkpointFilename,
      promptPrefix: values.promptPrefix,
      negativePrompt: values.negativePrompt,
      defaultDimensions: { width: Number(values.width), height: Number(values.height) },
      removeBackground: values.removeBackground,
      targetSize: values.targetSize ? Number(values.targetSize) : null,
      sampler: samplerEditable
        ? { steps: Number(values.steps), cfg: Number(values.cfg), sampler: values.sampler, scheduler: values.scheduler }
        : undefined,
      loras: supportsLoras
        ? values.loras.map((l) => ({
            loraFilename: l.loraFilename,
            strength: Number(l.strength),
            strengthClip: Number(l.strengthClip),
            triggerWord: l.triggerWord || undefined,
          }))
        : [],
    };

    try {
      const result = isEdit
        ? await updateAdminStyle(style.styleId, values.presetId ? { ...base, presetId: values.presetId } : base)
        : await createAdminStyle({ ...base, styleId: values.styleId, presetId: values.presetId } as CreateStylePayload);
      result.warnings.forEach((w) => toast.warning(w));
      toast.success(isEdit ? 'Style updated' : 'Style created');
      onSaved();
      onClose();
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to save style')
          : 'Failed to save style';
      toast.error(message);
    }
  };

  return (
    <AdminDialog
      isOpen={isOpen}
      onClose={onClose}
      wide
      title={isEdit ? `Edit style — ${style.name}` : 'New style'}
      subtitle={isEdit ? style.styleId : 'Create a style from a workflow preset'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Name</label>
            <input {...register('name', { required: true })} placeholder="Watercolor Beasts" className={inputCls} />
            {errors.name && <p className="text-red-400 text-xs mt-1">Name is required</p>}
          </div>
          <div>
            <label className={labelCls}>Style ID {isEdit && <span className="text-steel-500 text-xs">(fixed)</span>}</label>
            <input
              {...register('styleId', { required: !isEdit, pattern: /^[a-z0-9][a-z0-9_-]{1,63}$/ })}
              disabled={isEdit}
              placeholder="watercolor_beasts"
              className={`${inputCls} disabled:opacity-50`}
            />
            {errors.styleId && <p className="text-red-400 text-xs mt-1">Lowercase slug (a-z, 0-9, _ or -)</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Workflow preset</label>
            <select
              {...register('presetId')}
              onChange={(e) => {
                setValue('presetId', e.target.value);
                if (!isEdit || e.target.value) applyPresetSampler(e.target.value);
              }}
              className={inputCls}
            >
              {isEdit && <option value="">(keep current workflow)</option>}
              {presets.map((p) => (
                <option key={p.presetId} value={p.presetId}>{p.name}</option>
              ))}
            </select>
            {selectedPreset && <p className="text-steel-400 text-xs mt-1">{selectedPreset.description}</p>}
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select {...register('category')} className={inputCls}>
              <option value="pixel">pixel</option>
              <option value="illustrated">illustrated</option>
              <option value="realistic">realistic</option>
              <option value="raw">raw</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <input {...register('description')} placeholder="Soft watercolor creature art" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>
            Checkpoint
            {checkpointMissing && (
              <span className="ml-2 text-amber-400 text-xs inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> not found on ComfyUI
              </span>
            )}
          </label>
          <input
            {...register('checkpointFilename', { required: true })}
            list="admin-checkpoint-options"
            placeholder="myCheckpoint.safetensors"
            className={inputCls}
          />
          <datalist id="admin-checkpoint-options">
            {checkpointOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
          {errors.checkpointFilename && <p className="text-red-400 text-xs mt-1">Checkpoint is required</p>}
          <p className="text-steel-500 text-xs mt-1">
            {checkpointOptions.length > 0
              ? 'Suggestions come from the Checkpoints registry tab.'
              : 'No checkpoints registered yet — add them in the Checkpoints tab to get suggestions here.'}
          </p>
        </div>

        {supportsLoras && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls}>LoRAs</label>
              <button
                type="button"
                onClick={() => append({ loraFilename: '', strength: 0.8, strengthClip: 0.8, triggerWord: '' })}
                className="text-volt hover:brightness-95 text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add LoRA
              </button>
            </div>
            {fields.length === 0 && <p className="text-steel-500 text-xs">No LoRAs — checkpoint only.</p>}
            <div className="space-y-2">
              {fields.map((field, i) => {
                const filename = watch(`loras.${i}.loraFilename`);
                const missing = Boolean(comfy?.reachable && filename && !comfy.loras.includes(filename));
                return (
                  <div key={field.id} className="grid grid-cols-[1fr_5rem_5rem_7rem_2rem] gap-2 items-center">
                    <div>
                      <input
                        {...register(`loras.${i}.loraFilename`, { required: true })}
                        list="admin-lora-options"
                        placeholder="myStyle.safetensors"
                        onBlur={(e) => prefillLoraRow(i, e.target.value)}
                        className={inputCls}
                      />
                      {missing && (
                        <p className="text-amber-400 text-xs mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> not found on ComfyUI
                        </p>
                      )}
                    </div>
                    <input {...register(`loras.${i}.strength`, { valueAsNumber: true })} type="number" step="0.05" title="Strength" className={inputCls} />
                    <input {...register(`loras.${i}.strengthClip`, { valueAsNumber: true })} type="number" step="0.05" title="Strength (CLIP)" className={inputCls} />
                    <input {...register(`loras.${i}.triggerWord`)} placeholder="trigger" className={inputCls} />
                    <button type="button" onClick={() => remove(i)} className="text-steel-400 hover:text-red-400 cursor-pointer" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <datalist id="admin-lora-options">
              {loraOptions.map((l) => <option key={l} value={l} />)}
            </datalist>
            <p className="text-steel-500 text-xs mt-1">
              {loraOptions.length > 0
                ? 'Suggestions come from the LoRAs registry tab — picking one prefills its default strengths and trigger word.'
                : 'No LoRAs registered yet — add them in the LoRAs tab to get suggestions and strength prefills here.'}
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Prompt prefix</label>
          <textarea
            {...register('promptPrefix')}
            rows={2}
            placeholder="cbstyle, monster creature, pixel art, clean outline,"
            className={`${inputCls} resize-y`}
          />
        </div>
        <div>
          <label className={labelCls}>Negative prompt</label>
          <textarea {...register('negativePrompt')} rows={2} className={`${inputCls} resize-y`} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Width</label>
            <input {...register('width', { valueAsNumber: true })} type="number" step="64" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Height</label>
            <input {...register('height', { valueAsNumber: true })} type="number" step="64" className={inputCls} />
          </div>
        </div>

        <div className="bg-steel-800/50 border border-steel-700 rounded-lg p-4 space-y-3">
          <p className="text-steel-300 text-sm font-medium">Post-processing — the CB-pixel pipeline, available to any style</p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" {...register('removeBackground')} className="mt-0.5 accent-[#f5d90a]" />
            <span>
              <span className="text-steel-200 text-sm block">Remove background</span>
              <span className="text-steel-500 text-xs block mt-0.5">
                Prompts for a flat background, then cuts it out with RMBG on ComfyUI (needs the ComfyUI-Easy-Use nodes, same as the CB style).
              </span>
            </span>
          </label>
          <div>
            <label className={labelCls}>Pixel-snap size</label>
            <input {...register('targetSize')} type="number" placeholder="e.g. 64 — blank = off" className={inputCls} />
            <p className="text-steel-500 text-xs mt-1">
              Snaps the output to a crisp N×N sprite grid (the CB style uses 64). Works best combined with background removal.
            </p>
          </div>
        </div>

        {samplerEditable && (
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Steps</label>
              <input {...register('steps', { valueAsNumber: true })} type="number" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>CFG</label>
              <input {...register('cfg', { valueAsNumber: true })} type="number" step="0.1" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Sampler</label>
              <select {...register('sampler')} className={inputCls}>
                {[...new Set([watch('sampler'), ...samplerOptions])].filter(Boolean).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Scheduler</label>
              <select {...register('scheduler')} className={inputCls}>
                {[...new Set([watch('scheduler'), ...schedulerOptions])].filter(Boolean).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Preview image</label>
          <input {...register('previewImagePath')} placeholder="/assets/style-previews/my_style.png" className={inputCls} />
          <p className="text-steel-500 text-xs mt-1">
            Thumbnail shown in the style picker on the Sprites page. Drop a PNG into{' '}
            <code className="text-steel-400">frontend/public/assets/style-previews/</code> and reference it, or paste any image URL. Optional.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={isSubmitting} className={btnPrimaryCls}>
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create style'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
