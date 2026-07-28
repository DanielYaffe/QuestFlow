import React from 'react';
import { Check, User, Skull, RefreshCw, Loader2, FolderOpen } from 'lucide-react';
import { GeneratedCharacter, CharacterRole } from '../../../api/questCreateApi';
import { WizardStepIndicator } from './WizardStepIndicator';
import { GroundedBadge } from '../../../components/shared/GroundedBadge';

interface StepCharactersProps {
  characters: GeneratedCharacter[];
  selectedCharacters: string[];
  isLoading: boolean;
  onToggleCharacter: (id: string) => void;
  onSelectAllCharacters: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onRegenerate: () => void;
}

const roleConfig: Record<CharacterRole, { label: string; icon: React.ElementType; color: string; border: string }> = {
  npc:     { label: 'NPC',     icon: User,  color: 'text-steel-400',   border: 'border-steel-500'   },
  monster: { label: 'Monster', icon: Skull, color: 'text-orange-400', border: 'border-orange-600' },
};

const fallbackRoleConfig = roleConfig.neutral;

function getRoleConfig(role?: string) {
  return roleConfig[role as CharacterRole] ?? fallbackRoleConfig;
}

export function StepCharacters({
  characters,
  selectedCharacters,
  isLoading,
  onToggleCharacter,
  onSelectAllCharacters,
  onBack,
  onSubmit,
  onRegenerate,
}: StepCharactersProps) {
  const allSelected = characters.length > 0 && selectedCharacters.length === characters.length;
  const canSubmit = !isLoading && selectedCharacters.length > 0;

  return (
    <div className="h-full flex flex-col gap-6">
      <WizardStepIndicator currentStep={5} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-steel-100">Characters in your story</h2>
        <p className="text-steel-400">Select the characters to include in your questline</p>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-pulse animate-spin" />
          <p className="text-steel-400 text-sm animate-pulse">Deducing characters from your story…</p>
        </div>
      ) : (
        <>
          {/* Select all / count row */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={onSelectAllCharacters}
              className="text-xs text-pulse hover:text-pulse transition-colors"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            {selectedCharacters.length > 0 && (
              <span className="text-xs text-pulse bg-steel-800 border border-steel-600 rounded-full px-2 py-0.5">
                {selectedCharacters.length} / {characters.length} selected
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1">
            {characters.map((char) => {
              const cfg = getRoleConfig(char.role);
              const Icon = cfg.icon;
              const isSelected = selectedCharacters.includes(char.id);
              return (
                <button
                  key={char.id}
                  onClick={() => onToggleCharacter(char.id)}
                  className={`w-full text-left rounded-md border px-5 py-4 flex items-start gap-4 transition-all group ${
                    isSelected
                      ? `${cfg.border} bg-steel-850`
                      : 'border-steel-600 bg-steel-850/60 hover:border-steel-500'
                  }`}
                  style={{ borderOpacity: isSelected ? 0.7 : 0.4 }}
                >
                  {/* Checkbox */}
                  <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-volt border-pulse' : 'border-steel-500 group-hover:border-steel-400'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-steel-100" />}
                  </div>

                  {/* Role icon badge */}
                  <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg bg-steel-800 border ${cfg.border} border-opacity-50 flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-steel-100 font-semibold text-sm">{char.name}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-steel-800 border ${cfg.border} border-opacity-40 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {char.kbRef && <GroundedBadge entityName={char.kbRef} />}
                      {char.existingId && !char.kbRef && (
                        <span
                          title="Reuses an existing character from this project — no duplicate will be created"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/40 text-blue-300 text-[10px] font-medium uppercase tracking-wide shrink-0"
                        >
                          <FolderOpen className="w-3 h-3" />
                          Project
                        </span>
                      )}
                    </div>
                    <p className="text-steel-400 text-xs leading-relaxed mb-1">{char.appearance}</p>
                    <p className="text-steel-400 text-xs leading-relaxed italic">{char.background}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-steel-700">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="px-5 py-2.5 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800 transition-colors disabled:opacity-50"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800 border border-steel-600 hover:border-steel-500 transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>

          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className={`px-6 py-2.5 rounded-md text-sm font-medium transition-all ${
              canSubmit
                ? 'bg-volt hover:brightness-95 text-steel-950 font-semibold shadow-lg shadow-black/30'
                : 'bg-steel-800 text-steel-400 cursor-not-allowed'
            }`}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}
