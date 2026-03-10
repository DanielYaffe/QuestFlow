import React from 'react';
import { User, Sword, Heart, Skull, HelpCircle, RefreshCw, Loader2 } from 'lucide-react';
import { GeneratedCharacter, CharacterRole } from '../../../api/questCreateApi';
import { WizardStepIndicator } from './WizardStepIndicator';

interface StepCharactersProps {
  characters: GeneratedCharacter[];
  isLoading: boolean;
  onBack: () => void;
  onSubmit: () => void;
  onRegenerate: () => void;
}

const roleConfig: Record<CharacterRole, { label: string; icon: React.ElementType; color: string; border: string }> = {
  npc:     { label: 'NPC',     icon: User,        color: 'text-zinc-400',   border: 'border-zinc-600' },
  ally:    { label: 'Ally',    icon: Heart,        color: 'text-blue-400',   border: 'border-blue-600' },
  villain: { label: 'Villain', icon: Sword,        color: 'text-red-400',    border: 'border-red-600' },
  monster: { label: 'Monster', icon: Skull,        color: 'text-orange-400', border: 'border-orange-600' },
  neutral: { label: 'Neutral', icon: HelpCircle,   color: 'text-amber-400',  border: 'border-amber-600' },
};

export function StepCharacters({ characters, isLoading, onBack, onSubmit, onRegenerate }: StepCharactersProps) {
  return (
    <div className="h-full flex flex-col gap-6">
      <WizardStepIndicator currentStep={4} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-white">Characters in your story</h2>
        <p className="text-zinc-400">AI-deduced characters from your premise — these will be saved to your questline</p>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-zinc-500 text-sm animate-pulse">Deducing characters from your story…</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1">
          {characters.map((char) => {
            const cfg = roleConfig[char.role];
            const Icon = cfg.icon;
            return (
              <div
                key={char.id}
                className={`rounded-xl border bg-zinc-900 px-5 py-4 flex items-start gap-4 ${cfg.border} border-opacity-40`}
              >
                {/* Role icon badge */}
                <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg bg-zinc-800 border ${cfg.border} border-opacity-50 flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-semibold text-sm">{char.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-800 border ${cfg.border} border-opacity-40 ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-xs leading-relaxed mb-1">{char.appearance}</p>
                  <p className="text-zinc-500 text-xs leading-relaxed italic">{char.background}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>

          <button
            onClick={onSubmit}
            disabled={isLoading || characters.length === 0}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
              !isLoading && characters.length > 0
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}
