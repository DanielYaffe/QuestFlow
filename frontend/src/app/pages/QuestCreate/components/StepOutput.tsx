import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardStepIndicator } from './WizardStepIndicator';
import { QuestLoadingScreen } from './QuestLoadingScreen';
import { Objective, Reward, GeneratedCharacter, generateQuestline } from '../../../api/questCreateApi';

interface StepOutputProps {
  story: string;
  genre: string;
  objectives: Objective[];
  selectedObjectives: string[];
  rewards: Reward[];
  selectedRewards: string[];
  characters: GeneratedCharacter[];
  styleId: string;
  templateId: string;
  templateName: string;
  onBack: () => void;
}

export function StepOutput({
  story,
  genre,
  objectives,
  selectedObjectives,
  rewards,
  selectedRewards,
  characters,
  styleId,
  templateId,
  templateName,
  onBack,
}: StepOutputProps) {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const filteredObjectives = objectives.filter((o) => selectedObjectives.includes(o.id));
  const filteredRewards    = rewards.filter((r) => selectedRewards.includes(r.id));

  const handleOpenInBuilder = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const id = await generateQuestline(
        story,
        genre,
        filteredObjectives,
        filteredRewards,
        characters,
        styleId,
        templateId || undefined,
      );
      navigate(`/quest-builder/${id}`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate questline');
      setGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-5">
      <QuestLoadingScreen visible={generating} mode="questline" />
      <WizardStepIndicator currentStep={5} />

      <div className="text-center flex flex-col gap-1">
        <h2 className="text-3xl font-bold text-white">Ready to generate</h2>
        <p className="text-zinc-400">Review your selections, then open in the Quest Builder</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {/* Story summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Story</p>
          <p className="text-zinc-300 text-sm line-clamp-3">{story}</p>
          <p className="text-zinc-500 text-xs mt-1">Genre: {genre} · Characters: {characters.length}</p>
          <p className="text-zinc-500 text-xs mt-1">Template: {templateName || 'No template'}</p>
        </div>

        {/* Objectives */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">
            Objectives ({filteredObjectives.length})
          </p>
          <div className="space-y-2">
            {filteredObjectives.map((o) => (
              <div key={o.id} className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-white text-sm">{o.title}</p>
                  <p className="text-zinc-500 text-xs">{o.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rewards */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">
            Rewards ({filteredRewards.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {filteredRewards.map((r) => (
              <span
                key={r.id}
                className="px-2.5 py-1 rounded-lg border border-amber-600/50 text-xs font-medium text-amber-300 bg-amber-500/10"
              >
                {r.title}
              </span>
            ))}
          </div>
        </div>

        <p className="text-zinc-600 text-xs text-center pb-2">
          Export to Unity, Unreal, Godot and more is available inside the Quest Builder.
        </p>
      </div>

      {generateError && (
        <p className="text-red-400 text-sm text-center">{generateError}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          disabled={generating}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleOpenInBuilder}
          disabled={generating}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          Open in Quest Builder →
        </button>
      </div>
    </div>
  );
}
