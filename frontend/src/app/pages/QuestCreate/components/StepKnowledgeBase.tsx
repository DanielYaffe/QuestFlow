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
        <h2 className="text-3xl font-bold text-white">Ground it in your game world</h2>
        <p className="text-zinc-400">
          Optionally attach a game's knowledge base — the AI can reference its real monsters,
          NPCs, items, and maps, and it stays free to invent new ones.
        </p>
      </div>

      {games.length === 0 ? (
        /* No knowledge bases yet — offer to create one or skip */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/games')}
            className="group flex flex-col items-center gap-3 bg-zinc-900 border border-zinc-700 hover:border-purple-500 rounded-2xl p-8 transition-all text-center"
          >
            <div className="w-12 h-12 rounded-full bg-purple-600/10 border border-purple-500/20 flex items-center justify-center group-hover:bg-purple-600/20 transition-colors">
              <Plus className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-white font-medium">Create a game &amp; knowledge base</p>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Upload your monsters, NPCs, items, and maps so quests can reference your real
              world data. Your story draft is saved — you can come back here anytime.
            </p>
          </button>
          <button
            onClick={onSubmit}
            className="group flex flex-col items-center gap-3 bg-zinc-900 border border-zinc-700 hover:border-purple-500 rounded-2xl p-8 transition-all text-center"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-zinc-500 transition-colors">
              <Sparkles className="w-5 h-5 text-zinc-400" />
            </div>
            <p className="text-white font-medium">Continue without</p>
            <p className="text-zinc-500 text-sm leading-relaxed">
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
              className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                selectedGameId === ''
                  ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/20'
                  : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">No game — free generation</p>
                <p className="text-zinc-500 text-xs">The AI invents everything from your story alone.</p>
              </div>
              {selectedGameId === '' && <Check className="w-4 h-4 text-purple-400 shrink-0" />}
            </button>

            {games.map((game) => {
              const isSelected = selectedGameId === game._id;
              return (
                <button
                  key={game._id}
                  onClick={() => onGameChange(game._id)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/20'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-purple-600/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{game.name}</p>
                    <p className="text-zinc-500 text-xs truncate">
                      {game.documentCount ?? 0} document{(game.documentCount ?? 0) !== 1 ? 's' : ''}
                      {game.description ? ` · ${game.description}` : ''}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-purple-400 shrink-0" />}
                </button>
              );
            })}

            <button
              onClick={() => navigate('/games')}
              className="w-full flex items-center gap-2 rounded-xl border border-dashed border-zinc-700 hover:border-purple-500/60 p-3 text-left transition-all text-zinc-500 hover:text-zinc-300"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="text-sm">Create a new game &amp; knowledge base</span>
            </button>
          </div>

          {/* Progression stage — only meaningful with a game attached */}
          {selectedGameId && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <label className="text-zinc-400 text-xs uppercase tracking-wide">Game stage</label>
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
                          ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white border border-transparent shadow-md shadow-purple-600/20'
                          : 'bg-zinc-800/60 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                      }`}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-zinc-500 text-xs">
                Nudges references toward that part of your game's difficulty curve — a preference, not a filter.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <button
              onClick={onBack}
              className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Back
            </button>
            <button
              onClick={onSubmit}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 transition-all"
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
            className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
