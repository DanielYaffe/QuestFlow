import { useEffect, useState } from 'react';
import { Objective, Reward, GeneratedCharacter, generateObjectives, generateCharacters } from '../../api/questCreateApi';
import { ExportTemplate, fetchExportTemplates } from '../../api/exportTemplateApi';
import { StepStory } from './components/StepStory';
import { StepStyle } from './components/StepStyle';
import { StepObjectives } from './components/StepObjectives';
import { StepCharacters } from './components/StepCharacters';
import { StepOutput } from './components/StepOutput';
import { QuestLoadingScreen } from './components/QuestLoadingScreen';

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  storyInput: string;
  selectedGenre: string;
  selectedStyleId: string;
  templates: ExportTemplate[];
  selectedTemplateId: string;
  objectives: Objective[];
  selectedObjectives: string[];
  rewards: Reward[];
  selectedRewards: string[];
  characters: GeneratedCharacter[];
  selectedCharacters: string[];
  isLoadingObjectives: boolean;
  isLoadingCharacters: boolean;
  error: string | null;
}

const DRAFT_STORAGE_KEY = 'questflow:create-wizard-draft';

const DEFAULT_WIZARD_STATE: WizardState = {
  step: 1,
  storyInput: '',
  selectedGenre: 'All',
  selectedStyleId: '',
  templates: [],
  selectedTemplateId: '',
  objectives: [],
  selectedObjectives: [],
  rewards: [],
  selectedRewards: [],
  characters: [],
  selectedCharacters: [],
  isLoadingObjectives: false,
  isLoadingCharacters: false,
  error: null,
};

function loadDraftState(): WizardState {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return DEFAULT_WIZARD_STATE;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return {
      ...DEFAULT_WIZARD_STATE,
      ...parsed,
      templates: [],
      isLoadingObjectives: false,
      isLoadingCharacters: false,
      error: null,
    };
  } catch {
    return DEFAULT_WIZARD_STATE;
  }
}

export function QuestCreate() {
  const [state, setState] = useState<WizardState>(() => loadDraftState());

  useEffect(() => {
    fetchExportTemplates()
      .then((templates) => setState((s) => ({ ...s, templates })))
      .catch(() => setState((s) => ({ ...s, templates: [] })));
  }, []);

  useEffect(() => {
    const { templates, isLoadingObjectives, isLoadingCharacters, error, ...draft } = state;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [state]);

  const handleStorySubmit = () => {
    if (!state.storyInput.trim() || state.isLoadingObjectives) return;
    setState((s) => ({ ...s, step: 2, error: null }));
  };

  const handleStyleSubmit = async () => {
    setState((s) => ({ ...s, isLoadingObjectives: true, error: null }));
    try {
      const result = await generateObjectives(state.storyInput, state.selectedGenre, state.selectedTemplateId || undefined);
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
        selectedCharacters: result.characters.map((c) => c.id),
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
      setState((s) => ({
        ...s,
        isLoadingCharacters: false,
        characters: result.characters,
        selectedCharacters: result.characters.map((c) => c.id),
      }));
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

  const handleSelectAllObjectives = () => {
    setState((s) => ({
      ...s,
      selectedObjectives: s.selectedObjectives.length === s.objectives.length
        ? []
        : s.objectives.map((o) => o.id),
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

  const handleSelectAllRewards = () => {
    setState((s) => ({
      ...s,
      selectedRewards: s.selectedRewards.length === s.rewards.length
        ? []
        : s.rewards.map((r) => r.id),
    }));
  };

  const handleToggleCharacter = (id: string) => {
    setState((s) => ({
      ...s,
      selectedCharacters: s.selectedCharacters.includes(id)
        ? s.selectedCharacters.filter((x) => x !== id)
        : [...s.selectedCharacters, id],
    }));
  };

  const handleSelectAllCharacters = () => {
    setState((s) => ({
      ...s,
      selectedCharacters: s.selectedCharacters.length === s.characters.length
        ? []
        : s.characters.map((c) => c.id),
    }));
  };

  return (
    <div className="h-full overflow-hidden bg-zinc-950">
      <QuestLoadingScreen visible={state.isLoadingObjectives} mode="objectives" />
      <QuestLoadingScreen visible={state.isLoadingCharacters} mode="characters" />
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
            templates={state.templates}
            selectedTemplateId={state.selectedTemplateId}
            isLoading={state.isLoadingObjectives}
            onStoryChange={(value) => setState((s) => ({ ...s, storyInput: value }))}
            onGenreChange={(genre) => setState((s) => ({ ...s, selectedGenre: genre }))}
            onTemplateChange={(templateId) => setState((s) => ({ ...s, selectedTemplateId: templateId }))}
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
            onSelectAllObjectives={handleSelectAllObjectives}
            onSelectAllRewards={handleSelectAllRewards}
            onBack={() => setState((s) => ({ ...s, step: 2 }))}
            onSubmit={handleFetchCharacters}
          />
        )}

        {state.step === 4 && (
          <StepCharacters
            characters={state.characters}
            selectedCharacters={state.selectedCharacters}
            isLoading={state.isLoadingCharacters}
            onToggleCharacter={handleToggleCharacter}
            onSelectAllCharacters={handleSelectAllCharacters}
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
            characters={state.characters.filter((c) => state.selectedCharacters.includes(c.id))}
            styleId={state.selectedStyleId}
            templateId={state.selectedTemplateId}
            templateName={state.templates.find((template) => template._id === state.selectedTemplateId)?.name ?? ''}
            onGenerated={() => localStorage.removeItem(DRAFT_STORAGE_KEY)}
            onBack={() => setState((s) => ({ ...s, step: 4 }))}
          />
        )}
      </div>
    </div>
  );
}
