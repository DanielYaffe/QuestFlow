import React from 'react';
import { CheckCircle2, Circle, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Quest } from '../../types/quest';

const questsData: Quest[] = [
  { id: 1, name: 'A Fresh Start', description: "You've just arrived in the village with nothing but determination. The world feels big, and every hero starts somewhere. Prove your commitment by spending time in the world and learning its ways.", requiredQuestId: null },
  { id: 2, name: 'Coins of Effort', description: 'The villagers say true growth comes from hard work. As you adventure, you begin to understand the value of every meso earned. Show that your efforts are more than luck.', requiredQuestId: 1 },
  { id: 3, name: 'Patience of a Warrior', description: 'Battles are not won in a single moment. Strength is built through time and persistence. The elders are watching to see if you endure.', requiredQuestId: 2 },
  { id: 4, name: 'The Rising Reputation', description: 'Word of your dedication begins to spread. Merchants whisper about your growing fortune and discipline. The village starts to recognize your name.', requiredQuestId: 3 },
  { id: 5, name: 'Proof of Dedication', description: 'Only those who commit fully earn true respect. The final trial is not about strength, but about consistency and perseverance. Show that you belong among the promising heroes.', requiredQuestId: 4 },
];

const completedQuests = [1, 2];
const activeQuest = 3;

function getQuestStatus(questId: number) {
  if (completedQuests.includes(questId)) return 'completed';
  if (questId === activeQuest) return 'active';
  return 'locked';
}

export function QuestStoryView() {
  const navigate = useNavigate();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-white text-2xl mb-1">Hero's Journey</h2>
          <p className="text-zinc-400 text-sm">Your path to becoming a legendary warrior</p>
        </div>
        <div className="text-right">
          <div className="text-zinc-400 text-sm mb-1">Progress</div>
          <div className="text-white text-2xl">{completedQuests.length}/{questsData.length}</div>
        </div>
      </div>

      <div className="space-y-4">
        {questsData.map((quest, index) => {
          const status = getQuestStatus(quest.id);
          const isCompleted = status === 'completed';
          const isActive = status === 'active';
          const isLocked = status === 'locked';

          return (
            <div key={quest.id} className="relative">
              {index < questsData.length - 1 && (
                <div className="absolute left-5 top-12 w-0.5 h-16 bg-zinc-800" />
              )}
              <div
                className={`relative flex gap-4 p-4 rounded-lg border-2 transition-all ${
                  isCompleted
                    ? 'bg-green-950/30 border-green-800 hover:bg-green-950/50'
                    : isActive
                    ? 'bg-purple-950/30 border-purple-600 shadow-lg shadow-purple-900/50 hover:bg-purple-950/50'
                    : 'bg-zinc-900/50 border-zinc-800 opacity-60'
                }`}
              >
                <div className="flex-shrink-0 mt-1">
                  {isCompleted ? (
                    <CheckCircle2 className="w-10 h-10 text-green-400" />
                  ) : isActive ? (
                    <Circle className="w-10 h-10 text-purple-400 animate-pulse" />
                  ) : (
                    <Lock className="w-10 h-10 text-zinc-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3
                      className={`text-lg ${
                        isCompleted ? 'text-green-400' : isActive ? 'text-purple-400' : 'text-zinc-500'
                      }`}
                    >
                      {quest.name}
                    </h3>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        isCompleted
                          ? 'bg-green-900/50 text-green-400'
                          : isActive
                          ? 'bg-purple-900/50 text-purple-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {isCompleted ? 'Completed' : isActive ? 'Active' : 'Locked'}
                    </span>
                  </div>
                  <p className={`text-sm ${isLocked ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {quest.description}
                  </p>
                  {isActive && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                        <span>In Progress</span>
                        <span>60%</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div className="bg-purple-600 h-2 rounded-full" style={{ width: '60%' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-purple-950/30 border border-purple-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-purple-400 mb-1">Continue Your Journey</h4>
            <p className="text-zinc-400 text-sm">Build your quest in the Quest Builder</p>
          </div>
          <button
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
            onClick={() => navigate('/quest-builder')}
          >
            Open Builder
          </button>
        </div>
      </div>
    </div>
  );
}
