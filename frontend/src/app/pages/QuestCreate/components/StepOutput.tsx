import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { QuestLoadingScreen } from './QuestLoadingScreen';
import { Objective, Reward, GeneratedCharacter, KbOptions, generateQuestline } from '../../../api/questCreateApi';

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
  kbOptions?: KbOptions;
  gameName?: string;
  onGenerated?: () => void;
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
  kbOptions,
  gameName,
  onGenerated,
  onBack,
}: StepOutputProps) {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const filteredObjectives = objectives.filter((o) => selectedObjectives.includes(o.id));
  const filteredRewards    = rewards.filter((r) => selectedRewards.includes(r.id));
  const groundedCount      = characters.filter((c) => c.kbRef).length
    + filteredRewards.filter((r) => r.kbRef).length;

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
        kbOptions,
      );
      onGenerated?.();
      navigate(`/quest-builder/${id}`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate questline');
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <QuestLoadingScreen visible={generating} mode="questline" />
      <WizardStepIndicator currentStep={6} />

      <div className="text-center flex flex-col gap-1">
        <h2 className="text-3xl font-bold text-steel-100">Ready to generate</h2>
        <p className="text-steel-400">Review your selections, then open in the Quest Builder</p>
      </div>

      <div className="space-y-4">
        {/* Story summary */}
        <div className="bg-steel-850 border border-steel-700 rounded-md p-4">
          <p className="text-steel-400 text-xs uppercase tracking-wider mb-2">Story</p>
          <p className="text-steel-200 text-sm line-clamp-3">{story}</p>
          <p className="text-steel-400 text-xs mt-1">Genre: {genre} · Characters: {characters.length}</p>
          <p className="text-steel-400 text-xs mt-1">Template: {templateName || 'No template'}</p>
          <p className="text-steel-400 text-xs mt-1">
            Knowledge base: {kbOptions?.gameId && gameName ? `${gameName}${kbOptions.progression ? ` (${kbOptions.progression} game)` : ''}` : 'None (free generation)'}
            {groundedCount > 0 && (
              <span className="text-emerald-400"> · {groundedCount} grounded reference{groundedCount !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>

        {/* Objectives */}
        <div className="bg-steel-850 border border-steel-700 rounded-md p-4">
          <p className="text-steel-400 text-xs uppercase tracking-wider mb-3">
            Objectives ({filteredObjectives.length})
          </p>
          <div className="space-y-2">
            {filteredObjectives.map((o) => (
              <div key={o.id} className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-pulse mt-1.5 shrink-0" />
                <div>
                  <p className="text-steel-100 text-sm">{o.title}</p>
                  <p className="text-steel-400 text-xs">{o.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rewards */}
        <div className="bg-steel-850 border border-steel-700 rounded-md p-4">
          <p className="text-steel-400 text-xs uppercase tracking-wider mb-3">
            Rewards ({filteredRewards.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {filteredRewards.map((r) => (
              <span
                key={r.id}
                title={r.kbRef ? `From your knowledge base: ${r.kbRef}` : undefined}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${
                  r.kbRef
                    ? 'border-emerald-600/50 text-emerald-300 bg-emerald-500/10'
                    : 'border-amber-600/50 text-amber-300 bg-amber-500/10'
                }`}
              >
                {r.kbRef && <BookOpen className="w-3 h-3" />}
                {r.title}
              </span>
            ))}
          </div>
        </div>

        <p className="text-steel-500 text-xs text-center pb-2">
          More export formats and options are available inside the Quest Builder.
        </p>
      </div>

      {generateError && (
        <p className="text-red-400 text-sm text-center">{generateError}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-steel-700">
        <button
          onClick={onBack}
          disabled={generating}
          className="px-5 py-2.5 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleOpenInBuilder}
          disabled={generating}
          className="flex items-center gap-2 px-6 py-2.5 rounded-md text-sm bg-volt hover:brightness-95 text-steel-950 font-semibold transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          Open in Quest Builder →
        </button>
      </div>
    </div>
  );
}
