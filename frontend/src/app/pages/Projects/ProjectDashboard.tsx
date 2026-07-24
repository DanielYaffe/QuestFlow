import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2, Workflow, Users, Inbox, FolderOpen, ChevronRight, Gift, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectRecord, ProjectReward, getProject, fetchProjectRewards } from '../../api/projectApi';
import { fetchQuestlines, QuestlineSummary, deleteQuestline } from '../../api/questBuilderApi';
import { listCharacters, CharacterRecord } from '../../api/characterApi';
import { useProject } from '../../context/ProjectContext';
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

// Flat accent rotation for card bands (Cyber style — no gradients).
const CARD_ACCENTS = ['#57c7d4', '#f5d90a', '#7dd39a', '#f0954f'];

export function ProjectDashboard() {
  const navigate = useNavigate();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { setActiveProject } = useProject();

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [questlines, setQuestlines] = useState<QuestlineSummary[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [rewards, setRewards] = useState<ProjectReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<QuestlineSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    try {
      await deleteQuestline(target._id);
      setQuestlines((prev) => prev.filter((q) => q._id !== target._id));
      toast.success('Questline deleted');
      setPendingDelete(null);
    } catch {
      toast.error('Failed to delete questline');
    } finally {
      setDeleting(false);
    }
  };

  // Drilling into a project makes it the active project, so scoped operations
  // (new quest, sprite generation, exports) target it via the X-Project-Id header.
  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      getProject(projectId),
      fetchQuestlines(projectId),
      listCharacters({ projectId }),
      fetchProjectRewards(projectId).catch((): ProjectReward[] => []),
    ])
      .then(([proj, qls, chars, rews]) => {
        setProject(proj);
        setQuestlines([...qls].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        setCharacters(chars);
        setRewards(rews);
      })
      .catch(() => toast.error('Failed to load project'))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <Loader2 className="w-6 h-6 text-pulse animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <div className="text-center text-steel-400">
          <p className="text-sm">Project not found.</p>
          <button onClick={() => navigate('/projects')} className="mt-3 text-pulse text-sm hover:underline">
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-8">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-1.5 text-steel-400 hover:text-steel-200 text-xs transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Projects
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-md bg-steel-800 flex items-center justify-center">
                {project.isInbox ? <Inbox className="w-6 h-6 text-pulse" /> : <FolderOpen className="w-6 h-6 text-pulse" />}
              </div>
              <div>
                <h1 className="text-steel-100 font-semibold text-xl leading-tight">{project.name}</h1>
                {project.description && <p className="text-steel-400 text-sm mt-0.5">{project.description}</p>}
              </div>
            </div>
            <button
              onClick={() => navigate(`/create?projectId=${project._id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 font-semibold text-sm rounded-lg transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Quest
            </button>
          </div>
        </div>

        {/* Characters summary */}
        <section>
          <button
            onClick={() => navigate(`/projects/${project._id}/characters`)}
            className="w-full flex items-center justify-between bg-steel-850 border border-steel-700 hover:border-steel-500 rounded-md px-5 py-4 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-pulse" />
              <div className="text-left">
                <p className="text-steel-100 text-sm font-medium">Characters</p>
                <p className="text-steel-400 text-xs">{characters.length} in this project</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {characters.slice(0, 5).map((c) => (
                  <div key={c._id} className="w-8 h-8 rounded-full border-2 border-steel-850 bg-steel-800 overflow-hidden flex items-center justify-center">
                    {c.previewUrl
                      ? <img src={c.previewUrl} alt={c.name} className="w-full h-full object-cover" />
                      : <span className="text-[10px] text-steel-400">{c.name.slice(0, 2)}</span>}
                  </div>
                ))}
              </div>
              <ChevronRight className="w-4 h-4 text-steel-400 group-hover:text-steel-200 transition-colors" />
            </div>
          </button>
        </section>

        {/* Items summary — every reward across the project's questlines */}
        <section>
          <button
            onClick={() => navigate(`/projects/${project._id}/items`)}
            className="w-full flex items-center justify-between bg-steel-850 border border-steel-700 hover:border-steel-500 rounded-md px-5 py-4 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Gift className="w-5 h-5 text-amber-400" />
              <div className="text-left">
                <p className="text-steel-100 text-sm font-medium">Items</p>
                <p className="text-steel-400 text-xs">
                  {rewards.length} in this project
                  {rewards.some((r) => r.kbRef) && (
                    <span className="text-emerald-400"> · {rewards.filter((r) => r.kbRef).length} grounded</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {rewards.slice(0, 5).map((r) => (
                  <div key={r._id} className="w-8 h-8 rounded-full border-2 border-steel-850 bg-steel-800 overflow-hidden flex items-center justify-center">
                    {r.imageUrl
                      ? <img src={r.imageUrl} alt={r.title} className="w-full h-full object-cover" />
                      : <Gift className="w-3.5 h-3.5 text-steel-400" />}
                  </div>
                ))}
              </div>
              <ChevronRight className="w-4 h-4 text-steel-400 group-hover:text-steel-200 transition-colors" />
            </div>
          </button>
        </section>

        {/* Questlines */}
        <section>
          <h2 className="text-steel-100 text-lg font-semibold mb-4">Questlines</h2>
          {questlines.length === 0 ? (
            <div className="text-center py-16 text-steel-400 bg-steel-850/40 border border-steel-700 border-dashed rounded-md">
              <Workflow className="w-9 h-9 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No questlines in this project yet.</p>
              <button
                onClick={() => navigate(`/create?projectId=${project._id}`)}
                className="mt-3 text-pulse text-sm hover:underline"
              >
                Create the first one
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {questlines.map((ql, i) => (
                <div
                  key={ql._id}
                  onClick={() => navigate(`/quest-builder/${ql._id}`)}
                  className="relative bg-steel-850 border border-steel-700 rounded-md overflow-hidden hover:border-steel-500 hover:shadow-lg hover:shadow-black/30 transition-all cursor-pointer group"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(ql); }}
                    className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center bg-steel-950/80 hover:bg-red-950/80 text-steel-300 hover:text-red-400 rounded-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Delete questline"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <div
                    className="h-24 bg-steel-900 border-b border-steel-700"
                    style={{ boxShadow: `inset 0 3px 0 0 ${CARD_ACCENTS[i % CARD_ACCENTS.length]}` }}
                  />
                  <div className="p-4">
                    <h3 className="text-steel-100 text-sm font-medium mb-2 group-hover:text-pulse transition-colors truncate">
                      {ql.title}
                    </h3>
                    <p className="text-steel-400 text-xs">{timeAgo(ql.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <ConfirmModal
        isOpen={pendingDelete !== null}
        title="Delete questline?"
        message={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently deleted. Its characters, mobs, and items stay in the project — only the questline is removed. This cannot be undone.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setPendingDelete(null); }}
      />
    </div>
  );
}
