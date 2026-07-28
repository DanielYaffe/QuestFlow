import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FileText,
  FlaskConical,
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
  FREEFORM_ONLY_TYPES,
  getGame,
  listKbDocuments,
  retryKbDocument,
  deleteKbDocument,
} from '../../api/gameApi';
import { TYPE_BADGES } from './kbContent';
import { ConfirmModal } from '../../components/shared/ConfirmModal';

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

// What ingestion actually did with a ready document. Entity recognition is the
// difference between "searchable text" and "linkable, grounded quest
// references", so a freeform result in an entity category is called out.
function IngestSummary({ doc }: { doc: KbDocument }) {
  const entityCount = doc.metadata?.structured === true ? Number(doc.metadata.entityCount ?? 0) : 0;
  if (entityCount > 0) {
    return <span className="text-emerald-400/90">{entityCount} entit{entityCount === 1 ? 'y' : 'ies'} recognized</span>;
  }
  if (FREEFORM_ONLY_TYPES.includes(doc.type)) {
    return <span>{doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}</span>;
  }
  return (
    <span
      className="text-amber-400/80"
      title="Indexed as plain text — no entities were recognized, so nothing here can be linked into quests as a grounded reference. Open the document to see the accepted formats."
    >
      plain text — no entities recognized
    </span>
  );
}

// Per-game knowledge-base manager: the document registry with live indexing
// status. Creating/editing documents happens on the full-page editor
// (docs/new, docs/:docId); retrieval testing lives in the playground.
export function GameDetail() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game | null>(null);
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
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
      <div className="h-full flex items-center justify-center bg-steel-950">
        <Loader2 className="w-6 h-6 text-pulse animate-spin" />
      </div>
    );
  }
  if (!game) return null;

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete document?"
        message={`"${pendingDelete?.title}" will be removed from the knowledge base. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <main className="max-w-5xl mx-auto px-8 py-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/games')}
            className="w-8 h-8 flex items-center justify-center bg-steel-850 hover:bg-steel-800 border border-steel-700 text-steel-400 hover:text-steel-100 rounded-md transition-colors cursor-pointer"
            title="Back to games"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-md bg-steel-800 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="text-steel-100 font-semibold text-lg leading-none truncate">{game.name}</h1>
            <p className="text-steel-400 text-xs mt-0.5 truncate">
              {game.description || 'Knowledge base'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate(`/games/${gameId}/playground`)}
              className="flex items-center gap-2 px-4 py-2 bg-steel-850 hover:bg-steel-800 border border-steel-700 text-steel-200 hover:text-steel-100 text-sm rounded-md transition-colors cursor-pointer"
            >
              <FlaskConical className="w-4 h-4 text-pulse" />
              Playground
            </button>
            <button
              onClick={() => navigate(`/games/${gameId}/docs/new`)}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Document
            </button>
          </div>
        </div>

        {/* Documents */}
        <section className="flex flex-col gap-3">
          <h2 className="text-steel-400 text-xs font-medium uppercase tracking-wider">
            Documents ({docs.length})
          </h2>
          {docs.length === 0 ? (
            <div className="bg-steel-850 border border-dashed border-steel-700 rounded-md py-14 flex flex-col items-center text-center">
              <FileText className="w-8 h-8 text-steel-600 mb-3" />
              <p className="text-steel-400 text-sm mb-1">No documents yet</p>
              <p className="text-steel-500 text-xs max-w-xs">
                Add your monsters, characters, maps, items, quests or world lore. Everything gets indexed
                for semantic search so generation can reference your real game content.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((doc) => (
                <div
                  key={doc._id}
                  className="group bg-steel-850 border border-steel-700 hover:border-steel-500 rounded-md px-4 py-3 flex items-center gap-3 transition-colors"
                >
                  <FileText className="w-4 h-4 text-steel-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-steel-100 text-sm font-medium truncate">{doc.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${TYPE_BADGES[doc.type]}`}>
                        {doc.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-steel-400 text-xs">
                      <StatusBadge doc={doc} />
                      {doc.status === 'ready' && <IngestSummary doc={doc} />}
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
                        className="w-7 h-7 flex items-center justify-center bg-steel-800 hover:bg-amber-600/80 text-steel-400 hover:text-white rounded-md transition-colors cursor-pointer"
                        title="Retry indexing"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/games/${gameId}/docs/${doc._id}`)}
                      className="w-7 h-7 flex items-center justify-center bg-steel-800 hover:bg-steel-700 text-steel-400 hover:text-steel-100 rounded-md transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(doc)}
                      className="w-7 h-7 flex items-center justify-center bg-steel-800 hover:bg-red-600/80 text-steel-400 hover:text-white rounded-md transition-colors cursor-pointer"
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
      </main>
    </div>
  );
}
