import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, LayoutGrid, List, Loader2, X,
  Skull, User, Trash2, Unlink, Workflow, Palette,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CharacterRecord, CharacterKind, CharacterUsage,
  listCharacters, createCharacter, updateCharacter, deleteCharacter, getCharacterUsage,
} from '../../api/characterApi';
import { ConfirmModal } from '../../components/shared/ConfirmModal';
import { GroundedBadge } from '../../components/shared/GroundedBadge';

type Filter = 'all' | 'npc' | 'monster' | 'orphan' | 'grounded';
type ViewMode = 'grid' | 'list';

// ---------------------------------------------------------------------------
// Create modal — also used by the QuestBuilder "+ Create new" returnTo flow
// ---------------------------------------------------------------------------

function CreateCharacterModal({
  projectId,
  initialKind,
  onClose,
  onCreated,
}: {
  projectId: string;
  initialKind: CharacterKind;
  onClose: () => void;
  onCreated: (c: CharacterRecord) => void;
}) {
  const [kind, setKind] = useState<CharacterKind>(initialKind);
  const [name, setName] = useState('');
  const [appearance, setAppearance] = useState('');
  const [lore, setLore] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const created = await createCharacter({ name: name.trim(), kind, projectId, appearance: appearance.trim(), lore: lore.trim() });
      toast.success(`${kind === 'monster' ? 'Monster' : 'NPC'} created`);
      onCreated(created);
    } catch {
      toast.error('Failed to create character');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-steel-850 border border-steel-600 rounded-md max-w-md w-full p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-steel-100 font-semibold text-base">New Character</h2>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['npc', 'monster'] as CharacterKind[]).map((k) => {
            const Icon = k === 'monster' ? Skull : User;
            return (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  kind === k ? 'border-pulse bg-steel-800 text-pulse' : 'border-steel-600 text-steel-400 hover:border-steel-500'
                }`}
              >
                <Icon className="w-4 h-4" />
                {k === 'monster' ? 'Monster' : 'NPC'}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-steel-400 text-xs uppercase tracking-wide">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="e.g. Grok the Vault-Keeper"
            className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-steel-400 text-xs uppercase tracking-wide">Appearance (optional)</label>
          <textarea
            value={appearance}
            onChange={(e) => setAppearance(e.target.value)}
            rows={2}
            placeholder="A concrete visual description — used as the sprite subject"
            className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse resize-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-steel-400 text-xs uppercase tracking-wide">Lore (optional)</label>
          <textarea
            value={lore}
            onChange={(e) => setLore(e.target.value)}
            rows={3}
            placeholder="Background and motivation"
            className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse resize-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg text-sm transition-colors">Cancel</button>
          <button
            onClick={submit}
            disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2.5 bg-volt hover:brightness-95 disabled:bg-steel-700 disabled:text-steel-400 text-steel-950 font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail / quick-edit modal (the full lore/appearance/stats editor is Phase 2)
// ---------------------------------------------------------------------------

function CharacterDetailModal({
  character,
  onClose,
  onSaved,
  onDeleteRequest,
}: {
  character: CharacterRecord;
  onClose: () => void;
  onSaved: (c: CharacterRecord) => void;
  onDeleteRequest: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(character.name);
  const [appearance, setAppearance] = useState(character.appearance);
  const [lore, setLore] = useState(character.lore);
  const [saving, setSaving] = useState(false);

  const dirty = name !== character.name || appearance !== character.appearance || lore !== character.lore;

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await updateCharacter(character._id, { name: name.trim(), appearance, lore });
      toast.success('Saved');
      onSaved(updated);
    } catch {
      toast.error('Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-steel-850 border border-steel-600 rounded-md max-w-lg w-full flex flex-col max-h-[calc(100vh-2rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-steel-700">
          <div className="flex items-center gap-2">
            {character.kind === 'monster' ? <Skull className="w-4 h-4 text-rose-400" /> : <User className="w-4 h-4 text-blue-400" />}
            <h2 className="text-steel-100 font-semibold text-base">Character</h2>
            {character.kbRef && <GroundedBadge entityName={character.kbRef} />}
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {character.previewUrl && (
            <div className="w-full flex justify-center">
              <img src={character.previewUrl} alt={character.name} className="max-h-48 object-contain rounded-lg border border-steel-600" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-steel-400 text-xs uppercase tracking-wide">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 focus:outline-none focus:border-pulse"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-steel-400 text-xs uppercase tracking-wide">Appearance</label>
            <textarea
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              rows={3}
              className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 focus:outline-none focus:border-pulse resize-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-steel-400 text-xs uppercase tracking-wide">Lore</label>
            <textarea
              value={lore}
              onChange={(e) => setLore(e.target.value)}
              rows={4}
              className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2.5 text-sm text-steel-100 focus:outline-none focus:border-pulse resize-none"
            />
          </div>
          {(character.usedIn?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-steel-400 text-xs uppercase tracking-wide">Used in</label>
              <div className="flex flex-wrap gap-2">
                {(character.usedIn ?? []).map((u) => (
                  <button
                    key={u.questlineId}
                    onClick={() => navigate(`/quest-builder/${u.questlineId}`)}
                    title="Open in Quest Builder"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-200 hover:text-steel-100 rounded-lg text-xs transition-colors"
                  >
                    <Workflow className="w-3.5 h-3.5 text-pulse" />
                    {u.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-steel-700">
          <button
            onClick={onDeleteRequest}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-steel-800 hover:bg-red-600/80 text-steel-400 hover:text-white rounded-lg text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={() => navigate(`/studio/${character._id}`)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 text-steel-200 hover:text-steel-100 rounded-lg text-sm transition-colors"
            title="Sprite, rotations, animations and stats"
          >
            <Palette className="w-4 h-4 text-pulse" />
            Open in Studio
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg text-sm transition-colors">Close</button>
          <button
            onClick={save}
            disabled={!dirty || !name.trim() || saving}
            className="px-5 py-2.5 bg-volt hover:brightness-95 disabled:bg-steel-700 disabled:text-steel-400 text-steel-950 font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
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

export function Characters() {
  const navigate = useNavigate();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CharacterRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CharacterRecord | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<CharacterUsage | null>(null);

  // returnTo round-trip: QuestBuilder sends ?create=<kind>&returnTo=quest:<questId>:<nodeId>
  const createKind = searchParams.get('create');
  const returnTo = searchParams.get('returnTo');
  const [showCreate, setShowCreate] = useState(false);
  const [createInitialKind, setCreateInitialKind] = useState<CharacterKind>('npc');

  useEffect(() => {
    if (createKind === 'npc' || createKind === 'monster') {
      setCreateInitialKind(createKind);
      setShowCreate(true);
    }
  }, [createKind]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    listCharacters({ projectId })
      .then(setCharacters)
      .catch(() => toast.error('Failed to load characters'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreated = (c: CharacterRecord) => {
    setCharacters((prev) => [c, ...prev]);
    setShowCreate(false);
    // Clear the create params either way
    if (returnTo) {
      const parts = returnTo.split(':'); // quest:<questId>:<nodeId>
      if (parts[0] === 'quest' && parts[1]) {
        navigate(`/quest-builder/${parts[1]}?attachNode=${parts[2] ?? ''}&attachChar=${c._id}`);
        return;
      }
    }
    setSearchParams({}, { replace: true });
  };

  const requestDelete = (c: CharacterRecord) => {
    setPendingDelete(c);
    setDeleteUsage(null);
    getCharacterUsage(c._id)
      .then(setDeleteUsage)
      .catch(() => setDeleteUsage({ nodeCount: 0, questlineCount: 0 }));
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDeleteUsage(null);
    setSelected(null);
    try {
      await deleteCharacter(target._id);
      setCharacters((prev) => prev.filter((c) => c._id !== target._id));
      toast.success('Character deleted');
    } catch {
      toast.error('Failed to delete character');
    }
  };

  const deleteMessage = !pendingDelete
    ? ''
    : deleteUsage === null
      ? `Checking where "${pendingDelete.name}" is used…`
      : deleteUsage.nodeCount > 0
        ? `"${pendingDelete.name}" is referenced by ${deleteUsage.nodeCount} quest node${deleteUsage.nodeCount === 1 ? '' : 's'}${deleteUsage.questlineCount > 1 ? ` across ${deleteUsage.questlineCount} questlines` : ''}. Deleting it will permanently remove the character and those references. This cannot be undone.`
        : `"${pendingDelete.name}" will be permanently deleted. This cannot be undone.`;

  const counts = useMemo(() => ({
    all: characters.length,
    npc: characters.filter((c) => c.kind === 'npc').length,
    monster: characters.filter((c) => c.kind === 'monster').length,
    orphan: characters.filter((c) => c.isOrphan).length,
    grounded: characters.filter((c) => c.kbRef).length,
  }), [characters]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return characters.filter((c) => {
      if (filter === 'npc' && c.kind !== 'npc') return false;
      if (filter === 'monster' && c.kind !== 'monster') return false;
      if (filter === 'orphan' && !c.isOrphan) return false;
      if (filter === 'grounded' && !c.kbRef) return false;
      if (q
        && !c.name.toLowerCase().includes(q)
        && !c.tags.some((t) => t.toLowerCase().includes(q))
        && !(c.usedIn ?? []).some((u) => u.title.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [characters, filter, query]);

  const TABS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'npc', label: 'NPCs' },
    { key: 'monster', label: 'Monsters' },
    { key: 'orphan', label: 'Orphans' },
    { key: 'grounded', label: 'Grounded' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      {showCreate && (
        <CreateCharacterModal
          projectId={projectId}
          initialKind={createInitialKind}
          onClose={() => { setShowCreate(false); if (returnTo || createKind) setSearchParams({}, { replace: true }); }}
          onCreated={handleCreated}
        />
      )}
      {selected && (
        <CharacterDetailModal
          character={selected}
          onClose={() => setSelected(null)}
          onSaved={(u) => { setCharacters((prev) => prev.map((c) => (c._id === u._id ? { ...c, ...u } : c))); setSelected(null); }}
          onDeleteRequest={() => requestDelete(selected)}
        />
      )}
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete character?"
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
            className="flex items-center gap-1.5 text-steel-400 hover:text-steel-200 text-xs transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to project
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-steel-100 font-semibold text-lg">Characters</h1>
            <button
              onClick={() => { setCreateInitialKind('npc'); setShowCreate(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 font-semibold text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Character
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-steel-850 border border-steel-700 rounded-lg p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === t.key ? 'bg-volt text-steel-950 font-semibold' : 'text-steel-400 hover:text-steel-200'
                }`}
              >
                {t.label} <span className="opacity-60">{counts[t.key]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-steel-850 border border-steel-700 rounded-lg px-3 py-2 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-steel-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, tag or questline…"
              className="flex-1 bg-transparent text-sm text-steel-100 placeholder-steel-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-steel-850 border border-steel-700 rounded-lg p-1">
            <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-steel-700 text-steel-100' : 'text-steel-400 hover:text-steel-200'}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setView('list')} className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-steel-700 text-steel-100' : 'text-steel-400 hover:text-steel-200'}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-pulse animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-steel-400 bg-steel-850/40 border border-steel-700 border-dashed rounded-md">
            <p className="text-sm">No characters match.</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {visible.map((c) => (
              <button
                key={c._id}
                onClick={() => setSelected(c)}
                className="group bg-steel-850 border border-steel-700 hover:border-steel-500 rounded-md overflow-hidden text-left transition-colors"
              >
                <div className="aspect-square bg-steel-800/60 flex items-center justify-center relative">
                  {c.previewUrl
                    ? <img src={c.previewUrl} alt={c.name} className="w-full h-full object-contain p-2" />
                    : (c.kind === 'monster' ? <Skull className="w-10 h-10 text-steel-500" /> : <User className="w-10 h-10 text-steel-500" />)}
                  {c.isOrphan && (
                    <span className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] rounded-full" title="Not used by any questline">
                      <Unlink className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {c.kbRef && (
                    <span className="absolute top-1.5 left-1.5">
                      <GroundedBadge entityName={c.kbRef} compact />
                    </span>
                  )}
                </div>
                <div className="px-3 py-2 border-t border-steel-700">
                  <p className="text-steel-100 text-xs font-medium truncate group-hover:text-pulse transition-colors">{c.name}</p>
                  <p
                    className="text-steel-400 text-[11px] truncate"
                    title={(c.usedIn ?? []).map((u) => u.title).join(', ') || undefined}
                  >
                    <span className="capitalize">{c.kind}</span>
                    {(c.usedIn?.length ?? 0) > 0 && (
                      <> · in {c.usedIn?.length} quest{(c.usedIn?.length ?? 0) === 1 ? '' : 's'}</>
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((c) => (
              <button
                key={c._id}
                onClick={() => setSelected(c)}
                className="group flex items-center gap-3 bg-steel-850 border border-steel-700 hover:border-steel-500 rounded-lg px-3 py-2.5 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-steel-800 flex items-center justify-center overflow-hidden shrink-0">
                  {c.previewUrl
                    ? <img src={c.previewUrl} alt={c.name} className="w-full h-full object-contain" />
                    : (c.kind === 'monster' ? <Skull className="w-5 h-5 text-steel-500" /> : <User className="w-5 h-5 text-steel-500" />)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-steel-100 text-sm font-medium truncate group-hover:text-pulse transition-colors">{c.name}</p>
                  <p
                    className="text-steel-400 text-xs truncate"
                    title={(c.usedIn ?? []).map((u) => u.title).join(', ') || undefined}
                  >
                    <span className="capitalize">{c.kind}</span>
                    {(c.usedIn?.length ?? 0) > 0 && (
                      <> · used in {c.usedIn?.[0].title}{(c.usedIn?.length ?? 0) > 1 ? ` +${(c.usedIn?.length ?? 0) - 1}` : ''}</>
                    )}
                  </p>
                </div>
                {c.kbRef && <GroundedBadge entityName={c.kbRef} />}
                {c.isOrphan && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[11px] rounded-full">
                    <Unlink className="w-3 h-3" /> Orphan
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
