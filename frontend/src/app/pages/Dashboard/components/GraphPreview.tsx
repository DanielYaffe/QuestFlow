import React from 'react';

interface GraphNode {
  id: string;
  title: string;
  variant: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphPreviewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Cyber palette: cyan for story/data, volt reserved for treasure highlights.
const VARIANT_COLOR: Record<string, string> = {
  story:    '#57c7d4',
  combat:   '#e5484d',
  dialogue: '#6ea8ff',
  treasure: '#f5d90a',
};

const NODE_W = 108;
const NODE_H = 30;
const COL_GAP = 42;
const ROW_GAP = 26;
const PAD = 8;
const MAX_NODES = 12;

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

/** Compact quest-graph preview for the dashboard hero. */
export function GraphPreview({ nodes, edges }: GraphPreviewProps) {
  const shown = nodes.slice(0, MAX_NODES);
  const shownIds = new Set(shown.map((n) => n.id));
  const shownEdges = edges.filter((e) => shownIds.has(e.source) && shownIds.has(e.target));

  const positioned = layoutNodes(shown, shownEdges);
  if (positioned.length === 0) {
    return <p className="text-steel-500 text-xs px-6 py-10">No nodes yet</p>;
  }

  const canvasW = positioned.reduce((m, n) => Math.max(m, n.x + NODE_W), 0) + PAD;
  const canvasH = positioned.reduce((m, n) => Math.max(m, n.y + NODE_H), 0) + PAD;

  return (
    <svg
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      width={canvasW}
      height={Math.min(canvasH, 170)}
      role="img"
      aria-label="Quest graph preview"
    >
      <defs>
        <marker id="gp-arrow" markerWidth="7" markerHeight="7" refX="5" refY="2.5" orient="auto">
          <path d="M0,0 L0,5 L7,2.5 z" fill="#3a4653" />
        </marker>
      </defs>

      {shownEdges.map((edge) => {
        const from = positioned.find((n) => n.id === edge.source);
        const to   = positioned.find((n) => n.id === edge.target);
        if (!from || !to) return null;
        const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
        const x2 = to.x,            y2 = to.y   + NODE_H / 2;
        const mx = (x1 + x2) / 2;
        return (
          <path key={`${edge.source}-${edge.target}`}
            d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
            fill="none" stroke="#2a323b" strokeWidth={1.5} markerEnd="url(#gp-arrow)"
          />
        );
      })}

      {positioned.map((node) => {
        const accent = VARIANT_COLOR[node.variant] ?? VARIANT_COLOR.story;
        return (
          <g key={node.id}>
            <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={4} fill="#14181d" stroke="#3a4653" strokeWidth={1} />
            <rect x={node.x} y={node.y} width={2.5} height={NODE_H} rx={1} fill={accent} />
            <text x={node.x + 10} y={node.y + NODE_H / 2 + 3.5} fill="#8b98a5" fontSize={8.5} fontWeight="600" fontFamily="sans-serif">
              {node.title.length > 16 ? node.title.slice(0, 15) + '…' : node.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
