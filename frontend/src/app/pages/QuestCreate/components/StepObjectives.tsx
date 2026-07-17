import React from 'react';
import { Check, Target, Gift } from 'lucide-react';
import { Objective, Reward } from '../../../api/questCreateApi';
import { WizardStepIndicator } from './WizardStepIndicator';
import { GroundedBadge } from '../../../components/shared/GroundedBadge';

interface StepObjectivesProps {
  objectives: Objective[];
  rewards: Reward[];
  selectedObjectives: string[];
  selectedRewards: string[];
  onToggleObjective: (id: string) => void;
  onToggleReward: (id: string) => void;
  onSelectAllObjectives: () => void;
  onSelectAllRewards: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function StepObjectives({
  objectives,
  rewards,
  selectedObjectives,
  selectedRewards,
  onToggleObjective,
  onToggleReward,
  onSelectAllObjectives,
  onSelectAllRewards,
  onBack,
  onSubmit,
}: StepObjectivesProps) {
  const allObjectivesSelected = objectives.length > 0 && selectedObjectives.length === objectives.length;
  const allRewardsSelected = rewards.length > 0 && selectedRewards.length === rewards.length;
  const canSubmit = selectedObjectives.length > 0;

  return (
    <div className="h-full flex flex-col gap-6">
      <WizardStepIndicator currentStep={4} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-steel-100">Shape your questline</h2>
        <p className="text-steel-400">Select the objectives and rewards for your quest</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-6 pr-1">
        {/* Objectives */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-pulse" />
            <h3 className="text-sm font-semibold text-steel-200 uppercase tracking-wider">Objectives</h3>
            <button
              onClick={onSelectAllObjectives}
              className="ml-auto text-xs text-pulse hover:text-pulse transition-colors"
            >
              {allObjectivesSelected ? 'Deselect all' : 'Select all'}
            </button>
            {selectedObjectives.length > 0 && (
              <span className="text-xs text-pulse bg-steel-800 border border-steel-600 rounded-full px-2 py-0.5">
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
                className={`w-full text-left rounded-md border px-4 py-3 transition-all group ${
                  isSelected
                    ? 'border-pulse bg-steel-800'
                    : 'border-steel-600 bg-steel-850 hover:border-steel-400'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                    isSelected ? 'bg-volt border-pulse' : 'border-steel-500 group-hover:border-steel-400'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-steel-100" />}
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={`text-sm font-medium leading-snug ${isSelected ? 'text-steel-100' : 'text-steel-200'}`}>
                      {obj.title}
                    </span>
                    <span className="text-xs text-steel-400 leading-snug">{obj.description}</span>
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
            <h3 className="text-sm font-semibold text-steel-200 uppercase tracking-wider">Rewards</h3>
            <button
              onClick={onSelectAllRewards}
              className="ml-auto text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              {allRewardsSelected ? 'Deselect all' : 'Select all'}
            </button>
            {selectedRewards.length > 0 && (
              <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                {selectedRewards.length} selected
              </span>
            )}
          </div>
          {rewards.map((rew) => {
            const isSelected = selectedRewards.includes(rew.id);
            return (
              <button
                key={rew.id}
                onClick={() => onToggleReward(rew.id)}
                className={`w-full text-left rounded-md border px-4 py-3 transition-all group ${
                  isSelected
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-steel-600 bg-steel-850 hover:border-steel-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                    isSelected ? 'bg-amber-500 border-amber-500' : 'border-steel-500 group-hover:border-steel-400'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-steel-100" />}
                  </div>
                  <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-steel-100' : 'text-steel-200'}`}>
                    {rew.title}
                  </span>
                  {rew.kbRef && <GroundedBadge entityName={rew.kbRef} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-steel-700">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800 transition-colors"
        >
          Back
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
          Generate Quest →
        </button>
      </div>
    </div>
  );
}
