import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, ArrowRight } from 'lucide-react';

interface GraphNode {
  id: string;
  title: string;
  variant: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface FeaturedProjectProps {
  id: string;
  title: string;
  subtitle: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  gradient: string;
}

const variantColor: Record<string, string> = {
  story:    '#7c3aed',
  combat:   '#ef4444',
  dialogue: '#3b82f6',
  treasure: '#f59e0b',
};

const CANVAS_H = 220;
const NODE_W = 140;
const NODE_H = 44;
const COL_GAP = 60;
const ROW_GAP = 56;
const PAD = 12;
const R = 6;

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]) {
  if (nodes.length === 0) return [];

  const adj: Record<string, string[]> = {};
  nodes.forEach((n) => (adj[n.id] = []));
  edges.forEach((e) => { if (adj[e.source]) adj[e.source].push(e.target); });

  const col: Record<string, number> = {};
  const queue = [nodes[0].id];
  col[nodes[0].id] = 0;
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj[cur] ?? []) {
      if (col[next] === undefined) {
        col[next] = (col[cur] ?? 0) + 1;
        queue.push(next);
      }
    }
  }

  const colRows: Record<number, number> = {};
  return nodes.map((n) => {
    const c = col[n.id] ?? 0;
    const row = colRows[c] ?? 0;
    colRows[c] = row + 1;
    return { ...n, x: PAD + c * (NODE_W + COL_GAP), y: PAD + row * (NODE_H + ROW_GAP) };
  });
}

export function FeaturedProject({ id, title, subtitle, nodes, edges, gradient }: FeaturedProjectProps) {
  const navigate = useNavigate();
  const positioned = layoutNodes(nodes, edges);
  const maxX = positioned.reduce((m, n) => Math.max(m, n.x + NODE_W), 0);
  const canvasW = Math.max(maxX + PAD, 400);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Banner */}
      <div className={`${gradient} px-8 py-6 flex items-center justify-between`}>
        <div>
          <p className="text-white/60 text-sm mb-1">Featured Questline</p>
          <h2 className="text-white text-2xl font-semibold">{title}</h2>
          <p className="text-white/70 text-sm mt-1">{subtitle}</p>
        </div>
        <p className="text-white text-4xl font-bold">{nodes.length}<span className="text-white/40 text-xl ml-1">nodes</span></p>
      </div>

      {/* Mini graph preview */}
      {nodes.length > 0 ? (
        <div className="bg-zinc-950 border-b border-zinc-800 px-4 py-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${canvasW} ${CANVAS_H}`}
            width="100%"
            height={CANVAS_H}
            style={{ minWidth: Math.min(canvasW, 680) }}
          >
            <defs>
              <marker id="fp-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#52525b" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const from = positioned.find((n) => n.id === edge.source);
              const to   = positioned.find((n) => n.id === edge.target);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
              const x2 = to.x,           y2 = to.y   + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              return (
                <path key={`${edge.source}-${edge.target}`}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none" stroke="#52525b" strokeWidth={1.5} markerEnd="url(#fp-arrow)"
                />
              );
            })}

            {positioned.map((node) => {
              const accent = variantColor[node.variant] ?? variantColor.story;
              return (
                <g key={node.id}>
                  <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={R} fill="#18181b" stroke="#3f3f46" strokeWidth={1} />
                  <rect x={node.x} y={node.y} width={3} height={NODE_H} rx={R} fill={accent} opacity={0.8} />
                  <text x={node.x + 12} y={node.y + NODE_H / 2 + 4} fill="#a1a1aa" fontSize={9} fontWeight="600" fontFamily="sans-serif">
                    {node.title.length > 18 ? node.title.slice(0, 17) + '…' : node.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="bg-zinc-950 border-b border-zinc-800 h-24 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No nodes yet</p>
        </div>
      )}

      {/* Open button */}
      <div className="p-5">
        <button
          onClick={() => navigate(`/quest-builder/${id}`)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors text-sm font-medium"
        >
          <Workflow className="w-4 h-4" />
          Open in Quest Builder
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
