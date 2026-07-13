import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Loader2, Inbox, Workflow, Users, Trash2, Pencil, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useProject } from '../../context/ProjectContext';
import { ProjectFormDialog } from '../../components/shared/ProjectFormDialog';
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

const CARD_GRADIENTS = [
  'bg-gradient-to-br from-purple-600 to-blue-600',
  'bg-gradient-to-br from-emerald-600 to-teal-700',
  'bg-gradient-to-br from-amber-600 to-orange-600',
  'bg-gradient-to-br from-pink-600 to-rose-700',
  'bg-gradient-to-br from-indigo-600 to-purple-700',
  'bg-gradient-to-br from-blue-600 to-cyan-600',
];

// Projects browser — a grid of project cards that drills into a per-project
// dashboard (questlines + characters, incl. orphans). Project management
// (create / rename / duplicate / delete) is driven through ProjectContext so
// the grid stays in sync with the global active-project switcher in the TopNav.
export function Projects() {
  const navigate = useNavigate();
  const { projects, loading, createProject, renameProject, duplicateProject, deleteProject } = useProject();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleCreate = async (name: string) => {
    try {
      const project = await createProject(name);
      toast.success('Project created');
      navigate(`/projects/${project._id}`);
    } catch {
      toast.error('Failed to create project');
    }
  };

  const handleRename = async (name: string) => {
    if (!editing) return;
    try {
      await renameProject(editing.id, name);
      toast.success('Project renamed');
    } catch {
      toast.error('Failed to rename project');
    }
  };

  const handleDuplicate = async (id: string) => {
    setBusyId(id);
    try {
      await duplicateProject(id);
      toast.success('Project duplicated');
    } catch {
      toast.error('Failed to duplicate project');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setBusyId(target.id);
    try {
      await deleteProject(target.id);
      toast.success('Project deleted — its contents moved to Inbox');
    } catch {
      toast.error('Failed to delete project');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <ProjectFormDialog
        isOpen={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <ProjectFormDialog
        isOpen={editing !== null}
        mode="edit"
        initialName={editing?.name}
        onClose={() => setEditing(null)}
        onSubmit={handleRename}
      />
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete project?"
        message={`"${pendingDelete?.name}" will be deleted. Its questlines, sprites and characters will be moved to your Inbox — nothing is lost.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg leading-none">Projects</h1>
              <p className="text-zinc-500 text-xs mt-0.5">Organise your questlines, sprites and characters</p>
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {projects.map((p, i) => {
              const busy = busyId === p._id;
              return (
                <div
                  key={p._id}
                  onClick={() => navigate(`/projects/${p._id}`)}
                  className="group bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30 transition-all cursor-pointer relative"
                >
                  <div className={`h-24 ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]} flex items-center justify-center`}>
                    {p.isInbox ? <Inbox className="w-8 h-8 text-white/80" /> : <FolderOpen className="w-8 h-8 text-white/80" />}
                  </div>
                  <div className="p-4">
                    <h3 className="text-white text-sm font-medium mb-2 group-hover:text-purple-400 transition-colors truncate">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-3 text-zinc-500 text-xs">
                      <span className="flex items-center gap-1"><Workflow className="w-3 h-3" />{p.questlineCount ?? 0}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.characterCount ?? 0}</span>
                      <span className="ml-auto">{timeAgo(p.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Hover management actions */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!p.isInbox && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing({ id: p._id, name: p.name }); }}
                        className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-zinc-700 text-white/70 hover:text-white rounded-lg transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(p._id); }}
                      disabled={busy}
                      className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-zinc-700 text-white/70 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                      title="Duplicate"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {!p.isInbox && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: p._id, name: p.name }); }}
                        className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-red-600/80 text-white/70 hover:text-white rounded-lg transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
