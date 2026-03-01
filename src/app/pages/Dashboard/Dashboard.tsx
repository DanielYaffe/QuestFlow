import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, Sparkles, PlayCircle, Plus, Loader2 } from 'lucide-react';
import { QuickActionCard } from './components/QuickActionCard';
import { ProjectCard } from './components/ProjectCard';
import { FeaturedProject } from './components/FeaturedProject';
import { fetchQuestlines, fetchQuestlineById, QuestlineSummary } from '../../api/questBuilderApi';

const CARD_GRADIENTS = [
  'bg-gradient-to-br from-rose-600 to-violet-700',
  'bg-gradient-to-br from-emerald-600 to-teal-700',
  'bg-gradient-to-br from-purple-600 to-blue-600',
  'bg-gradient-to-br from-blue-600 to-cyan-600',
  'bg-gradient-to-br from-amber-600 to-orange-600',
  'bg-gradient-to-br from-pink-600 to-rose-700',
  'bg-gradient-to-br from-indigo-600 to-purple-700',
];

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

export function Dashboard() {
  const navigate = useNavigate();

  const [questlines, setQuestlines] = useState<QuestlineSummary[]>([]);
  const [featuredNodes, setFeaturedNodes] = useState<{ id: string; title: string; variant: string }[]>([]);
  const [featuredEdges, setFeaturedEdges] = useState<{ source: string; target: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuestlines()
      .then(async (list) => {
        const sorted = [...list].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setQuestlines(sorted);

        if (sorted.length > 0) {
          try {
            const graph = await fetchQuestlineById(sorted[0]._id);
            setFeaturedNodes(
              graph.nodes.map((n) => ({ id: n.id, title: n.data.title, variant: (n.data.variant as string) ?? 'story' })),
            );
            setFeaturedEdges(graph.edges.map((e) => ({ source: e.source, target: e.target })));
          } catch {
            // non-fatal
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const featured = questlines[0] ?? null;
  const rest = questlines.slice(1);

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <main className="max-w-7xl mx-auto px-8 py-10 flex flex-col gap-10">

        {/* Quick Actions */}
        <section>
          <h2 className="text-white text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <QuickActionCard
              label="Create Quest"
              description="Generate a new questline with AI from a story premise"
              cta="Start Creating"
              icon={Plus}
              gradient="bg-gradient-to-br from-purple-600 to-purple-800"
              shadowColor="hover:shadow-purple-500/50"
              textColor="text-purple-100"
              onClick={() => navigate('/create')}
            />
            <QuickActionCard
              label="Sprite Generator"
              description="Generate game sprites using AI from text descriptions"
              cta="Create Sprites"
              icon={Sparkles}
              gradient="bg-gradient-to-br from-blue-600 to-blue-800"
              shadowColor="hover:shadow-blue-500/50"
              textColor="text-blue-100"
              onClick={() => navigate('/sprite-generator')}
            />
            <QuickActionCard
              label="Sprite Animator"
              description="Animate your sprites with automatic frame generation"
              cta="Start Animating"
              icon={PlayCircle}
              gradient="bg-gradient-to-br from-green-600 to-green-800"
              shadowColor="hover:shadow-green-500/50"
              textColor="text-green-100"
              onClick={() => navigate('/sprite-animator')}
            />
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          </div>
        ) : questlines.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <Workflow className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No questlines yet — create your first one above.</p>
          </div>
        ) : (
          <>
            {/* Featured questline */}
            <section>
              <h2 className="text-white text-lg font-semibold mb-4">Featured Questline</h2>
              <FeaturedProject
                id={featured!._id}
                title={featured!.title}
                subtitle={`${featuredNodes.length} nodes · last edited ${timeAgo(featured!.updatedAt)}`}
                nodes={featuredNodes}
                edges={featuredEdges}
                gradient={CARD_GRADIENTS[0]}
              />
            </section>

            {rest.length > 0 && (
              <section>
                <h2 className="text-white text-lg font-semibold mb-4">Your Questlines</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                  {rest.map((ql, i) => (
                    <ProjectCard
                      key={ql._id}
                      id={ql._id}
                      name={ql.title}
                      lastEdited={timeAgo(ql.updatedAt)}
                      thumbnail={CARD_GRADIENTS[(i + 1) % CARD_GRADIENTS.length]}
                      onClick={() => navigate(`/quest-builder/${ql._id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
