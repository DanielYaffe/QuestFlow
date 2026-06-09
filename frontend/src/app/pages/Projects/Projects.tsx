import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Loader2, Inbox, Workflow, Users, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ProjectRecord,
  listProjects,
  createProject,
  deleteProject,
} from '../../api/projectApi';
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

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: ProjectRecord) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const project = await createProject({ name: name.trim(), description: description.trim() });
      toast.success('Project created');
      onCreated(project);
    } catch {
      toast.error('Failed to create project');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">New Project</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-zinc-400 text-xs uppercase tracking-wide">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="e.g. The Dragon Wars"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-zinc-400 text-xs uppercase tracking-wide">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What is this project about?"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || saving}
            className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectRecord | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteProject(target._id);
      setProjects((prev) => prev.filter((p) => p._id !== target._id));
      toast.success('Project deleted — its contents moved to Inbox');
    } catch {
      toast.error('Failed to delete project');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(p) => { setShowNew(false); navigate(`/projects/${p._id}`); }}
        />
      )}
      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete project?"
        message={`"${pendingDelete?.name}" will be deleted. Its questlines and characters will be moved to your Inbox — nothing is lost.`}
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
              <p className="text-zinc-500 text-xs mt-0.5">Organise your questlines and characters</p>
            </div>
          </div>
          <button
            onClick={() => setShowNew(true)}
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
            {projects.map((p, i) => (
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
                {!p.isInbox && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(p); }}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-black/40 hover:bg-red-600/80 text-white/70 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
