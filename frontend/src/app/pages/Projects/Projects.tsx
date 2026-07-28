import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Loader2, Inbox, Workflow, Users, Trash2, Pencil, Copy, Github } from 'lucide-react';
import { toast } from 'sonner';
import { useProject } from '../../context/ProjectContext';
import { ProjectFormDialog } from '../../components/shared/ProjectFormDialog';
import { ProjectRepoDialog } from '../../components/shared/ProjectRepoDialog';
import { ConfirmModal } from '../../components/shared/ConfirmModal';
import { Project } from '../../api/projectApi';

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

// Flat accent rotation for project card icons (Cyber style — no gradients).
const CARD_ACCENTS = ['#57c7d4', '#f5d90a', '#7dd39a', '#f0954f', '#6ea8ff', '#e5484d'];

// Projects browser — a grid of project cards that drills into a per-project
// dashboard (questlines + characters, incl. orphans). Project management
// (create / rename / duplicate / delete) is driven through ProjectContext so
// the grid stays in sync with the global active-project switcher in the SideNav.
export function Projects() {
  const navigate = useNavigate();
  const { projects, loading, createProject, renameProject, duplicateProject, deleteProject, refreshProjects } = useProject();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [repoTarget, setRepoTarget] = useState<Project | null>(null);
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
    <div className="h-full overflow-y-auto bg-steel-950">
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
      <ProjectRepoDialog
        isOpen={repoTarget !== null}
        project={repoTarget}
        onClose={() => setRepoTarget(null)}
        onSaved={async () => { await refreshProjects(); }}
      />

      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-steel-800 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-pulse" />
            </div>
            <div>
              <h1 className="text-steel-100 font-semibold text-lg leading-none">Projects</h1>
              <p className="text-steel-400 text-xs mt-0.5">Organise your questlines, sprites and characters</p>
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 font-semibold text-sm rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-pulse animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {projects.map((p, i) => {
              const busy = busyId === p._id;
              return (
                <div
                  key={p._id}
                  onClick={() => navigate(`/projects/${p._id}`)}
                  className="group bg-steel-850 border border-steel-700 rounded-md overflow-hidden hover:border-steel-500 hover:shadow-lg hover:shadow-black/30 transition-all cursor-pointer relative"
                >
                  <div className="h-24 bg-steel-900 border-b border-steel-700 flex items-center justify-center">
                    {p.isInbox
                      ? <Inbox className="w-8 h-8" style={{ color: CARD_ACCENTS[i % CARD_ACCENTS.length] }} />
                      : <FolderOpen className="w-8 h-8" style={{ color: CARD_ACCENTS[i % CARD_ACCENTS.length] }} />}
                  </div>
                  <div className="p-4">
                    <h3 className="text-steel-100 text-sm font-medium mb-2 group-hover:text-pulse transition-colors truncate">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-3 text-steel-400 text-xs">
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
                        className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-steel-700 text-white/70 hover:text-white rounded-lg transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!p.isInbox && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setRepoTarget(p); }}
                        className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-steel-700 text-white/70 hover:text-white rounded-lg transition-colors"
                        title={p.git?.repoOwner && p.git?.repoName ? `Repository: ${p.git.repoOwner}/${p.git.repoName}` : 'Set export repository'}
                      >
                        <Github className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(p._id); }}
                      disabled={busy}
                      className="w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-steel-700 text-white/70 hover:text-white rounded-lg transition-colors disabled:opacity-50"
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
