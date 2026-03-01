import React, { useState } from 'react';
import { Objective, Reward, generateObjectives } from '../../api/questCreateApi';
import { StepStory } from './components/StepStory';
import { StepObjectives } from './components/StepObjectives';
import { StepOutput } from './components/StepOutput';

interface WizardState {
  step: 1 | 2 | 3;
  storyInput: string;
  selectedGenre: string;
  objectives: Objective[];
  selectedObjectives: string[];
  rewards: Reward[];
  selectedRewards: string[];
  isLoading: boolean;
  error: string | null;
}

export function QuestCreate() {
  const [state, setState] = useState<WizardState>({
    step: 1,
    storyInput: '',
    selectedGenre: 'All',
    objectives: [],
    selectedObjectives: [],
    rewards: [],
    selectedRewards: [],
    isLoading: false,
    error: null,
  });

  const handleStorySubmit = async () => {
    if (!state.storyInput.trim() || state.isLoading) return;

    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const result = await generateObjectives(state.storyInput, state.selectedGenre);
      setState((s) => ({
        ...s,
        isLoading: false,
        objectives: result.objectives,
        rewards: result.rewards,
        selectedObjectives: [],
        selectedRewards: [],
        step: 2,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to generate objectives',
      }));
    }
  };

  const handleToggleObjective = (id: string) => {
    setState((s) => ({
      ...s,
      selectedObjectives: s.selectedObjectives.includes(id)
        ? s.selectedObjectives.filter((x) => x !== id)
        : [...s.selectedObjectives, id],
    }));
  };

  const handleToggleReward = (id: string) => {
    setState((s) => ({
      ...s,
      selectedRewards: s.selectedRewards.includes(id)
        ? s.selectedRewards.filter((x) => x !== id)
        : [...s.selectedRewards, id],
    }));
  };

  return (
    <div className="h-full overflow-hidden bg-zinc-950">
      <div className="max-w-3xl mx-auto px-6 py-16 h-full flex flex-col">
        {state.error && (
          <div className="mb-6 px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-xl text-red-400 text-sm">
            {state.error}
          </div>
        )}

        {state.step === 1 && (
          <StepStory
            storyInput={state.storyInput}
            selectedGenre={state.selectedGenre}
            isLoading={state.isLoading}
            onStoryChange={(value) => setState((s) => ({ ...s, storyInput: value }))}
            onGenreChange={(genre) => setState((s) => ({ ...s, selectedGenre: genre }))}
            onSubmit={handleStorySubmit}
          />
        )}

        {state.step === 2 && (
          <StepObjectives
            objectives={state.objectives}
            rewards={state.rewards}
            selectedObjectives={state.selectedObjectives}
            selectedRewards={state.selectedRewards}
            onToggleObjective={handleToggleObjective}
            onToggleReward={handleToggleReward}
            onBack={() => setState((s) => ({ ...s, step: 1 }))}
            onSubmit={() => setState((s) => ({ ...s, step: 3 }))}
          />
        )}

        {state.step === 3 && (
          <StepOutput
            story={state.storyInput}
            genre={state.selectedGenre}
            objectives={state.objectives}
            selectedObjectives={state.selectedObjectives}
            rewards={state.rewards}
            selectedRewards={state.selectedRewards}
            onBack={() => setState((s) => ({ ...s, step: 2 }))}
          />
        )}
      </div>
    </div>
  );
}
