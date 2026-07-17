import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Loader2, Plus, Sparkles, Workflow } from 'lucide-react';
import { GraphPreview } from './components/GraphPreview';
import { fetchQuestlines, fetchQuestlineById, QuestlineSummary } from '../../api/questBuilderApi';
import { getSprites, SpriteRecord } from '../../api/spriteApi';
import { listGames, listKbDocuments, Game, KbDocument, KbType } from '../../api/gameApi';
import { useProject } from '../../context/ProjectContext';
import { useSpriteJobs } from '../../context/SpriteJobContext';
import { CHECKER_SM } from '../../utils/spriteStyles';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const KB_TYPE_COLOR: Record<KbType, string> = {
  monsters:   '#e5484d',
  characters: '#57c7d4',
  maps:       '#7dd39a',
  items:      '#f5d90a',
  quests:     '#f0954f',
  lore:       '#6ea8ff',
  general:    '#8b98a5',
};

/** Deterministic abstract graph thumbnail for questline shelf cards. */
function MiniGraphThumb({ seed, nodeCount }: { seed: string; nodeCount: number }) {
  const cols = Math.max(2, Math.min(5, Math.ceil(nodeCount / 3) || 2));
  const branchAt = nodeCount > 4 ? 1 + (seed.charCodeAt(0) % Math.max(1, cols - 2)) : -1;
  const xs = Array.from({ length: cols }, (_, i) => 18 + i * ((164 - 36) / Math.max(1, cols - 1)));
  const midY = 28;

  return (
    <svg width="180" height="56" viewBox="0 0 180 56" aria-hidden="true">
      {xs.slice(0, -1).map((x, i) => {
        const nx = xs[i + 1];
        if (i === branchAt) {
          return (
            <g key={i}>
              <path d={`M${x + 5},${midY} C${(x + nx) / 2},${midY} ${(x + nx) / 2},14 ${nx - 5},14`} fill="none" stroke="#2a323b" strokeWidth={1.5} />
              <path d={`M${x + 5},${midY} C${(x + nx) / 2},${midY} ${(x + nx) / 2},42 ${nx - 5},42`} fill="none" stroke="#2a323b" strokeWidth={1.5} />
            </g>
          );
        }
        return <line key={i} x1={x + 5} y1={midY} x2={nx - 5} y2={midY} stroke="#2a323b" strokeWidth={1.5} />;
      })}
      {xs.map((x, i) => {
        if (i === branchAt + 1 && branchAt >= 0) {
          return (
            <g key={i}>
              <circle cx={x} cy={14} r={5} fill="#14181d" stroke="#f5d90a" strokeWidth={1.5} />
              <circle cx={x} cy={42} r={5} fill="#14181d" stroke="#55616e" strokeWidth={1.5} />
            </g>
          );
        }
        return (
          <circle key={i} cx={x} cy={midY} r={5} fill="#14181d"
            stroke={i === 0 ? '#57c7d4' : '#55616e'} strokeWidth={1.5} />
        );
      })}
    </svg>
  );
}

function ShelfHeader({ title, subtitle, actionLabel, onAction }: {
  title: string;
  subtitle?: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <h2 className="text-steel-100 text-[15px] font-semibold">{title}</h2>
      {subtitle && <span className="text-steel-500 text-xs">{subtitle}</span>}
      <button
        onClick={onAction}
        className="ml-auto text-pulse text-xs font-medium hover:underline cursor-pointer"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { activeProject, activeProjectId } = useProject();
  const { activeJobs } = useSpriteJobs();

  const [questlines, setQuestlines] = useState<QuestlineSummary[]>([]);
  const [heroNodes, setHeroNodes] = useState<{ id: string; title: string; variant: string }[]>([]);
  const [heroEdges, setHeroEdges] = useState<{ source: string; target: string }[]>([]);
  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const [kbGame, setKbGame] = useState<Game | null>(null);
  const [kbDocs, setKbDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const linkedGameId = activeProject?.gameId ?? '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadQuestlines = fetchQuestlines().then(async (list) => {
      if (cancelled) return;
      const sorted = [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setQuestlines(sorted);

      if (sorted.length > 0) {
        try {
          const graph = await fetchQuestlineById(sorted[0]._id);
          if (cancelled) return;
          setHeroNodes(
            graph.nodes.map((n) => ({ id: n.id, title: n.data.title, variant: (n.data.variant as string) ?? 'story' })),
          );
          setHeroEdges(graph.edges.map((e) => ({ source: e.source, target: e.target })));
        } catch {
          // non-fatal — hero renders without the graph preview
        }
      }
    });

    const loadSprites = getSprites().then((list) => {
      if (cancelled) return;
      const sorted = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setSprites(sorted.slice(0, 10));
    }).catch(() => {});

    const loadKb = listGames().then(async (games) => {
      if (cancelled) return;
      const game = games.find((g) => g._id === linkedGameId) ?? games[0] ?? null;
      setKbGame(game);
      if (game) {
        try {
          const docs = await listKbDocuments(game._id);
          if (cancelled) return;
          const sorted = [...docs].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          setKbDocs(sorted.slice(0, 6));
        } catch {
          setKbDocs([]);
        }
      } else {
        setKbDocs([]);
      }
    }).catch(() => {});

    Promise.allSettled([loadQuestlines, loadSprites, loadKb]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeProjectId, linkedGameId]);

  const hero = questlines[0] ?? null;
  const shelf = questlines.slice(1);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-steel-950">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-pulse animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <main className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-8">

        {/* Hero — continue where you left off */}
        {hero ? (
          <section className="rounded-lg border border-steel-700 bg-steel-850 px-8 py-7 flex items-center gap-8">
            <div className="min-w-0">
              <p className="text-pulse text-[11px] font-bold tracking-[0.16em] uppercase mb-2.5">
                Continue where you left off
              </p>
              <h1 className="text-steel-100 text-2xl font-semibold mb-1 truncate">{hero.title}</h1>
              <p className="text-steel-400 text-sm mb-5">
                {heroNodes.length > 0 ? `${heroNodes.length} nodes · ` : ''}edited {timeAgo(hero.updatedAt)}
              </p>
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  onClick={() => navigate(`/quest-builder/${hero._id}`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-volt text-steel-950 text-sm font-semibold hover:brightness-95 transition-[filter] cursor-pointer"
                >
                  <Workflow className="w-4 h-4" />
                  Resume building
                </button>
                {kbGame && (
                  <button
                    onClick={() => navigate(`/games/${kbGame._id}`)}
                    className="flex items-center gap-2 px-4 py-2 rounded-md border border-steel-600 text-steel-100 text-sm font-medium hover:bg-steel-800 transition-colors cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4" />
                    Open game KB
                  </button>
                )}
              </div>
            </div>
            {heroNodes.length > 0 && (
              <div className="ml-auto hidden lg:block shrink-0 max-w-[440px] bg-steel-950 border border-steel-700 rounded-md p-3 overflow-hidden">
                <GraphPreview nodes={heroNodes} edges={heroEdges} />
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-lg border border-steel-700 bg-steel-850 px-8 py-10 text-center">
            <Workflow className="w-8 h-8 mx-auto mb-3 text-steel-600" />
            <h1 className="text-steel-100 text-xl font-semibold mb-1">Start your first questline</h1>
            <p className="text-steel-400 text-sm mb-5">
              Generate a questline with AI from a story premise, grounded in your game's knowledge base.
            </p>
            <button
              onClick={() => navigate('/create')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-volt text-steel-950 text-sm font-semibold hover:brightness-95 transition-[filter] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create quest
            </button>
          </section>
        )}

        {/* Running jobs */}
        {activeJobs.length > 0 && (
          <section className="flex items-center gap-3 flex-wrap">
            <span className="text-steel-500 text-[11px] font-bold tracking-[0.14em] uppercase">Running</span>
            {activeJobs.map((job) => (
              <div
                key={job.jobId}
                className="flex items-center gap-2.5 bg-steel-850 border border-steel-700 rounded-md px-3.5 py-2"
              >
                <span className="w-2 h-2 rounded-full bg-pulse animate-pulse motion-reduce:animate-none" />
                <span className="text-steel-200 text-xs">{job.label}</span>
                <span className="text-steel-500 text-[11px] tabular-nums">
                  {timeAgo(new Date(job.startedAt).toISOString())}
                </span>
              </div>
            ))}
          </section>
        )}

        {/* Questlines shelf */}
        {shelf.length > 0 && (
          <section>
            <ShelfHeader
              title="Questlines"
              subtitle={`${questlines.length} total`}
              actionLabel="View all →"
              onAction={() => navigate('/quest-builder')}
            />
            <div className="flex gap-3.5 overflow-x-auto pb-1.5">
              {shelf.map((ql) => (
                <button
                  key={ql._id}
                  onClick={() => navigate(`/quest-builder/${ql._id}`)}
                  className="w-56 shrink-0 text-left bg-steel-850 border border-steel-700 rounded-md overflow-hidden hover:border-steel-500 transition-colors cursor-pointer"
                >
                  <div className="h-20 bg-steel-900 border-b border-steel-700 flex items-center justify-center">
                    <MiniGraphThumb seed={ql._id} nodeCount={ql.nodeCount ?? 0} />
                  </div>
                  <div className="px-3.5 py-2.5">
                    <p className="text-steel-100 text-[13px] font-semibold truncate">{ql.title}</p>
                    <p className="text-steel-400 text-[11px] mt-0.5">
                      {ql.nodeCount != null ? `${ql.nodeCount} nodes · ` : ''}{timeAgo(ql.updatedAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Recent sprites shelf */}
        <section>
          <ShelfHeader
            title="Recent sprites"
            subtitle={sprites.length > 0 ? undefined : 'nothing generated yet'}
            actionLabel="Open generator →"
            onAction={() => navigate('/sprite-generator')}
          />
          {sprites.length > 0 ? (
            <div className="flex gap-3.5 overflow-x-auto pb-1.5">
              {sprites.map((sprite) => (
                <button
                  key={sprite._id}
                  onClick={() => navigate(`/sprite-generator?spriteId=${sprite._id}`)}
                  className="w-24 h-24 shrink-0 rounded-md border border-steel-700 hover:border-steel-500 transition-colors overflow-hidden cursor-pointer"
                  style={CHECKER_SM}
                  title={sprite.userPrompt}
                >
                  <img
                    src={sprite.imageUrl}
                    alt={sprite.userPrompt}
                    loading="lazy"
                    className="w-full h-full object-contain p-1.5"
                  />
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => navigate('/sprite-generator')}
              className="flex items-center gap-2.5 px-4 py-3 rounded-md border border-steel-700 bg-steel-850 text-steel-400 text-sm hover:text-steel-100 hover:border-steel-500 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-pulse" />
              Generate your first sprite from a text description
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </section>

        {/* Knowledge base shelf */}
        <section className="pb-4">
          <ShelfHeader
            title="Knowledge base"
            subtitle={kbGame ? `${kbGame.name}${kbGame.documentCount != null ? ` · ${kbGame.documentCount} docs` : ''}` : undefined}
            actionLabel={kbGame ? 'Open playground →' : 'Open games →'}
            onAction={() => navigate(kbGame ? `/games/${kbGame._id}/playground` : '/games')}
          />
          {kbGame && kbDocs.length > 0 ? (
            <div className="flex gap-3.5 overflow-x-auto pb-1.5">
              {kbDocs.map((doc) => (
                <button
                  key={doc._id}
                  onClick={() => navigate(`/games/${doc.gameId}/docs/${doc._id}`)}
                  className="w-52 shrink-0 text-left bg-steel-850 border border-steel-700 rounded-md px-3.5 py-3 hover:border-steel-500 transition-colors cursor-pointer"
                >
                  <span
                    className="inline-block text-[10px] font-bold tracking-[0.1em] uppercase rounded px-2 py-0.5 bg-steel-800 mb-2"
                    style={{ color: KB_TYPE_COLOR[doc.type] }}
                  >
                    {doc.type}
                  </span>
                  <p className="text-steel-100 text-[13px] font-semibold truncate">{doc.title}</p>
                  <p className="text-steel-400 text-[11px] mt-0.5">
                    {doc.status === 'failed'
                      ? <span className="text-[#e5484d]">indexing failed</span>
                      : doc.status === 'pending'
                        ? 'indexing…'
                        : `${doc.chunkCount} chunks`}
                    {' · '}{timeAgo(doc.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => navigate(kbGame ? `/games/${kbGame._id}` : '/games')}
              className="flex items-center gap-2.5 px-4 py-3 rounded-md border border-steel-700 bg-steel-850 text-steel-400 text-sm hover:text-steel-100 hover:border-steel-500 transition-colors cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-pulse" />
              {kbGame
                ? `Add monsters, maps, and items to ${kbGame.name} so generation can cast them`
                : 'Create a game knowledge base to ground your quests'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
