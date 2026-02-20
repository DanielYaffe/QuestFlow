import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, Sparkles, PlayCircle, TrendingUp, FolderOpen } from 'lucide-react';
import { StatCard } from './components/StatCard';
import { QuickActionCard } from './components/QuickActionCard';
import { ProjectCard } from './components/ProjectCard';
import { FeaturedProject } from './components/FeaturedProject';

const stats = [
  { label: 'Total Quests', value: '16', subtext: '+6 this week', icon: FolderOpen, iconColor: 'text-purple-400' },
  { label: 'Quest Nodes', value: '139', subtext: 'Across all projects', icon: Workflow, iconColor: 'text-blue-400' },
  { label: 'AI Generations', value: '348', subtext: 'This month', icon: Sparkles, iconColor: 'text-amber-400' },
  { label: 'Sprites Created', value: '42', subtext: '+8 this week', icon: TrendingUp, iconColor: 'text-green-400' },
];

const projects = [
  { id: 1, name: 'Fractured Return', type: 'Questline', nodes: 6, lastEdited: 'Just now', thumbnail: 'bg-gradient-to-br from-rose-600 to-violet-700' },
  { id: 2, name: "Hero's Journey", type: 'Questline', nodes: 5, lastEdited: '1 hour ago', thumbnail: 'bg-gradient-to-br from-emerald-600 to-teal-700' },
  { id: 3, name: 'Fantasy Adventure', type: 'Quest', nodes: 12, lastEdited: '2 hours ago', thumbnail: 'bg-gradient-to-br from-purple-600 to-blue-600' },
  { id: 4, name: 'Space Explorer', type: 'Quest', nodes: 8, lastEdited: '1 day ago', thumbnail: 'bg-gradient-to-br from-blue-600 to-cyan-600' },
  { id: 5, name: 'Mystery Manor', type: 'Quest', nodes: 15, lastEdited: '3 days ago', thumbnail: 'bg-gradient-to-br from-amber-600 to-orange-600' },
];

// Layout: 9001 → 9002 → 9003 → 9004 ↘
//                             → 9005 ↗ → 9006
// x positions: col0=20, col1=175, col2=330, col3=485(top)/485(bot), col4=640(converge)
// But 9006 is at col4 — canvas is 680 wide, node is 130 wide so fits at x=530
const featuredNodes = [
  { id: '9001', name: 'A World Not My Own',   x: 10,  y: 108, status: 'completed' as const, variant: 'story'    as const },
  { id: '9002', name: 'Distorted Memories',   x: 160, y: 108, status: 'completed' as const, variant: 'dialogue' as const },
  { id: '9003', name: 'Clockwork Collapse',   x: 310, y: 108, status: 'active'    as const, variant: 'combat'   as const },
  { id: '9004', name: 'Dragon Suppression',   x: 460, y: 36,  status: 'locked'    as const, variant: 'combat'   as const },
  { id: '9005', name: 'Rift Stabilization',   x: 460, y: 180, status: 'locked'    as const, variant: 'story'    as const },
  { id: '9006', name: 'The Rift Architect',   x: 530, y: 108, status: 'locked'    as const, variant: 'treasure' as const },
];

const featuredEdges = [
  { from: '9001', to: '9002' },
  { from: '9002', to: '9003' },
  { from: '9003', to: '9004' },
  { from: '9003', to: '9005' },
  { from: '9004', to: '9006' },
  { from: '9005', to: '9006' },
];

export function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-auto bg-zinc-950">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-3 rounded-xl">
              <Workflow className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-white text-2xl">QuestFlow AI</h1>
              <p className="text-zinc-400">AI-Powered Game Development Suite</p>
            </div>
          </div>
          <button className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
            New Project
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-white text-xl mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <QuickActionCard
              label="Quest Builder"
              description="Design interactive quest flows with AI-powered story generation"
              cta="Open Builder"
              icon={Workflow}
              gradient="bg-gradient-to-br from-purple-600 to-purple-800"
              shadowColor="hover:shadow-purple-500/50"
              textColor="text-purple-100"
              onClick={() => navigate('/quest-builder')}
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
        </div>

        {/* Featured Project */}
        <div className="mb-8">
          <h2 className="text-white text-xl mb-4">Featured Project</h2>
          <FeaturedProject
            title="Fractured Return"
            subtitle="Questline · 6 quests · Dimensional rift storyline"
            nodes={featuredNodes}
            edges={featuredEdges}
            completedCount={2}
            totalCount={6}
            gradient="bg-gradient-to-br from-rose-600 to-violet-700"
          />
        </div>

        {/* Recent Projects */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-xl">Recent Projects</h2>
            <button className="text-purple-400 hover:text-purple-300 text-sm transition-colors">
              View All
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                {...project}
                onClick={() => navigate('/quest-builder')}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
