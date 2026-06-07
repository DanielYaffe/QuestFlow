import React, { useState } from 'react';
import { toast } from 'sonner';
import { FolderKanban, Plus, Check, Copy, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';

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

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createProject(name);
      setNewName('');
      toast.success('Project created');
    } catch {
      toast.error('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string, current: string) => {
    const name = window.prompt('Rename project', current)?.trim();
    if (!name || name === current) return;
    setBusyId(id);
    try {
      await renameProject(id, name);
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

  const handleDelete = async (id: string, name: string) => {
    if (projects.length <= 1) {
      toast.error('You must keep at least one project');
      return;
    }
    if (!window.confirm(`Delete "${name}" and all its questlines and sprites? This cannot be undone.`)) {
      return;
    }
    setBusyId(id);
    try {
      await deleteProject(id);
      toast.success('Project deleted');
    } catch {
      toast.error('Failed to delete project');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 pb-16">
        <div className="mb-8">
          <h1 className="text-white text-2xl font-semibold">Projects</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Organise your questlines and sprites into separate projects
          </p>
        </div>

        {/* Create */}
        <div className="flex gap-3 mb-8">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New project name"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-600"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-500 transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Create</span>
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
                      onClick={() => handleRename(p._id, p.name)}
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
    </div>
  );
}
