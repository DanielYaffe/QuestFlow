import React, { useState, useEffect, useRef } from 'react';
import { Users, BookOpen, ScrollText, Gift, ChevronDown, ChevronRight, Plus, Trash2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchCharacters,
  fetchChapters,
  fetchQuestSummaries,
  fetchRewards,
  Character,
  Chapter,
  QuestSummary,
  Reward,
} from '../../../api/projectSidebarApi';
import { fetchQuestlineMeta } from '../../../api/questBuilderApi';
import { CharacterDetailPanel } from './CharacterDetailPanel';
import { RewardDetailPanel } from './RewardDetailPanel';

type Tab = 'characters' | 'chapters' | 'quests' | 'rewards';

const variantColor: Record<string, string> = {
  story: 'bg-purple-500',
  combat: 'bg-red-500',
  dialogue: 'bg-blue-500',
  treasure: 'bg-amber-500',
};

interface ProjectSidebarProps {
  questlineId: string;
  isOpen: boolean;
}

export function ProjectSidebar({ questlineId, isOpen }: ProjectSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('characters');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questSummaries, setQuestSummaries] = useState<QuestSummary[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [questStyleId, setQuestStyleId] = useState('');

  // Refs so tab switching can trigger the panel's own close guard
  const characterPanelCloseRef = useRef<(() => void) | null>(null);
  const rewardPanelCloseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchCharacters(questlineId).then(setCharacters).catch(console.error);
    fetchChapters(questlineId).then(setChapters).catch(console.error);
    fetchQuestSummaries(questlineId).then(setQuestSummaries).catch(console.error);
    fetchRewards(questlineId).then(setRewards).catch(console.error);
    fetchQuestlineMeta(questlineId).then((m) => setQuestStyleId(m.styleId ?? '')).catch(console.error);
  }, [questlineId]);

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) ?? null;
  const selectedReward = rewards.find((r) => r.id === selectedRewardId) ?? null;

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // When switching tabs, ask the open panel to close (it will show the unsaved dialog if dirty)
  const handleTabClick = (tab: Tab) => {
    if (tab === activeTab) return;
    if (selectedCharacterId && characterPanelCloseRef.current) {
      characterPanelCloseRef.current();
      // The panel will call onClose (which clears selectedCharacterId) only after save/discard
      // We set a deferred tab switch after the panel closes itself
    } else if (selectedRewardId && rewardPanelCloseRef.current) {
      rewardPanelCloseRef.current();
    } else {
      setActiveTab(tab);
    }
    // Always switch the tab — if the panel blocks via dialog the old panel stays visible
    // until the user resolves it; the tab header will update immediately for responsiveness
    setActiveTab(tab);
  };

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'characters', icon: <Users className="w-4 h-4" />, label: 'Characters' },
    { id: 'rewards',    icon: <Gift className="w-4 h-4" />,  label: 'Rewards' },
    { id: 'chapters',   icon: <BookOpen className="w-4 h-4" />, label: 'Chapters' },
    { id: 'quests',     icon: <ScrollText className="w-4 h-4" />, label: 'Quests' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Main sidebar panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="absolute left-0 top-0 h-full flex flex-row bg-zinc-900 border-r border-zinc-800"
            style={{ width: '260px', zIndex: 20 }}
          >
            {/* Tab strip */}
            <div className="w-10 flex flex-col items-center py-3 gap-1 border-r border-zinc-800 flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  title={tab.label}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'text-purple-400 bg-purple-500/10'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {tab.icon}
                </button>
              ))}
            </div>

            {/* Content panel */}
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Tab header */}
              <div className="px-3 py-3 border-b border-zinc-800 flex-shrink-0">
                <p className="text-white text-sm font-medium capitalize">{activeTab}</p>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                {/* ── Characters ── */}
                {activeTab === 'characters' && (
                  <div className="py-1">
                    {characters.map((char) => (
                      <div
                        key={char.id}
                        onClick={() =>
                          setSelectedCharacterId(selectedCharacterId === char.id ? null : char.id)
                        }
                        className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                          selectedCharacterId === char.id
                            ? 'bg-purple-500/10 border-l-2 border-purple-500'
                            : 'border-l-2 border-transparent hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {char.imageUrl ? (
                            <img src={char.imageUrl} alt={char.name} className="w-7 h-7 rounded-md object-cover flex-shrink-0 bg-zinc-800" />
                          ) : (
                            <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex-shrink-0" />
                          )}
                          <span className={`text-sm truncate ${selectedCharacterId === char.id ? 'text-purple-300' : 'text-zinc-300'}`}>
                            {char.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"
                            title="Duplicate"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button className="w-full px-3 py-2 text-left text-sm text-purple-400 hover:text-purple-300 hover:bg-zinc-800 transition-colors">
                      + Add New Character
                    </button>
                  </div>
                )}

                {/* ── Rewards ── */}
                {activeTab === 'rewards' && (
                  <div className="py-1">
                    {rewards.map((reward) => (
                      <div
                        key={reward.id}
                        onClick={() =>
                          setSelectedRewardId(selectedRewardId === reward.id ? null : reward.id)
                        }
                        className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                          selectedRewardId === reward.id
                            ? 'bg-purple-500/10 border-l-2 border-purple-500'
                            : 'border-l-2 border-transparent hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {reward.imageUrl ? (
                            <img src={reward.imageUrl} alt={reward.title} className="w-7 h-7 rounded-md object-cover flex-shrink-0 bg-zinc-800" />
                          ) : (
                            <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex-shrink-0" />
                          )}
                          <span className={`text-sm truncate ${selectedRewardId === reward.id ? 'text-purple-300' : 'text-zinc-300'}`}>
                            {reward.title}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 capitalize ${
                            reward.rarity === 'epic' ? 'text-purple-300 bg-purple-500/10 border-purple-500/40' :
                            reward.rarity === 'rare' ? 'text-blue-300 bg-blue-500/10 border-blue-500/40' :
                            'text-zinc-400 bg-zinc-700/50 border-zinc-600'
                          }`}>
                            {reward.rarity}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button className="w-full px-3 py-2 text-left text-sm text-purple-400 hover:text-purple-300 hover:bg-zinc-800 transition-colors">
                      + Add New Reward
                    </button>
                  </div>
                )}

                {/* ── Chapters ── */}
                {activeTab === 'chapters' && (
                  <div className="py-1">
                    {chapters.map((chapter) => {
                      const isExpanded = expandedChapters.has(chapter.id);
                      return (
                        <div key={chapter.id}>
                          <button
                            onClick={() => toggleChapter(chapter.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                            )}
                            <span className="text-zinc-200 text-sm truncate">{chapter.title}</span>
                          </button>
                          {isExpanded &&
                            chapter.scenes.map((scene) => (
                              <div
                                key={scene.id}
                                className="group flex items-center justify-between pl-8 pr-3 py-1.5 hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                <span className="text-zinc-400 text-xs truncate">{scene.title}</span>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-purple-400 transition-colors flex-shrink-0"
                                  title="Continue Story"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Quests ── */}
                {activeTab === 'quests' && (
                  <div className="py-1">
                    {questSummaries.map((quest) => (
                      <div
                        key={quest.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${variantColor[quest.variant]}`} />
                        <span className="text-zinc-300 text-sm truncate">{quest.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Character detail panel — renders beside the sidebar */}
          <AnimatePresence>
            {selectedCharacter && (
              <CharacterDetailPanel
                character={selectedCharacter}
                questSummaries={questSummaries}
                questlineId={questlineId}
                questStyleId={questStyleId}
                registerCloseHandler={(fn) => { characterPanelCloseRef.current = fn; }}
                onSaved={(patch) =>
                  setCharacters((prev) =>
                    prev.map((c) => c.id === selectedCharacter.id ? { ...c, ...patch } : c)
                  )
                }
                onImageUpdated={(url) =>
                  setCharacters((prev) =>
                    prev.map((c) => c.id === selectedCharacter.id ? { ...c, imageUrl: url } : c)
                  )
                }
                onClose={() => { setSelectedCharacterId(null); characterPanelCloseRef.current = null; }}
              />
            )}
          </AnimatePresence>

          {/* Reward detail panel — renders beside the sidebar */}
          <AnimatePresence>
            {selectedReward && (
              <RewardDetailPanel
                reward={selectedReward}
                questlineId={questlineId}
                questStyleId={questStyleId}
                registerCloseHandler={(fn) => { rewardPanelCloseRef.current = fn; }}
                onSaved={(patch) =>
                  setRewards((prev) =>
                    prev.map((r) => r.id === selectedReward.id ? { ...r, ...patch } : r)
                  )
                }
                onImageUpdated={(url) =>
                  setRewards((prev) =>
                    prev.map((r) => r.id === selectedReward.id ? { ...r, imageUrl: url } : r)
                  )
                }
                onClose={() => { setSelectedRewardId(null); rewardPanelCloseRef.current = null; }}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
