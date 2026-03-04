import { useState } from 'react';
import { Objective, Reward, GeneratedCharacter, generateObjectives, generateCharacters } from '../../api/questCreateApi';
import { StepStory } from './components/StepStory';
import { StepStyle } from './components/StepStyle';
import { StepObjectives } from './components/StepObjectives';
import { StepCharacters } from './components/StepCharacters';
import { StepOutput } from './components/StepOutput';

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  storyInput: string;
  selectedGenre: string;
  selectedStyleId: string;
  objectives: Objective[];
  selectedObjectives: string[];
  rewards: Reward[];
  selectedRewards: string[];
  characters: GeneratedCharacter[];
  isLoadingObjectives: boolean;
  isLoadingCharacters: boolean;
  error: string | null;
}

export function QuestCreate() {
  const [state, setState] = useState<WizardState>({
    step: 1,
    storyInput: '',
    selectedGenre: 'All',
    selectedStyleId: '',
    objectives: [],
    selectedObjectives: [],
    rewards: [],
    selectedRewards: [],
    characters: [],
    isLoadingObjectives: false,
    isLoadingCharacters: false,
    error: null,
  });

  const handleStorySubmit = async () => {
    if (!state.storyInput.trim() || state.isLoadingObjectives) return;
    // Move to style selection first; fetch objectives when user confirms style
    setState((s) => ({ ...s, step: 2, error: null }));
  };

  const handleStyleSubmit = async () => {
    setState((s) => ({ ...s, isLoadingObjectives: true, error: null }));
    try {
      const result = await generateObjectives(state.storyInput, state.selectedGenre);
      setState((s) => ({
        ...s,
        isLoadingObjectives: false,
        objectives: result.objectives,
        rewards: result.rewards,
        selectedObjectives: [],
        selectedRewards: [],
        step: 3,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoadingObjectives: false,
        error: err instanceof Error ? err.message : 'Failed to generate objectives',
      }));
    }
  };

  const handleFetchCharacters = async () => {
    setState((s) => ({ ...s, isLoadingCharacters: true, error: null }));
    try {
      const result = await generateCharacters(state.storyInput, state.selectedGenre);
      setState((s) => ({
        ...s,
        isLoadingCharacters: false,
        characters: result.characters,
        step: 4,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoadingCharacters: false,
        error: err instanceof Error ? err.message : 'Failed to generate characters',
      }));
    }
  };

  const handleRegenerateCharacters = async () => {
    setState((s) => ({ ...s, isLoadingCharacters: true, error: null }));
    try {
      const result = await generateCharacters(state.storyInput, state.selectedGenre);
      setState((s) => ({ ...s, isLoadingCharacters: false, characters: result.characters }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoadingCharacters: false,
        error: err instanceof Error ? err.message : 'Failed to regenerate characters',
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
            isLoading={state.isLoadingObjectives}
            onStoryChange={(value) => setState((s) => ({ ...s, storyInput: value }))}
            onGenreChange={(genre) => setState((s) => ({ ...s, selectedGenre: genre }))}
            onSubmit={handleStorySubmit}
          />
        )}

        {state.step === 2 && (
          <StepStyle
            selectedStyleId={state.selectedStyleId}
            onSelect={(id) => setState((s) => ({ ...s, selectedStyleId: id }))}
            onBack={() => setState((s) => ({ ...s, step: 1 }))}
            onSubmit={handleStyleSubmit}
          />
        )}

        {state.step === 3 && (
          <StepObjectives
            objectives={state.objectives}
            rewards={state.rewards}
            selectedObjectives={state.selectedObjectives}
            selectedRewards={state.selectedRewards}
            onToggleObjective={handleToggleObjective}
            onToggleReward={handleToggleReward}
            onBack={() => setState((s) => ({ ...s, step: 2 }))}
            onSubmit={handleFetchCharacters}
          />
        )}

        {state.step === 4 && (
          <StepCharacters
            characters={state.characters}
            isLoading={state.isLoadingCharacters}
            onBack={() => setState((s) => ({ ...s, step: 3 }))}
            onSubmit={() => setState((s) => ({ ...s, step: 5 }))}
            onRegenerate={handleRegenerateCharacters}
          />
        )}

        {state.step === 5 && (
          <StepOutput
            story={state.storyInput}
            genre={state.selectedGenre}
            objectives={state.objectives}
            selectedObjectives={state.selectedObjectives}
            rewards={state.rewards}
            selectedRewards={state.selectedRewards}
            characters={state.characters}
            styleId={state.selectedStyleId}
            onBack={() => setState((s) => ({ ...s, step: 4 }))}
          />
        )}
      </div>
    </div>
  );
}
