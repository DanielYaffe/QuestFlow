import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Search, LayoutGrid, List, Loader2, X,
  Gift, Trash2, Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { ProjectReward, fetchProjectRewards } from '../../api/projectApi';
import { updateReward, deleteReward, getRewardUsage } from '../../api/projectSidebarApi';
import { ConfirmModal } from '../../components/shared/ConfirmModal';
import { GroundedBadge } from '../../components/shared/GroundedBadge';

type Rarity = 'common' | 'rare' | 'epic';
type Filter = 'all' | Rarity | 'grounded';
type ViewMode = 'grid' | 'list';

const RARITY_STYLES: Record<Rarity, string> = {
  common: 'bg-amber-500/10 text-amber-300 border-amber-600/50',
  rare:   'bg-blue-500/10 text-blue-300 border-blue-600/50',
  epic:   'bg-purple-500/10 text-purple-300 border-purple-600/50',
};

function RarityChip({ rarity }: { rarity: Rarity }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${RARITY_STYLES[rarity]}`}>
      {rarity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail / quick-edit modal
// ---------------------------------------------------------------------------

function ItemDetailModal({
  item,
  onClose,
  onSaved,
  onDeleteRequest,
}: {
  item: ProjectReward;
  onClose: () => void;
  onSaved: (item: ProjectReward) => void;
  onDeleteRequest: () => void;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [rarity, setRarity] = useState<Rarity>(item.rarity);
  const [saving, setSaving] = useState(false);

  const dirty = title !== item.title || description !== item.description || rarity !== item.rarity;

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await updateReward(item.questlineId, item._id, { title: title.trim(), description, rarity });
      toast.success('Saved');
      onSaved({ ...item, title: title.trim(), description, rarity });
    } catch {
      toast.error('Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full flex flex-col max-h-[calc(100vh-2rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-400" />
            <h2 className="text-white font-semibold text-base">Item</h2>
            {item.kbRef && <GroundedBadge entityName={item.kbRef} />}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {item.imageUrl && (
            <div className="w-full flex justify-center">
              <img src={item.imageUrl} alt={item.title} className="max-h-48 object-contain rounded-lg border border-zinc-700" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-zinc-400 text-xs uppercase tracking-wide">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-zinc-400 text-xs uppercase tracking-wide">Rarity</label>
            <div className="grid grid-cols-3 gap-2">
              {(['common', 'rare', 'epic'] as Rarity[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRarity(r)}
                  className={`px-3 py-2 rounded-lg border text-sm capitalize transition-all ${
                    rarity === r ? RARITY_STYLES[r] : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-zinc-400 text-xs uppercase tracking-wide">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
          <button
            onClick={() => navigate(`/quest-builder/${item.questlineId}`)}
            className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm transition-colors self-start"
          >
            <Workflow className="w-4 h-4" />
            From questline "{item.questlineTitle}" — open in builder
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onDeleteRequest}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-zinc-800 hover:bg-red-600/80 text-zinc-400 hover:text-white rounded-lg text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">Close</button>
          <button
            onClick={save}
            disabled={!dirty || !title.trim() || saving}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Items() {
  const navigate = useNavigate();
  const { projectId = '' } = useParams<{ projectId: string }>();

  const [items, setItems] = useState<ProjectReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProjectReward | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectReward | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<{ nodeCount: number } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchProjectRewards(projectId)
      .then(setItems)
      .catch(() => toast.error('Failed to load items'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const requestDelete = (item: ProjectReward) => {
    setPendingDelete(item);
    setDeleteUsage(null);
    getRewardUsage(item.questlineId, item._id)
      .then(setDeleteUsage)
      .catch(() => setDeleteUsage({ nodeCount: 0 }));
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDeleteUsage(null);
    setSelected(null);
    try {
      await deleteReward(target.questlineId, target._id);
      setItems((prev) => prev.filter((i) => i._id !== target._id));
      toast.success('Item deleted');
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const deleteMessage = !pendingDelete
    ? ''
    : deleteUsage === null
      ? `Checking where "${pendingDelete.title}" is used…`
      : deleteUsage.nodeCount > 0
        ? `"${pendingDelete.title}" is referenced by ${deleteUsage.nodeCount} quest node${deleteUsage.nodeCount === 1 ? '' : 's'}. Deleting it will remove the item and those references. This cannot be undone.`
        : `"${pendingDelete.title}" will be permanently deleted. This cannot be undone.`;

  const counts = useMemo(() => ({
    all: items.length,
    common: items.filter((i) => i.rarity === 'common').length,
    rare: items.filter((i) => i.rarity === 'rare').length,
    epic: items.filter((i) => i.rarity === 'epic').length,
    grounded: items.filter((i) => i.kbRef).length,
  }), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === 'grounded' && !i.kbRef) return false;
      if ((filter === 'common' || filter === 'rare' || filter === 'epic') && i.rarity !== filter) return false;
      if (q && !i.title.toLowerCase().includes(q) && !i.questlineTitle.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, query]);

  const TABS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'common', label: 'Common' },
    { key: 'rare', label: 'Rare' },
    { key: 'epic', label: 'Epic' },
    { key: 'grounded', label: 'Grounded' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      {selected && (
        <ItemDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={(u) => { setItems((prev) => prev.map((i) => (i._id === u._id ? u : i))); setSelected(null); }}
          onDeleteRequest={() => requestDelete(selected)}
        />
      )}
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete item?"
        message={deleteMessage}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => { setPendingDelete(null); setDeleteUsage(null); }}
      />

      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to project
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-white font-semibold text-lg">Items</h1>
            <p className="text-zinc-500 text-xs">New items are created inside questlines — this collects them all.</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === t.key ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t.label} <span className="opacity-60">{counts[t.key]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or questline…"
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setView('list')} className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 bg-zinc-900/40 border border-zinc-800 border-dashed rounded-xl">
            <p className="text-sm">{items.length === 0 ? 'No items yet — rewards from generated questlines appear here.' : 'No items match.'}</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {visible.map((i) => (
              <button
                key={i._id}
                onClick={() => setSelected(i)}
                className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl overflow-hidden text-left transition-colors"
              >
                <div className="aspect-square bg-zinc-800/60 flex items-center justify-center relative">
                  {i.imageUrl
                    ? <img src={i.imageUrl} alt={i.title} className="w-full h-full object-contain p-2" />
                    : <Gift className="w-10 h-10 text-zinc-600" />}
                  {i.kbRef && (
                    <span className="absolute top-1.5 left-1.5">
                      <GroundedBadge entityName={i.kbRef} compact />
                    </span>
                  )}
                </div>
                <div className="px-3 py-2 border-t border-zinc-800">
                  <p className="text-white text-xs font-medium truncate group-hover:text-purple-400 transition-colors">{i.title}</p>
                  <div className="flex items-center justify-between mt-1">
                    <RarityChip rarity={i.rarity} />
                    <span className="text-zinc-600 text-[10px] truncate ml-2" title={i.questlineTitle}>{i.questlineTitle}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((i) => (
              <button
                key={i._id}
                onClick={() => setSelected(i)}
                className="group flex items-center gap-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-2.5 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                  {i.imageUrl
                    ? <img src={i.imageUrl} alt={i.title} className="w-full h-full object-contain" />
                    : <Gift className="w-5 h-5 text-zinc-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate group-hover:text-purple-400 transition-colors">{i.title}</p>
                  <p className="text-zinc-500 text-xs truncate">{i.questlineTitle}</p>
                </div>
                {i.kbRef && <GroundedBadge entityName={i.kbRef} />}
                <RarityChip rarity={i.rarity} />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
