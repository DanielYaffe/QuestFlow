import { useNavigate } from 'react-router-dom';
import { BookOpen, Check, Plus, Sparkles } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { Game } from '../../../api/gameApi';
import { GameStage } from '../../../api/questCreateApi';

const STAGES: { value: '' | GameStage; label: string; hint: string }[] = [
  { value: '',      label: 'Any stage',  hint: 'No difficulty bias' },
  { value: 'early', label: 'Early game', hint: 'Lean toward low-difficulty references' },
  { value: 'mid',   label: 'Mid game',   hint: 'Lean toward mid-difficulty references' },
  { value: 'late',  label: 'Late game',  hint: 'Lean toward high-difficulty references' },
];

interface StepKnowledgeBaseProps {
  games: Game[];
  selectedGameId: string;
  selectedStage: '' | GameStage;
  onGameChange: (gameId: string) => void;
  onStageChange: (stage: '' | GameStage) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function StepKnowledgeBase({
  games,
  selectedGameId,
  selectedStage,
  onGameChange,
  onStageChange,
  onBack,
  onSubmit,
}: StepKnowledgeBaseProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-8">
      <WizardStepIndicator currentStep={2} />

      {/* Heading */}
      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-steel-100">Ground it in your game world</h2>
        <p className="text-steel-400">
          Optionally attach a game's knowledge base — the AI can reference its real monsters,
          NPCs, items, and maps, and it stays free to invent new ones.
        </p>
      </div>

      {games.length === 0 ? (
        /* No knowledge bases yet — offer to create one or skip */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/games')}
            className="group flex flex-col items-center gap-3 bg-steel-850 border border-steel-600 hover:border-pulse rounded-md p-8 transition-all text-center"
          >
            <div className="w-12 h-12 rounded-full bg-steel-800 border border-pulse/20 flex items-center justify-center group-hover:brightness-95/20 transition-colors">
              <Plus className="w-5 h-5 text-pulse" />
            </div>
            <p className="text-steel-100 font-medium">Create a game &amp; knowledge base</p>
            <p className="text-steel-400 text-sm leading-relaxed">
              Upload your monsters, NPCs, items, and maps so quests can reference your real
              world data. Your story draft is saved — you can come back here anytime.
            </p>
          </button>
          <button
            onClick={onSubmit}
            className="group flex flex-col items-center gap-3 bg-steel-850 border border-steel-600 hover:border-pulse rounded-md p-8 transition-all text-center"
          >
            <div className="w-12 h-12 rounded-full bg-steel-800 border border-steel-600 flex items-center justify-center group-hover:border-steel-400 transition-colors">
              <Sparkles className="w-5 h-5 text-steel-400" />
            </div>
            <p className="text-steel-100 font-medium">Continue without</p>
            <p className="text-steel-400 text-sm leading-relaxed">
              Free generation — the AI invents everything from your story alone.
            </p>
          </button>
        </div>
      ) : (
        <>
          {/* Game cards */}
          <div className="space-y-2">
            <button
              onClick={() => onGameChange('')}
              className={`w-full flex items-center gap-3 rounded-md border p-4 text-left transition-all ${
                selectedGameId === ''
                  ? 'border-pulse bg-steel-800 ring-2 ring-pulse/20'
                  : 'border-steel-600 bg-steel-850 hover:border-steel-400'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-steel-800 border border-steel-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-steel-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-steel-100 text-sm font-medium">No game — free generation</p>
                <p className="text-steel-400 text-xs">The AI invents everything from your story alone.</p>
              </div>
              {selectedGameId === '' && <Check className="w-4 h-4 text-pulse shrink-0" />}
            </button>

            {games.map((game) => {
              const isSelected = selectedGameId === game._id;
              return (
                <button
                  key={game._id}
                  onClick={() => onGameChange(game._id)}
                  className={`w-full flex items-center gap-3 rounded-md border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-pulse bg-steel-800 ring-2 ring-pulse/20'
                      : 'border-steel-600 bg-steel-850 hover:border-steel-400'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-steel-800 border border-pulse/20 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-steel-100 text-sm font-medium truncate">{game.name}</p>
                    <p className="text-steel-400 text-xs truncate">
                      {game.documentCount ?? 0} document{(game.documentCount ?? 0) !== 1 ? 's' : ''}
                      {game.description ? ` · ${game.description}` : ''}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-pulse shrink-0" />}
                </button>
              );
            })}

            <button
              onClick={() => navigate('/games')}
              className="w-full flex items-center gap-2 rounded-md border border-dashed border-steel-600 hover:border-pulse/60 p-3 text-left transition-all text-steel-400 hover:text-steel-200"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="text-sm">Create a new game &amp; knowledge base</span>
            </button>
          </div>

          {/* Progression stage — only meaningful with a game attached */}
          {selectedGameId && (
            <div className="bg-steel-850 border border-steel-700 rounded-md p-4 space-y-2">
              <label className="text-steel-400 text-xs uppercase tracking-wide">Game stage</label>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((stage) => {
                  const isActive = selectedStage === stage.value;
                  return (
                    <button
                      key={stage.value}
                      onClick={() => onStageChange(stage.value)}
                      title={stage.hint}
                      className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                        isActive
                          ? 'bg-volt text-steel-950 font-semibold border border-transparent '
                          : 'bg-steel-800/60 border border-steel-600 text-steel-400 hover:text-steel-100 hover:border-steel-400'
                      }`}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-steel-400 text-xs">
                Nudges references toward that part of your game's difficulty curve — a preference, not a filter.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-steel-700">
            <button
              onClick={onBack}
              className="px-5 py-2.5 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800 transition-colors"
            >
              Back
            </button>
            <button
              onClick={onSubmit}
              className="px-6 py-2.5 rounded-md text-sm bg-volt hover:brightness-95 text-steel-950 font-semibold transition-all"
            >
              Continue →
            </button>
          </div>
        </>
      )}

      {/* Back link for the empty state (cards handle forward) */}
      {games.length === 0 && (
        <div className="flex justify-center">
          <button
            onClick={onBack}
            className="px-5 py-2.5 rounded-md text-sm text-steel-400 hover:text-steel-100 hover:bg-steel-800 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
