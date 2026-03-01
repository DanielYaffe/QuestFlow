import React from 'react';
import { Check, Target, Gift, Gem, Star, Coins } from 'lucide-react';
import { Objective, Reward } from '../../../api/questCreateApi';
import { WizardStepIndicator } from './WizardStepIndicator';

interface StepObjectivesProps {
  objectives: Objective[];
  rewards: Reward[];
  selectedObjectives: string[];
  selectedRewards: string[];
  onToggleObjective: (id: string) => void;
  onToggleReward: (id: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

const rarityConfig = {
  common: { label: 'Common', color: 'text-zinc-400', icon: Coins },
  rare: { label: 'Rare', color: 'text-blue-400', icon: Star },
  epic: { label: 'Epic', color: 'text-purple-400', icon: Gem },
};

export function StepObjectives({
  objectives,
  rewards,
  selectedObjectives,
  selectedRewards,
  onToggleObjective,
  onToggleReward,
  onBack,
  onSubmit,
}: StepObjectivesProps) {
  const canSubmit = selectedObjectives.length > 0;

  return (
    <div className="h-full flex flex-col gap-6">
      <WizardStepIndicator currentStep={2} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-white">Shape your questline</h2>
        <p className="text-zinc-400">Select the objectives and rewards for your quest</p>
      </div>

      {/* Two-column grid — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-6 pr-1">
        {/* Objectives */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Objectives</h3>
            {selectedObjectives.length > 0 && (
              <span className="ml-auto text-xs text-purple-400 bg-purple-500/10 border border-purple-500/30 rounded-full px-2 py-0.5">
                {selectedObjectives.length} selected
              </span>
            )}
          </div>
          {objectives.map((obj) => {
            const isSelected = selectedObjectives.includes(obj.id);
            return (
              <button
                key={obj.id}
                onClick={() => onToggleObjective(obj.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-all group ${
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div
                    className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                      isSelected ? 'bg-purple-600 border-purple-600' : 'border-zinc-600 group-hover:border-zinc-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={`text-sm font-medium leading-snug ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                      {obj.title}
                    </span>
                    <span className="text-xs text-zinc-500 leading-snug">{obj.description}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Rewards */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Rewards</h3>
            {selectedRewards.length > 0 && (
              <span className="ml-auto text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                {selectedRewards.length} selected
              </span>
            )}
          </div>
          {rewards.map((rew) => {
            const isSelected = selectedRewards.includes(rew.id);
            const rarity = rarityConfig[rew.rarity];
            const RarityIcon = rarity.icon;
            return (
              <button
                key={rew.id}
                onClick={() => onToggleReward(rew.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-all group ${
                  isSelected
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                      isSelected ? 'bg-amber-500 border-amber-500' : 'border-zinc-600 group-hover:border-zinc-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                    {rew.title}
                  </span>
                  <div className={`flex items-center gap-1 text-xs ${rarity.color}`}>
                    <RarityIcon className="w-3 h-3" />
                    <span>{rarity.label}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
            canSubmit
              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Generate Quest →
        </button>
      </div>
    </div>
  );
}
