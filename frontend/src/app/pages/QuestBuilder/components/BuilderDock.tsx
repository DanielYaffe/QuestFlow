import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gem, Loader2, Palette, Plus, Save, ScrollText, Skull, Trash2, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Character,
  QuestSummary,
  Reward,
  createReward,
  fetchCharacters,
  fetchQuestSummaries,
  fetchRewards,
  updateCharacter,
  updateReward,
} from '../../../api/projectSidebarApi';
import { deleteCharacter, getCharacterUsage } from '../../../api/characterApi';
import { ItemRecord, deleteItem, getItemUsage, listItems } from '../../../api/itemApi';
import { useProject } from '../../../context/ProjectContext';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import { GroundedBadge } from '../../../components/shared/GroundedBadge';
import { CHECKER_SM } from '../../../utils/spriteStyles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';

// ---------------------------------------------------------------------------
// Builder dock — the bottom strip of the Quest Builder: quests, characters,
// mobs, and items (rewards) as horizontal card shelves. Replaces the old
// sliding ProjectSidebar. Visual design lives in the Studio; the dock links
// there instead of generating images itself.
// ---------------------------------------------------------------------------

type DockTab = 'quests' | 'characters' | 'mobs' | 'items';

const variantColor: Record<string, string> = {
  story: 'bg-pulse',
  combat: 'bg-red-500',
  dialogue: 'bg-blue-500',
  treasure: 'bg-amber-500',
};

const rarityText: Record<Reward['rarity'], string> = {
  common: 'text-steel-400',
  rare: 'text-pulse',
  epic: 'text-volt',
};

interface BuilderDockProps {
  questlineId: string;
  isOpen: boolean;
  onQuestClick: (nodeId: string) => void;
  onCharacterDeleted?: (id: string) => void;
  onRewardDeleted?: (id: string) => void;
}

// --- Link-to-studio-item dialog ------------------------------------------------

function ItemLinkDialog({ isOpen, title, onClose, onPick }: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onPick: (item: ItemRecord) => Promise<void>;
}) {
  const navigate = useNavigate();
  const { activeProjectId } = useProject();
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    listItems({ projectId: activeProjectId ?? undefined })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [isOpen, activeProjectId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-lg w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Gem className="w-5 h-5 text-pulse" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-pulse animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-steel-400 text-sm py-2">
            No item designs yet — create one in the{' '}
            <button onClick={() => navigate('/studio')} className="text-pulse hover:underline cursor-pointer">Studio</button>.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
            {items.map((item) => (
              <button
                key={item._id}
                disabled={picking !== null}
                onClick={async () => {
                  setPicking(item._id);
                  try { await onPick(item); onClose(); } finally { setPicking(null); }
                }}
                className="relative text-left bg-steel-900 border border-steel-700 hover:border-volt rounded-md overflow-hidden transition-colors cursor-pointer disabled:opacity-60"
                title={item.name}
              >
                <div className="aspect-square flex items-center justify-center p-2" style={CHECKER_SM}>
                  {item.previewUrl
                    ? <img src={item.previewUrl} alt={item.name} loading="lazy" className="w-full h-full object-contain" />
                    : <Gem className="w-6 h-6 text-steel-600" />}
                </div>
                <div className="px-2 py-1.5 border-t border-steel-700">
                  <p className="text-steel-200 text-[11px] truncate">{item.name}</p>
                  <p className={`text-[10px] capitalize ${rarityText[item.rarity]}`}>{item.rarity}</p>
                </div>
                {picking === item._id && (
                  <span className="absolute inset-0 bg-steel-950/60 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-pulse animate-spin" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Main dock ------------------------------------------------------------------

export function BuilderDock({ questlineId, isOpen, onQuestClick, onCharacterDeleted, onRewardDeleted }: BuilderDockProps) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<DockTab>('quests');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [questSummaries, setQuestSummaries] = useState<QuestSummary[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [activeQuestId, setActiveQuestId] = useState<string | null>(null);

  // Selection → detail strip
  const [selected, setSelected] = useState<{ type: 'character' | 'reward'; id: string } | null>(null);

  // Detail form drafts
  const [draftA, setDraftA] = useState(''); // appearance | title
  const [draftB, setDraftB] = useState(''); // background | description
  const [savingDetail, setSavingDetail] = useState(false);

  // Deletion
  const [pendingCharDelete, setPendingCharDelete] = useState<Character | null>(null);
  const [charDeleteUsage, setCharDeleteUsage] = useState<{ nodeCount: number; questlineCount: number } | null>(null);
  const [pendingRewardDelete, setPendingRewardDelete] = useState<Reward | null>(null);
  const [rewardDeleteUsage, setRewardDeleteUsage] = useState<{ nodeCount: number; questlineCount: number } | null>(null);

  // "Add reward from Studio" picker
  const [addFromStudioOpen, setAddFromStudioOpen] = useState(false);

  const refreshRewards = useCallback(() => {
    fetchRewards(questlineId).then(setRewards).catch(console.error);
  }, [questlineId]);

  useEffect(() => {
    fetchCharacters(questlineId).then(setCharacters).catch(console.error);
    fetchQuestSummaries(questlineId).then(setQuestSummaries).catch(console.error);
    refreshRewards();
  }, [questlineId, refreshRewards]);

  const npcs = characters.filter((c) => c.kind !== 'monster');
  const mobs = characters.filter((c) => c.kind === 'monster');

  const selectedCharacter = selected?.type === 'character'
    ? characters.find((c) => c.id === selected.id) ?? null : null;
  const selectedReward = selected?.type === 'reward'
    ? rewards.find((r) => r.id === selected.id) ?? null : null;

  const select = (type: 'character' | 'reward', id: string, a: string, b: string) => {
    if (selected?.type === type && selected.id === id) { setSelected(null); return; }
    setSelected({ type, id });
    setDraftA(a);
    setDraftB(b);
  };

  const handleSaveDetail = async () => {
    if (!selected) return;
    setSavingDetail(true);
    try {
      if (selected.type === 'character') {
        await updateCharacter(questlineId, selected.id, { appearance: draftA, background: draftB });
        setCharacters((prev) => prev.map((c) => c.id === selected.id ? { ...c, appearance: draftA, background: draftB } : c));
      } else {
        await updateReward(questlineId, selected.id, { title: draftA, description: draftB });
        setRewards((prev) => prev.map((r) => r.id === selected.id ? { ...r, title: draftA, description: draftB } : r));
      }
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingDetail(false);
    }
  };

  // ── Deletion with dependent-node warning ─────────────────────────────────────
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
    if (selected?.id === target.id) setSelected(null);
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
    getItemUsage(r.id)
      .then(setRewardDeleteUsage)
      .catch(() => setRewardDeleteUsage({ nodeCount: 0, questlineCount: 0 }));
  };

  const confirmRewardDelete = async () => {
    if (!pendingRewardDelete) return;
    const target = pendingRewardDelete;
    setPendingRewardDelete(null);
    setRewardDeleteUsage(null);
    if (selected?.id === target.id) setSelected(null);
    try {
      // Rewards ARE studio items — deleting removes the item everywhere,
      // exactly like character deletion.
      await deleteItem(target.id);
      setRewards((prev) => prev.filter((r) => r.id !== target.id));
      onRewardDeleted?.(target.id);
      toast.success('Item deleted');
    } catch {
      toast.error('Failed to delete item');
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
        ? `"${pendingRewardDelete.title}" is referenced by ${rewardDeleteUsage.nodeCount} quest node${rewardDeleteUsage.nodeCount === 1 ? '' : 's'}${rewardDeleteUsage.questlineCount > 1 ? ` across ${rewardDeleteUsage.questlineCount} questlines` : ''}. Deleting it will permanently remove the item and those references. This cannot be undone.`
        : `"${pendingRewardDelete.title}" will be permanently deleted from the Studio and every questline. This cannot be undone.`;

  // ── Attach an existing studio item as a reward ───────────────────────────────
  const handleAddRewardFromItem = async (item: ItemRecord) => {
    try {
      await createReward(questlineId, { title: item.name, itemId: item._id });
      refreshRewards();
      toast.success(`${item.name} added to this questline`);
    } catch {
      toast.error('Failed to add item');
    }
  };

  if (!isOpen) return null;

  const tabs: { id: DockTab; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'quests',     label: 'Quests',     icon: ScrollText, count: questSummaries.length },
    { id: 'characters', label: 'Characters', icon: Users,      count: npcs.length },
    { id: 'mobs',       label: 'Mobs',       icon: Skull,      count: mobs.length },
    { id: 'items',      label: 'Items',      icon: Gem,        count: rewards.length },
  ];

  const characterCard = (char: Character) => (
    <div key={char.id} className="w-28 shrink-0 relative group">
      <button
        onClick={() => select('character', char.id, char.appearance, char.background)}
        className={`w-full text-left bg-steel-850 border rounded-md overflow-hidden transition-colors cursor-pointer ${
          selected?.id === char.id ? 'border-volt' : 'border-steel-700 hover:border-steel-500'
        }`}
      >
        <div className="h-16 flex items-center justify-center" style={CHECKER_SM}>
          {char.imageUrl
            ? <img src={char.imageUrl} alt={char.name} loading="lazy" className="max-w-full max-h-full object-contain p-1" />
            : char.kind === 'monster'
              ? <Skull className="w-5 h-5 text-steel-600" />
              : <Users className="w-5 h-5 text-steel-600" />}
        </div>
        <div className="px-2 py-1.5 border-t border-steel-700 flex items-center gap-1">
          <p className="text-steel-200 text-[11px] truncate">{char.name}</p>
          {char.kbRef && <GroundedBadge entityName={char.kbRef} compact />}
        </div>
      </button>
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => navigate(`/studio/${char.id}`)}
          className="w-5 h-5 flex items-center justify-center bg-steel-950/80 hover:bg-steel-800 text-steel-300 hover:text-volt rounded transition-colors cursor-pointer"
          title="Open in Studio"
        >
          <Palette className="w-3 h-3" />
        </button>
        <button
          onClick={() => requestCharDelete(char)}
          className="w-5 h-5 flex items-center justify-center bg-steel-950/80 hover:bg-steel-800 text-steel-300 hover:text-red-400 rounded transition-colors cursor-pointer"
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  const shelfContent = () => {
    if (activeTab === 'quests') {
      if (questSummaries.length === 0) {
        return <p className="text-steel-500 text-xs self-center px-1">No quests yet.</p>;
      }
      return questSummaries.map((quest) => (
        <button
          key={quest.id}
          onClick={() => { setActiveQuestId(quest.id); onQuestClick(quest.id); }}
          className={`shrink-0 flex items-center gap-2.5 px-3 h-10 self-center bg-steel-850 border rounded-md text-left transition-colors cursor-pointer ${
            activeQuestId === quest.id ? 'border-volt' : 'border-steel-700 hover:border-steel-500'
          }`}
          title={quest.title}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${variantColor[quest.variant]}`} />
          <span className="text-steel-200 text-xs truncate max-w-40">{quest.title}</span>
        </button>
      ));
    }

    if (activeTab === 'characters' || activeTab === 'mobs') {
      const list = activeTab === 'characters' ? npcs : mobs;
      return (
        <>
          {list.map(characterCard)}
          {list.length === 0 && (
            <p className="text-steel-500 text-xs self-center px-1">
              No {activeTab} in this questline yet.
            </p>
          )}
          <button
            onClick={() => navigate('/studio')}
            className="w-28 shrink-0 flex flex-col items-center justify-center gap-1 border border-dashed border-steel-600 hover:border-steel-400 rounded-md text-steel-500 hover:text-steel-300 transition-colors cursor-pointer"
            title="Design in Studio"
          >
            <Palette className="w-4 h-4" />
            <span className="text-[10px]">Studio</span>
          </button>
        </>
      );
    }

    // Items (questline rewards, optionally backed by studio Item designs)
    return (
      <>
        {rewards.map((reward) => (
          <div key={reward.id} className="w-28 shrink-0 relative group">
            <button
              onClick={() => select('reward', reward.id, reward.title, reward.description)}
              className={`w-full text-left bg-steel-850 border rounded-md overflow-hidden transition-colors cursor-pointer ${
                selected?.id === reward.id ? 'border-volt' : 'border-steel-700 hover:border-steel-500'
              }`}
            >
              <div className="h-16 flex items-center justify-center" style={CHECKER_SM}>
                {reward.imageUrl
                  ? <img src={reward.imageUrl} alt={reward.title} loading="lazy" className="max-w-full max-h-full object-contain p-1" />
                  : <Gem className="w-5 h-5 text-steel-600" />}
              </div>
              <div className="px-2 py-1.5 border-t border-steel-700">
                <div className="flex items-center gap-1">
                  <p className="text-steel-200 text-[11px] truncate">{reward.title}</p>
                  {reward.kbRef && <GroundedBadge entityName={reward.kbRef} compact />}
                </div>
                <p className={`text-[10px] capitalize ${rarityText[reward.rarity]}`}>
                  {reward.rarity}
                </p>
              </div>
            </button>
            <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => navigate(`/studio/items/${reward.itemId ?? reward.id}`)}
                className="w-5 h-5 flex items-center justify-center bg-steel-950/80 hover:bg-steel-800 text-steel-300 hover:text-volt rounded transition-colors cursor-pointer"
                title="Open in Studio"
              >
                <Palette className="w-3 h-3" />
              </button>
              <button
                onClick={() => requestRewardDelete(reward)}
                className="w-5 h-5 flex items-center justify-center bg-steel-950/80 hover:bg-steel-800 text-steel-300 hover:text-red-400 rounded transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setAddFromStudioOpen(true)}
          className="w-28 shrink-0 flex flex-col items-center justify-center gap-1 border border-dashed border-steel-600 hover:border-steel-400 rounded-md text-steel-500 hover:text-steel-300 transition-colors cursor-pointer"
          title="Add a studio item to this questline"
        >
          <Plus className="w-4 h-4" />
          <span className="text-[10px]">From Studio</span>
        </button>
      </>
    );
  };

  return (
    <div className="shrink-0 border-t border-steel-700 bg-steel-900 flex flex-col z-10">
      <ItemLinkDialog
        isOpen={addFromStudioOpen}
        title="Add item from Studio"
        onClose={() => setAddFromStudioOpen(false)}
        onPick={handleAddRewardFromItem}
      />
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

      {/* Detail strip */}
      {(selectedCharacter || selectedReward) && (
        <div className="border-b border-steel-700 bg-steel-850 px-4 py-3 flex gap-4 items-start">
          <div className="w-20 h-20 shrink-0 rounded-md border border-steel-700 flex items-center justify-center" style={CHECKER_SM}>
            {(selectedCharacter?.imageUrl || selectedReward?.imageUrl)
              ? <img
                  src={selectedCharacter?.imageUrl ?? selectedReward?.imageUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain p-1"
                />
              : selectedCharacter
                ? (selectedCharacter.kind === 'monster' ? <Skull className="w-6 h-6 text-steel-600" /> : <Users className="w-6 h-6 text-steel-600" />)
                : <Gem className="w-6 h-6 text-steel-600" />}
          </div>

          <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
            <div>
              <label className="block text-steel-400 text-[11px] mb-1">
                {selectedCharacter ? 'Appearance' : 'Title'}
              </label>
              {selectedCharacter ? (
                <textarea
                  value={draftA}
                  onChange={(e) => setDraftA(e.target.value)}
                  rows={2}
                  className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-xs resize-none focus:outline-none focus:border-pulse"
                />
              ) : (
                <input
                  type="text"
                  value={draftA}
                  onChange={(e) => setDraftA(e.target.value)}
                  className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-xs focus:outline-none focus:border-pulse"
                />
              )}
            </div>
            <div>
              <label className="block text-steel-400 text-[11px] mb-1">
                {selectedCharacter ? 'Background' : 'Description'}
              </label>
              <textarea
                value={draftB}
                onChange={(e) => setDraftB(e.target.value)}
                rows={2}
                className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-xs resize-none focus:outline-none focus:border-pulse"
              />
            </div>
          </div>

          <div className="shrink-0 flex flex-col gap-1.5 w-40">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-steel-100 text-xs font-semibold truncate">
                {selectedCharacter?.name ?? selectedReward?.title}
              </p>
              {(selectedCharacter?.kbRef || selectedReward?.kbRef) && (
                <GroundedBadge entityName={(selectedCharacter?.kbRef ?? selectedReward?.kbRef) as string} compact />
              )}
              <button
                onClick={() => setSelected(null)}
                className="ml-auto text-steel-400 hover:text-steel-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => void handleSaveDetail()}
              disabled={savingDetail}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-[11px] font-semibold rounded-md transition-[filter] cursor-pointer"
            >
              {savingDetail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
            {selectedCharacter && (
              <button
                onClick={() => navigate(`/studio/${selectedCharacter.id}`)}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-100 text-[11px] rounded-md transition-colors cursor-pointer"
              >
                <Palette className="w-3 h-3 text-pulse" />
                Open in Studio
              </button>
            )}
            {selectedReward && (
              <button
                onClick={() => navigate(`/studio/items/${selectedReward.itemId ?? selectedReward.id}`)}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-100 text-[11px] rounded-md transition-colors cursor-pointer"
              >
                <Palette className="w-3 h-3 text-pulse" />
                Open in Studio
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab row */}
      <div className="flex items-center gap-1 px-3 h-10">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelected(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                active
                  ? 'bg-steel-800 text-steel-100 shadow-[inset_0_2px_0_0_#f5d90a]'
                  : 'text-steel-400 hover:text-steel-100 hover:bg-steel-800/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-volt' : ''}`} />
              {tab.label}
              <span className="text-steel-500 tabular-nums">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Shelf */}
      <div className="flex gap-2 px-3 pb-3 overflow-x-auto h-28">
        {shelfContent()}
      </div>
    </div>
  );
}
