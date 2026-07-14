import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Game,
  KbDocument,
  KbType,
  getGame,
  getKbDocument,
  listKbDocuments,
  ingestKbDocument,
  editKbDocument,
  retryKbDocument,
  deleteKbDocument,
} from '../../api/gameApi';
import { KbDocumentDialog } from './KbDocumentDialog';
import { KbTestSearch } from './KbTestSearch';
import { ConfirmModal } from '../../components/shared/ConfirmModal';

const TYPE_BADGES: Record<KbType, string> = {
  lore:       'bg-purple-500/15 text-purple-300',
  quests:     'bg-blue-500/15 text-blue-300',
  characters: 'bg-emerald-500/15 text-emerald-300',
  dialogue:   'bg-amber-500/15 text-amber-300',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusBadge({ doc }: { doc: KbDocument }) {
  if (doc.status === 'ready') {
    return (
      <span className="flex items-center gap-1 text-emerald-400 text-xs">
        <CheckCircle2 className="w-3.5 h-3.5" /> Ready
      </span>
    );
  }
  if (doc.status === 'pending') {
    return (
      <span className="flex items-center gap-1 text-amber-400 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexing…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-400 text-xs" title={doc.statusError || 'Indexing failed'}>
      <XCircle className="w-3.5 h-3.5" /> Failed
    </span>
  );
}

// Per-game knowledge-base manager: document CRUD with live indexing status,
// plus the test-search panel that shows what retrieval would feed generation.
export function GameDetail() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game | null>(null);
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KbDocument | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KbDocument | null>(null);
  const pollRef = useRef<number | null>(null);

  const refreshDocs = useCallback(async () => {
    try {
      setDocs(await listKbDocuments(gameId));
    } catch {
      /* toast on initial load only — polling failures stay quiet */
    }
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [g, d] = await Promise.all([getGame(gameId), listKbDocuments(gameId)]);
        if (cancelled) return;
        setGame(g);
        setDocs(d);
      } catch {
        if (!cancelled) {
          toast.error('Failed to load game');
          navigate('/games');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId, navigate]);

  // Poll while anything is indexing so status flips to Ready without a reload.
  const hasPending = docs.some((d) => d.status === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    pollRef.current = window.setInterval(() => { void refreshDocs(); }, 3000);
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [hasPending, refreshDocs]);

  const handleSubmitDoc = async (input: { type: KbType; title: string; text: string; sourceFilename?: string }) => {
    if (editingDoc) {
      try {
        const { reEmbedded } = await editKbDocument(gameId, editingDoc._id, {
          title: input.title,
          text: input.text,
        });
        toast.success(reEmbedded ? 'Document saved — re-indexing in the background' : 'Document saved');
        setEditingDoc(null);
        await refreshDocs();
      } catch {
        toast.error('Failed to save document');
        throw new Error('save failed'); // keep the dialog open
      }
    } else {
      try {
        await ingestKbDocument(gameId, input);
        toast.success('Document added — indexing in the background');
        await refreshDocs();
      } catch {
        toast.error('Failed to add document');
        throw new Error('ingest failed');
      }
    }
  };

  const openEdit = async (doc: KbDocument) => {
    setLoadingDocId(doc._id);
    try {
      // The list endpoint omits originalText — fetch the full document for editing.
      const full = await getKbDocument(gameId, doc._id);
      setEditingDoc(full);
      setDialogOpen(true);
    } catch {
      toast.error('Failed to load document');
    } finally {
      setLoadingDocId(null);
    }
  };

  const handleRetry = async (doc: KbDocument) => {
    try {
      await retryKbDocument(gameId, doc._id);
      toast.success('Retrying — re-indexing in the background');
      await refreshDocs();
    } catch {
      toast.error('Failed to retry');
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteKbDocument(gameId, target._id);
      toast.success('Document deleted');
      await refreshDocs();
    } catch {
      toast.error('Failed to delete document');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }
  if (!game) return null;

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <KbDocumentDialog
        isOpen={dialogOpen}
        editingDoc={editingDoc}
        onClose={() => { setDialogOpen(false); setEditingDoc(null); }}
        onSubmit={handleSubmitDoc}
      />
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete document?"
        message={`"${pendingDelete?.title}" will be removed from the knowledge base. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/games')}
            className="w-8 h-8 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors"
            title="Back to games"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-lg bg-purple-600/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-purple-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-lg leading-none truncate">{game.name}</h1>
            <p className="text-zinc-500 text-xs mt-0.5 truncate">
              {game.description || 'Knowledge base'}
            </p>
          </div>
          <button
            onClick={() => { setEditingDoc(null); setDialogOpen(true); }}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Document
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Documents */}
          <section className="lg:col-span-2 flex flex-col gap-3">
            <h2 className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Documents ({docs.length})
            </h2>
            {docs.length === 0 ? (
              <div className="bg-zinc-900 border border-dashed border-zinc-800 rounded-xl py-14 flex flex-col items-center text-center">
                <FileText className="w-8 h-8 text-zinc-700 mb-3" />
                <p className="text-zinc-400 text-sm mb-1">No documents yet</p>
                <p className="text-zinc-600 text-xs max-w-xs">
                  Add lore, quest descriptions, character sheets or dialogue. Everything gets indexed
                  for semantic search so generation can reference your real game content.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {docs.map((doc) => (
                  <div
                    key={doc._id}
                    className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-3 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium truncate">{doc.title}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${TYPE_BADGES[doc.type]}`}>
                          {doc.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-zinc-500 text-xs">
                        <StatusBadge doc={doc} />
                        {doc.status === 'ready' && (
                          <span>{doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}</span>
                        )}
                        {doc.status === 'failed' && doc.statusError && (
                          <span className="text-red-400/70 truncate max-w-[16rem]" title={doc.statusError}>
                            {doc.statusError}
                          </span>
                        )}
                        <span className="ml-auto shrink-0">{timeAgo(doc.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {doc.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(doc)}
                          className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-amber-600/80 text-zinc-400 hover:text-white rounded-lg transition-colors"
                          title="Retry indexing"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(doc)}
                        disabled={loadingDocId === doc._id}
                        className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                        title="Edit"
                      >
                        {loadingDocId === doc._id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Pencil className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setPendingDelete(doc)}
                        className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-red-600/80 text-zinc-400 hover:text-white rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Test search */}
          <section className="lg:sticky lg:top-6">
            <KbTestSearch gameId={gameId} hasReadyDocs={docs.some((d) => d.status === 'ready')} />
          </section>
        </div>
      </main>
    </div>
  );
}
