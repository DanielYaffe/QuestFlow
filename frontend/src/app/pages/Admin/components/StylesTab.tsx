import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Star, ArrowUp, ArrowDown, AlertTriangle, Layers } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminSpriteStyle,
  AdminLora,
  AdminCheckpoint,
  ComfyModels,
  WorkflowPresetInfo,
  updateAdminStyle,
  setDefaultAdminStyle,
  reorderAdminStyles,
  deleteAdminStyle,
} from '../../../api/adminApi';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { StyleEditorDialog } from './StyleEditorDialog';
import { CategoryChip, btnPrimaryCls } from './ui';

interface StylesTabProps {
  styles: AdminSpriteStyle[];
  presets: WorkflowPresetInfo[];
  registryLoras: AdminLora[];
  registryCheckpoints: AdminCheckpoint[];
  comfy: ComfyModels | null;
  onChanged: () => void;
}

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (message) return message;
  }
  return fallback;
}

export function StylesTab({ styles, presets, registryLoras, registryCheckpoints, comfy, onChanged }: StylesTabProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminSpriteStyle | null>(null);
  const [deleting, setDeleting] = useState<AdminSpriteStyle | null>(null);

  const missingFiles = (style: AdminSpriteStyle): string[] => {
    if (!comfy?.reachable) return [];
    const missing: string[] = [];
    if (!comfy.checkpoints.includes(style.checkpointFilename)) missing.push(style.checkpointFilename);
    for (const lora of style.loras) {
      if (!comfy.loras.includes(lora.loraFilename)) missing.push(lora.loraFilename);
    }
    return missing;
  };

  const toggleActive = async (style: AdminSpriteStyle) => {
    try {
      await updateAdminStyle(style.styleId, { isActive: !style.isActive });
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to update style'));
    }
  };

  const makeDefault = async (style: AdminSpriteStyle) => {
    try {
      await setDefaultAdminStyle(style.styleId);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to set default'));
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= styles.length) return;
    const ids = styles.map((s) => s.styleId);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reorderAdminStyles(ids);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to reorder styles'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAdminStyle(deleting.styleId);
      toast.success(`Deleted "${deleting.name}"`);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, 'Failed to delete style'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setEditorOpen(true); }} className={btnPrimaryCls}>
          <Plus className="w-4 h-4" /> New style
        </button>
      </div>

      <div className="space-y-2">
        {styles.map((style, i) => {
          const missing = missingFiles(style);
          return (
            <div
              key={style.styleId}
              className={`bg-steel-850 border border-steel-700 rounded-md px-4 py-3 flex items-center gap-4 ${style.isActive ? '' : 'opacity-60'}`}
            >
              <div className="flex flex-col gap-0.5">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-steel-500 hover:text-steel-200 disabled:opacity-30 cursor-pointer" title="Move up">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === styles.length - 1} className="text-steel-500 hover:text-steel-200 disabled:opacity-30 cursor-pointer" title="Move down">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="w-10 h-10 rounded bg-steel-800 border border-steel-700 shrink-0 overflow-hidden flex items-center justify-center">
                {style.previewImagePath ? (
                  <img src={style.previewImagePath} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <Layers className="w-4 h-4 text-steel-500" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-steel-100 text-sm font-medium truncate">{style.name}</span>
                  <code className="text-steel-500 text-xs">{style.styleId}</code>
                  <CategoryChip category={style.category} />
                  {missing.length > 0 && (
                    <span className="text-amber-400 text-xs flex items-center gap-1" title={`Missing on ComfyUI: ${missing.join(', ')}`}>
                      <AlertTriangle className="w-3.5 h-3.5" /> missing files
                    </span>
                  )}
                </div>
                <div className="text-steel-400 text-xs truncate mt-0.5">
                  {style.checkpointFilename}
                  {style.loras.length > 0 && <span className="text-steel-500"> · {style.loras.length} LoRA{style.loras.length > 1 ? 's' : ''}</span>}
                  {style.removeBackground && <span className="text-steel-500"> · rembg</span>}
                  {style.targetSize && <span className="text-steel-500"> · snap {style.targetSize}px</span>}
                </div>
              </div>

              <button
                onClick={() => makeDefault(style)}
                className={`cursor-pointer transition-colors ${style.isDefault ? 'text-volt' : 'text-steel-600 hover:text-steel-300'}`}
                title={style.isDefault ? 'Default style' : 'Make default'}
              >
                <Star className="w-4 h-4" fill={style.isDefault ? 'currentColor' : 'none'} />
              </button>

              <button
                onClick={() => toggleActive(style)}
                className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer shrink-0 ${style.isActive ? 'bg-volt' : 'bg-steel-700'}`}
                title={style.isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-steel-950 transition-[left] ${style.isActive ? 'left-[18px]' : 'left-0.5'}`} />
              </button>

              <button onClick={() => { setEditing(style); setEditorOpen(true); }} className="text-steel-400 hover:text-steel-100 cursor-pointer" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => setDeleting(style)} className="text-steel-400 hover:text-red-400 cursor-pointer" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        {styles.length === 0 && (
          <p className="text-steel-500 text-sm text-center py-10">No styles yet — create one to get started.</p>
        )}
      </div>

      <StyleEditorDialog
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={onChanged}
        style={editing}
        presets={presets}
        registryLoras={registryLoras}
        registryCheckpoints={registryCheckpoints}
        comfy={comfy}
      />

      <ConfirmModal
        isOpen={deleting !== null}
        title="Delete style"
        message={`Delete "${deleting?.name}"? Existing sprites keep their data, but this style will no longer be selectable.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
