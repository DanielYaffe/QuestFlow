import React, { useState } from 'react';
import { toast } from 'sonner';
import { FolderKanban, Plus, Check, Copy, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { ProjectFormDialog } from '../../components/shared/ProjectFormDialog';

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

export function Projects() {
  const {
    projects,
    activeProjectId,
    loading,
    setActiveProject,
    createProject,
    renameProject,
    deleteProject,
    duplicateProject,
  } = useProject();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async (name: string) => {
    try {
      await createProject(name);
      toast.success('Project created');
    } catch {
      toast.error('Failed to create project');
    }
  };

  const handleRename = async (name: string) => {
    if (!editing || name === editing.name) return;
    setBusyId(editing.id);
    try {
      await renameProject(editing.id, name);
      toast.success('Project renamed');
    } catch {
      toast.error('Failed to rename project');
    } finally {
      setBusyId(null);
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

  const handleDelete = (id: string, name: string) => {
    if (projects.length <= 1) {
      toast.error('You must keep at least one project');
      return;
    }
    setDeleteTarget({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteProject(deleteTarget.id);
      toast.success('Project deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete project');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 pb-16">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-2xl font-semibold">Projects</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Organise your questlines and sprites into separate projects
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-500 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => {
              const isActive = p._id === activeProjectId;
              const busy = busyId === p._id;
              return (
                <div
                  key={p._id}
                  className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-colors ${
                    isActive
                      ? 'bg-zinc-900 border-purple-600/60'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="bg-zinc-800 p-2.5 rounded-lg">
                    <FolderKanban className="w-5 h-5 text-purple-400" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">{p.name}</span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs mt-0.5">Updated {timeAgo(p.updatedAt)}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isActive && (
                      <button
                        onClick={() => setActiveProject(p._id)}
                        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        Switch
                      </button>
                    )}
                    <button
                      onClick={() => setEditing({ id: p._id, name: p.name })}
                      disabled={busy}
                      title="Rename"
                      className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(p._id)}
                      disabled={busy}
                      title="Duplicate"
                      className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(p._id, p.name)}
                      disabled={busy || projects.length <= 1}
                      title={projects.length <= 1 ? 'You must keep at least one project' : 'Delete'}
                      className="p-2 rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="flex items-start gap-3 border-b border-zinc-800 px-5 py-4">
              <div className="mt-0.5 rounded-lg bg-red-500/10 p-2 text-red-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Delete project?</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Delete "{deleteTarget.name}" and all its questlines and sprites. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={busyId === deleteTarget.id}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyId === deleteTarget.id}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {busyId === deleteTarget.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
