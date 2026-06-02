import React, { useEffect, useState } from 'react';
import { Plus, FileCode, Loader2, Check } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { CustomFormatEditor } from './CustomFormatEditor';
import { listCustomFormats, CustomFormat } from '../../../api/customFormatApi';

interface StepFormatProps {
  onBack: () => void;
  onSubmit: () => void;
}

export function StepFormat({ onBack, onSubmit }: StepFormatProps) {
  const [formats, setFormats]   = useState<CustomFormat[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = () => {
    setLoading(true);
    listCustomFormats()
      .then(setFormats)
      .catch(() => setFormats([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="h-full flex flex-col gap-6">
      <WizardStepIndicator currentStep={3} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-white">Custom export format</h2>
        <p className="text-zinc-400">
          Optional — import a template for your own game engine so it's available when you export. You can skip this.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-7 h-7 text-purple-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {formats.map((f) => {
              const isSelected = selectedId === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedId(isSelected ? null : f.id)}
                  className={`relative flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    isSelected ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-500/10' : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  <FileCode className="w-5 h-5 text-purple-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{f.name}</p>
                    <p className="text-xs text-zinc-500">.{f.extension}</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}

            {/* Import new */}
            <button
              onClick={() => setEditorOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 hover:border-purple-500 px-4 py-3 text-zinc-400 hover:text-purple-300 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Import new format
            </button>
          </div>
        )}

        {!loading && formats.length === 0 && (
          <p className="text-center text-zinc-600 text-sm mt-4">No custom formats yet — import one above.</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          className="px-6 py-2.5 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 transition-all"
        >
          Continue →
        </button>
      </div>

      <CustomFormatEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={(created) => { setFormats((prev) => [created, ...prev]); setSelectedId(created.id); }}
      />
    </div>
  );
}
