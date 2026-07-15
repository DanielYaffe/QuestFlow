import React, { useState, useEffect, useRef } from 'react';
import { Users, ScrollText, Gift, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchCharacters,
  fetchQuestSummaries,
  fetchRewards,
  deleteReward,
  getRewardUsage,
  Character,
  QuestSummary,
  Reward,
} from '../../../api/projectSidebarApi';
import { deleteCharacter, getCharacterUsage } from '../../../api/characterApi';
import { fetchQuestlineMeta } from '../../../api/questBuilderApi';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { GroundedBadge } from '../../../components/shared/GroundedBadge';
import { CharacterDetailPanel } from './CharacterDetailPanel';
import { RewardDetailPanel } from './RewardDetailPanel';

type Tab = 'characters' | 'rewards' | 'quests';

const variantColor: Record<string, string> = {
  story: 'bg-purple-500',
  combat: 'bg-red-500',
  dialogue: 'bg-blue-500',
  treasure: 'bg-amber-500',
};

interface ProjectSidebarProps {
  questlineId: string;
  isOpen: boolean;
  onQuestClick: (nodeId: string) => void;
  onCharacterDeleted?: (id: string) => void;
  onRewardDeleted?: (id: string) => void;
}

export function ProjectSidebar({ questlineId, isOpen, onQuestClick, onCharacterDeleted, onRewardDeleted }: ProjectSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('characters');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [questSummaries, setQuestSummaries] = useState<QuestSummary[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [questStyleId, setQuestStyleId] = useState('');

  // Pending deletions (with dependent-node warning)
  const [pendingCharDelete, setPendingCharDelete] = useState<Character | null>(null);
  const [charDeleteUsage, setCharDeleteUsage] = useState<{ nodeCount: number; questlineCount: number } | null>(null);
  const [pendingRewardDelete, setPendingRewardDelete] = useState<Reward | null>(null);
  const [rewardDeleteUsage, setRewardDeleteUsage] = useState<{ nodeCount: number } | null>(null);

  // Refs so tab switching can trigger the panel's own close guard
  const characterPanelCloseRef = useRef<(() => void) | null>(null);
  const rewardPanelCloseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    fetchCharacters(questlineId).then(setCharacters).catch(console.error);
    fetchQuestSummaries(questlineId).then(setQuestSummaries).catch(console.error);
    fetchRewards(questlineId).then(setRewards).catch(console.error);
    fetchQuestlineMeta(questlineId).then((m) => setQuestStyleId(m.styleId ?? '')).catch(console.error);
  }, [questlineId]);

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) ?? null;
  const selectedReward = rewards.find((r) => r.id === selectedRewardId) ?? null;

  // ── Deletion with dependent-node warning + reference cleanup ───────────────
  const requestCharDelete = (c: Character) => {
    setPendingCharDelete(c);
    setCharDeleteUsage(null);
    getCharacterUsage(c.id)
      .then(setCharDeleteUsage)
      .catch(() => setCharDeleteUsage({ nodeCount: 0, questlineCount: 0 }));
  };

  const confirmCharDelete = async () => {
    if (!pendingCharDelete) return;
    const target = pendingCharDelete;
    setPendingCharDelete(null);
    setCharDeleteUsage(null);
    if (selectedCharacterId === target.id) setSelectedCharacterId(null);
    try {
      await deleteCharacter(target.id);
      setCharacters((prev) => prev.filter((c) => c.id !== target.id));
      onCharacterDeleted?.(target.id);
      toast.success('Character deleted');
    } catch {
      toast.error('Failed to delete character');
    }
  };

  const requestRewardDelete = (r: Reward) => {
    setPendingRewardDelete(r);
    setRewardDeleteUsage(null);
    getRewardUsage(questlineId, r.id)
      .then(setRewardDeleteUsage)
      .catch(() => setRewardDeleteUsage({ nodeCount: 0 }));
  };

  const confirmRewardDelete = async () => {
    if (!pendingRewardDelete) return;
    const target = pendingRewardDelete;
    setPendingRewardDelete(null);
    setRewardDeleteUsage(null);
    if (selectedRewardId === target.id) setSelectedRewardId(null);
    try {
      await deleteReward(questlineId, target.id);
      setRewards((prev) => prev.filter((r) => r.id !== target.id));
      onRewardDeleted?.(target.id);
      toast.success('Reward deleted');
    } catch {
      toast.error('Failed to delete reward');
    }
  };

  const charDeleteMessage = !pendingCharDelete
    ? ''
    : charDeleteUsage === null
      ? `Checking where "${pendingCharDelete.name}" is used…`
      : charDeleteUsage.nodeCount > 0
        ? `"${pendingCharDelete.name}" is referenced by ${charDeleteUsage.nodeCount} quest node${charDeleteUsage.nodeCount === 1 ? '' : 's'}${charDeleteUsage.questlineCount > 1 ? ` across ${charDeleteUsage.questlineCount} questlines` : ''}. Deleting it will permanently remove the character and those references. This cannot be undone.`
        : `"${pendingCharDelete.name}" will be permanently deleted. This cannot be undone.`;

  const rewardDeleteMessage = !pendingRewardDelete
    ? ''
    : rewardDeleteUsage === null
      ? `Checking where "${pendingRewardDelete.title}" is used…`
      : rewardDeleteUsage.nodeCount > 0
        ? `"${pendingRewardDelete.title}" is referenced by ${rewardDeleteUsage.nodeCount} quest node${rewardDeleteUsage.nodeCount === 1 ? '' : 's'}. Deleting it will remove the reward and those references. This cannot be undone.`
        : `"${pendingRewardDelete.title}" will be permanently deleted. This cannot be undone.`;

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
                          {char.kbRef && <GroundedBadge entityName={char.kbRef} compact />}
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
                            onClick={(e) => { e.stopPropagation(); requestCharDelete(char); }}
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
                          {reward.kbRef && <GroundedBadge entityName={reward.kbRef} compact />}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); requestRewardDelete(reward); }}
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

                {/* ── Quests ── */}
                {activeTab === 'quests' && (
                  <div className="py-1">
                    {questSummaries.map((quest) => (
                      <button
                        key={quest.id}
                        onClick={() => { setActiveQuestId(quest.id); onQuestClick(quest.id); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left border-l-2 transition-colors ${
                          activeQuestId === quest.id
                            ? 'bg-purple-500/10 border-purple-500'
                            : 'border-transparent hover:bg-zinc-800'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${variantColor[quest.variant]}`} />
                        <span className={`text-sm truncate ${activeQuestId === quest.id ? 'text-purple-300' : 'text-zinc-300'}`}>
                          {quest.title}
                        </span>
                      </button>
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

          <ConfirmModal
            isOpen={pendingCharDelete !== null}
            title="Delete character?"
            message={charDeleteMessage}
            confirmLabel="Delete"
            danger
            onConfirm={confirmCharDelete}
            onCancel={() => { setPendingCharDelete(null); setCharDeleteUsage(null); }}
          />

          <ConfirmModal
            isOpen={pendingRewardDelete !== null}
            title="Delete reward?"
            message={rewardDeleteMessage}
            confirmLabel="Delete"
            danger
            onConfirm={confirmRewardDelete}
            onCancel={() => { setPendingRewardDelete(null); setRewardDeleteUsage(null); }}
          />
        </>
      )}
    </AnimatePresence>
  );
}
