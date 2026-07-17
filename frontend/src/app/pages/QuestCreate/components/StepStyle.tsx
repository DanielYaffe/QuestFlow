import React, { useEffect, useState } from 'react';
import { Check, Loader2, ImageOff } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { getStyles, SpriteStyle } from '../../../api/spriteApi';
import { CHECKER_SM } from '../../../utils/spriteStyles';

const categoryBadge: Record<SpriteStyle['category'], { label: string; color: string }> = {
  pixel:       { label: 'Pixel Art',  color: 'bg-emerald-600 text-white' },
  illustrated: { label: 'Illustrated', color: 'bg-blue-600 text-white' },
  realistic:   { label: 'Realistic',   color: 'bg-amber-500 text-white' },
  raw:         { label: 'Raw SDXL',    color: 'bg-steel-500 text-steel-100' },
};

interface StepStyleProps {
  selectedStyleId: string;
  onSelect: (styleId: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function StepStyle({ selectedStyleId, onSelect, onBack, onSubmit }: StepStyleProps) {
  const [styles, setStyles] = useState<SpriteStyle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStyles()
      .then(setStyles)
      .catch(() => setStyles([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full flex flex-col gap-6">
      <WizardStepIndicator currentStep={3} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-steel-100">Choose your visual style</h2>
        <p className="text-steel-400">This sets the art direction for your sprites and characters</p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {styles.map((style) => {
              const isSelected = selectedStyleId === style.id;
              const badge = categoryBadge[style.category];
              return (
                <button
                  key={style.id}
                  onClick={() => onSelect(style.id)}
                  className={`flex flex-col gap-2 p-3 rounded-md border text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-600/10 ring-1 ring-blue-500/40'
                      : 'border-steel-600 bg-steel-800/60 hover:border-steel-500 hover:bg-steel-800'
                  }`}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative w-full aspect-square rounded-lg overflow-hidden flex items-center justify-center"
                    style={CHECKER_SM}
                  >
                    {style.previewImagePath ? (
                      <img
                        src={style.previewImagePath}
                        alt={style.name}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <ImageOff className="w-8 h-8 text-steel-500" />
                    )}

                    {/* Selected check */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
                        <Check className="w-3.5 h-3.5 text-steel-100" />
                      </div>
                    )}

                    {/* Category badge */}
                    <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-semibold ${badge.color}`}>
                      {badge.label}
                    </div>
                  </div>

                  {/* Info */}
                  <div>
                    <p className={`text-sm font-medium leading-tight ${isSelected ? 'text-blue-300' : 'text-white'}`}>
                      {style.name}
                    </p>
                    <p className="text-xs text-steel-400 mt-0.5 leading-snug line-clamp-2">{style.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-steel-700">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!selectedStyleId}
          className={`px-6 py-2.5 rounded-md text-sm font-medium transition-all ${
            selectedStyleId
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25'
              : 'bg-steel-800 text-steel-400 cursor-not-allowed'
          }`}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}