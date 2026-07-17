import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Loader2, FileText, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Game,
  listGames,
  createGame,
  updateGame,
  deleteGame,
} from '../../api/gameApi';
import { GameFormDialog } from './GameFormDialog';
import { ConfirmModal } from '../../components/shared/ConfirmModal';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Flat accent rotation for game card icons (Cyber style — no gradients).
const CARD_ACCENTS = ['#57c7d4', '#f5d90a', '#e5484d', '#7dd39a', '#6ea8ff', '#f0954f'];

// Games browser — each Game owns one knowledge base that quest generation can
// draw on. Cards drill into the per-game KB manager (documents + test search).
export function Games() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Game | null>(null);

  const refresh = async () => {
    try {
      setGames(await listGames());
    } catch {
      toast.error('Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleCreate = async (name: string, description: string) => {
    try {
      const game = await createGame(name, description);
      toast.success('Game created');
      navigate(`/games/${game._id}`);
    } catch {
      toast.error('Failed to create game');
    }
  };

  const handleEdit = async (name: string, description: string) => {
    if (!editing) return;
    try {
      await updateGame(editing._id, { name, description });
      toast.success('Game updated');
      await refresh();
    } catch {
      toast.error('Failed to update game');
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteGame(target._id);
      toast.success('Game and its knowledge base deleted');
      await refresh();
    } catch {
      toast.error('Failed to delete game');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <GameFormDialog
        isOpen={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <GameFormDialog
        isOpen={editing !== null}
        mode="edit"
        initialName={editing?.name}
        initialDescription={editing?.description}
        onClose={() => setEditing(null)}
        onSubmit={handleEdit}
      />
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete game?"
        message={`"${pendingDelete?.name}" and its entire knowledge base (${pendingDelete?.documentCount ?? 0} document${(pendingDelete?.documentCount ?? 0) === 1 ? '' : 's'}) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-steel-800 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-pulse" />
            </div>
            <div>
              <h1 className="text-steel-100 font-semibold text-lg leading-none">Games</h1>
              <p className="text-steel-400 text-xs mt-0.5">Knowledge bases that ground quest generation in your game's world</p>
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Game
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-pulse animate-spin" />
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-md bg-steel-850 border border-steel-700 flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-steel-500" />
            </div>
            <h2 className="text-steel-100 font-medium mb-1">No games yet</h2>
            <p className="text-steel-400 text-sm max-w-sm mb-5">
              A Game holds your world's knowledge base — monsters, characters, maps, items, quests and lore.
              Link it to projects so generated quests reference your actual game content.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create your first game
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {games.map((g, i) => (
              <div
                key={g._id}
                onClick={() => navigate(`/games/${g._id}`)}
                className="group bg-steel-850 border border-steel-700 rounded-md overflow-hidden hover:border-steel-500 transition-colors cursor-pointer relative"
              >
                <div className="h-24 bg-steel-900 border-b border-steel-700 flex items-center justify-center">
                  <BookOpen className="w-8 h-8" style={{ color: CARD_ACCENTS[i % CARD_ACCENTS.length] }} />
                </div>
                <div className="p-4">
                  <h3 className="text-steel-100 text-sm font-medium mb-1 group-hover:text-pulse transition-colors truncate">
                    {g.name}
                  </h3>
                  {g.description && (
                    <p className="text-steel-400 text-xs mb-2 line-clamp-1">{g.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-steel-400 text-xs">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {g.documentCount ?? 0} doc{(g.documentCount ?? 0) === 1 ? '' : 's'}
                    </span>
                    <span className="ml-auto">{timeAgo(g.updatedAt)}</span>
                  </div>
                </div>

                {/* Hover management actions */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(g); }}
                    className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-steel-700 text-white/70 hover:text-white rounded-md transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(g); }}
                    className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-red-600/80 text-white/70 hover:text-white rounded-md transition-colors cursor-pointer"
                    title="Delete game"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
