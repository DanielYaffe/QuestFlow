import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2, Workflow, Users, Inbox, FolderOpen, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectRecord, getProject } from '../../api/projectApi';
import { fetchQuestlines, QuestlineSummary } from '../../api/questBuilderApi';
import { listCharacters, CharacterRecord } from '../../api/characterApi';
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

const CARD_GRADIENTS = [
  'bg-gradient-to-br from-purple-600 to-blue-600',
  'bg-gradient-to-br from-emerald-600 to-teal-700',
  'bg-gradient-to-br from-amber-600 to-orange-600',
  'bg-gradient-to-br from-pink-600 to-rose-700',
];

export function ProjectDashboard() {
  const navigate = useNavigate();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { setActiveProject } = useProject();

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [questlines, setQuestlines] = useState<QuestlineSummary[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
    ])
      .then(([proj, qls, chars]) => {
        setProject(proj);
        setQuestlines([...qls].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        setCharacters(chars);
      })
      .catch(() => toast.error('Failed to load project'))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="text-center text-zinc-500">
          <p className="text-sm">Project not found.</p>
          <button onClick={() => navigate('/projects')} className="mt-3 text-purple-400 text-sm hover:underline">
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-8">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Projects
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-purple-600/20 flex items-center justify-center">
                {project.isInbox ? <Inbox className="w-6 h-6 text-purple-400" /> : <FolderOpen className="w-6 h-6 text-purple-400" />}
              </div>
              <div>
                <h1 className="text-white font-semibold text-xl leading-tight">{project.name}</h1>
                {project.description && <p className="text-zinc-500 text-sm mt-0.5">{project.description}</p>}
              </div>
            </div>
            <button
              onClick={() => navigate(`/create?projectId=${project._id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors shrink-0"
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
            className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl px-5 py-4 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-purple-400" />
              <div className="text-left">
                <p className="text-white text-sm font-medium">Characters</p>
                <p className="text-zinc-500 text-xs">{characters.length} in this project</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {characters.slice(0, 5).map((c) => (
                  <div key={c._id} className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-zinc-800 overflow-hidden flex items-center justify-center">
                    {c.previewUrl
                      ? <img src={c.previewUrl} alt={c.name} className="w-full h-full object-cover" />
                      : <span className="text-[10px] text-zinc-400">{c.name.slice(0, 2)}</span>}
                  </div>
                ))}
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </div>
          </button>
        </section>

        {/* Questlines */}
        <section>
          <h2 className="text-white text-lg font-semibold mb-4">Questlines</h2>
          {questlines.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 bg-zinc-900/40 border border-zinc-800 border-dashed rounded-xl">
              <Workflow className="w-9 h-9 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No questlines in this project yet.</p>
              <button
                onClick={() => navigate(`/create?projectId=${project._id}`)}
                className="mt-3 text-purple-400 text-sm hover:underline"
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
                  className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30 transition-all cursor-pointer group"
                >
                  <div className={`h-24 ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`} />
                  <div className="p-4">
                    <h3 className="text-white text-sm font-medium mb-2 group-hover:text-purple-400 transition-colors truncate">
                      {ql.title}
                    </h3>
                    <p className="text-zinc-500 text-xs">{timeAgo(ql.updatedAt)}</p>
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
