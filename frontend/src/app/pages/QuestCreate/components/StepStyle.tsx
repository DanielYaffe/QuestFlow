import React, { useEffect, useState } from 'react';
import { Check, Loader2, ImageOff } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { QuestStyle, getQuestStyles } from '../../../api/questStyleApi';

const tierBadge: Record<QuestStyle['tier'], { label: string; color: string } | null> = {
  free: null,
  pro:  { label: 'Pro',  color: 'bg-purple-600 text-white' },
  plus: { label: 'Plus', color: 'bg-amber-500 text-white' },
};

interface StepStyleProps {
  selectedStyleId: string;
  onSelect: (styleId: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function StepStyle({ selectedStyleId, onSelect, onBack, onSubmit }: StepStyleProps) {
  const [styles, setStyles] = useState<QuestStyle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQuestStyles()
      .then(setStyles)
      .catch(() => setStyles([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full flex flex-col gap-6">
      <WizardStepIndicator currentStep={2} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-white">Choose your visual style</h2>
        <p className="text-zinc-400">This shapes the atmosphere and tone of your generated questline</p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            {styles.map((style) => {
              const isSelected = selectedStyleId === style._id;
              const badge = tierBadge[style.tier];
              return (
                <button
                  key={style._id}
                  onClick={() => onSelect(style._id)}
                  className={`relative rounded-2xl border-2 overflow-hidden text-left transition-all group ${
                    isSelected
                      ? 'border-purple-500 ring-2 ring-purple-500/30'
                      : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                    {style.imageUrl ? (
                      <img
                        src={style.imageUrl}
                        alt={style.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="w-8 h-8 text-zinc-600" />
                      </div>
                    )}

                    {/* Selected check */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center shadow-lg">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}

                    {/* Tier badge */}
                    {badge && (
                      <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-semibold ${badge.color}`}>
                        {badge.label}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className={`px-4 py-3 transition-colors ${isSelected ? 'bg-purple-500/10' : 'bg-zinc-900'}`}>
                    <p className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                      {style.name}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{style.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!selectedStyleId}
          className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
            selectedStyleId
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
