import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, ArrowRight, CheckCircle2, Circle, Lock } from 'lucide-react';

interface QuestNode {
  id: string;
  name: string;
  x: number;
  y: number;
  status: 'completed' | 'active' | 'locked';
  variant: 'story' | 'combat' | 'dialogue' | 'treasure';
}

interface QuestEdge {
  from: string;
  to: string;
}

interface FeaturedProjectProps {
  title: string;
  subtitle: string;
  nodes: QuestNode[];
  edges: QuestEdge[];
  completedCount: number;
  totalCount: number;
  gradient: string;
}

const variantColor: Record<string, string> = {
  story: '#7c3aed',
  combat: '#ef4444',
  dialogue: '#3b82f6',
  treasure: '#f59e0b',
};

const statusStroke: Record<string, string> = {
  completed: '#4ade80',
  active: '#a78bfa',
  locked: '#3f3f46',
};

const CANVAS_W = 680;
const CANVAS_H = 260;
const NODE_W = 130;
const NODE_H = 44;
const R = 6;

export function FeaturedProject({
  title,
  subtitle,
  nodes,
  edges,
  completedCount,
  totalCount,
  gradient,
}: FeaturedProjectProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Banner */}
      <div className={`${gradient} px-8 py-6 flex items-center justify-between`}>
        <div>
          <p className="text-white/60 text-sm mb-1">Featured Project</p>
          <h2 className="text-white text-2xl font-semibold">{title}</h2>
          <p className="text-white/70 text-sm mt-1">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-white/60 text-sm mb-1">Progress</p>
          <p className="text-white text-3xl font-bold">
            {completedCount}
            <span className="text-white/50 text-xl">/{totalCount}</span>
          </p>
        </div>
      </div>

      {/* Mini graph preview */}
      <div className="bg-zinc-950 border-b border-zinc-800 px-4 py-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          width="100%"
          height={CANVAS_H}
          style={{ minWidth: CANVAS_W }}
        >
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#52525b" />
            </marker>
            <marker id="arrow-done" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#4ade80" />
            </marker>
            <marker id="arrow-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#a78bfa" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge) => {
            const from = nodes.find((n) => n.id === edge.from);
            const to = nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;

            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;

            const edgeStatus = from.status === 'completed' ? 'done'
              : from.status === 'active' ? 'active'
              : 'locked';

            const stroke = edgeStatus === 'done' ? '#4ade80'
              : edgeStatus === 'active' ? '#a78bfa'
              : '#3f3f46';

            const markerId = edgeStatus === 'done' ? 'url(#arrow-done)'
              : edgeStatus === 'active' ? 'url(#arrow-active)'
              : 'url(#arrow)';

            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                stroke={stroke}
                strokeWidth={edgeStatus === 'locked' ? 1.5 : 2}
                strokeDasharray={edgeStatus === 'locked' ? '4,3' : undefined}
                markerEnd={markerId}
                opacity={edgeStatus === 'locked' ? 0.4 : 1}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isCompleted = node.status === 'completed';
            const isActive = node.status === 'active';
            const fill = isCompleted ? '#052e16'
              : isActive ? '#1e1b4b'
              : '#18181b';
            const stroke = statusStroke[node.status];
            const accentBar = variantColor[node.variant];
            const textColor = isCompleted ? '#4ade80'
              : isActive ? '#c4b5fd'
              : '#71717a';

            return (
              <g key={node.id}>
                {/* Card bg */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={R}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActive ? 1.5 : 1}
                  opacity={node.status === 'locked' ? 0.45 : 1}
                />
                {/* Left accent bar */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={3}
                  height={NODE_H}
                  rx={R}
                  fill={accentBar}
                  opacity={node.status === 'locked' ? 0.3 : 0.8}
                />
                {/* Quest name */}
                <text
                  x={node.x + 12}
                  y={node.y + NODE_H / 2 - 4}
                  fill={textColor}
                  fontSize={9}
                  fontWeight="600"
                  fontFamily="sans-serif"
                >
                  {node.name.length > 17 ? node.name.slice(0, 16) + '…' : node.name}
                </text>
                {/* Status label */}
                <text
                  x={node.x + 12}
                  y={node.y + NODE_H / 2 + 10}
                  fill={textColor}
                  fontSize={7.5}
                  fontFamily="sans-serif"
                  opacity={0.7}
                >
                  {isCompleted ? '✓ Completed' : isActive ? '● Active' : '🔒 Locked'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Quest list */}
      <div className="p-6">
        <div className="grid grid-cols-2 gap-3">
          {nodes.map((node) => {
            const isCompleted = node.status === 'completed';
            const isActive = node.status === 'active';
            const isLocked = node.status === 'locked';
            return (
              <div
                key={node.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                  isCompleted ? 'bg-green-950/20 border-green-800/40'
                  : isActive ? 'bg-purple-950/30 border-purple-600/50'
                  : 'bg-zinc-900/50 border-zinc-800/50 opacity-50'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                ) : isActive ? (
                  <Circle className="w-4 h-4 text-purple-400 animate-pulse flex-shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                )}
                <span className={`text-xs truncate ${
                  isCompleted ? 'text-green-400' : isActive ? 'text-purple-300' : 'text-zinc-500'
                }`}>
                  {node.name}
                </span>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => navigate('/quest-builder')}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
        >
          <Workflow className="w-4 h-4" />
          Open in Quest Builder
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
