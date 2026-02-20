import { Node, Edge } from '@xyflow/react';
import { QuestNodeData } from '../types/quest';

export interface QuestlineData {
  nodes: Node<QuestNodeData>[];
  edges: Edge[];
  nextNodeId: number;
}

// ---------------------------------------------------------------------------
// Stub data — replace with real API response shape when backend is ready
// ---------------------------------------------------------------------------

const STUB_NODES: Node<QuestNodeData>[] = [
  {
    id: '9001',
    type: 'questNode',
    position: { x: 250, y: 50 },
    data: {
      title: 'A World Not My Own',
      body: 'You awaken in an unfamiliar forest, far from home. The air feels unstable, as if reality itself has cracked. To survive, you must adapt and prove your resolve.',
      variant: 'story',
    },
  },
  {
    id: '9002',
    type: 'questNode',
    position: { x: 250, y: 270 },
    data: {
      title: 'Distorted Memories',
      body: 'The dimensional trace reacts to the Temple of Time. Something is altering memories within its sacred halls. You must stabilize the distortion before it spreads further.',
      variant: 'dialogue',
    },
  },
  {
    id: '9003',
    type: 'questNode',
    position: { x: 250, y: 490 },
    data: {
      title: 'Clockwork Collapse',
      body: "The distortion spreads into Ludibrium's clocktower. Broken gears grind against corrupted time. If left unchecked, the fracture may become permanent.",
      variant: 'combat',
    },
  },
  {
    id: '9004',
    type: 'questNode',
    position: { x: 50, y: 710 },
    data: {
      title: 'Dragon Suppression',
      body: 'A massive rift tears open above Leafre. Dragons fall into madness under its influence. You must thin their numbers before the sky collapses.',
      variant: 'combat',
    },
  },
  {
    id: '9005',
    type: 'questNode',
    position: { x: 450, y: 710 },
    data: {
      title: 'Rift Stabilization',
      body: 'The rift emits unstable fragments of energy. If left unchecked, it will consume Leafre entirely. Gather the fragments and weaken its unstable core.',
      variant: 'story',
    },
  },
  {
    id: '9006',
    type: 'questNode',
    position: { x: 250, y: 930 },
    data: {
      title: 'The Rift Architect',
      body: "You finally confront the being responsible for your displacement. It claims your exile was a test of this world's strength. Defeat it and reclaim your path home.",
      variant: 'treasure',
    },
  },
];

const STUB_EDGES: Edge[] = [
  { id: 'e9001-9002', source: '9001', target: '9002', type: 'smoothstep', animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } },
  { id: 'e9002-9003', source: '9002', target: '9003', type: 'smoothstep', animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } },
  { id: 'e9003-9004', source: '9003', target: '9004', type: 'smoothstep', animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } },
  { id: 'e9003-9005', source: '9003', target: '9005', type: 'smoothstep', animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } },
  { id: 'e9004-9006', source: '9004', target: '9006', type: 'smoothstep', animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } },
  { id: 'e9005-9006', source: '9005', target: '9006', type: 'smoothstep', animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } },
];

// ---------------------------------------------------------------------------
// API call — uncomment and replace stub return once backend is available
// ---------------------------------------------------------------------------

export async function fetchQuestlineById(questlineId: number): Promise<QuestlineData> {
  // --- BACKEND CALL (uncomment when API is ready) ---
  // const response = await fetch(`/api/questlines/${questlineId}`);
  // if (!response.ok) throw new Error(`Failed to fetch questline ${questlineId}`);
  // const json = await response.json();
  // return {
  //   nodes: json.nodes,   // expected: Node<QuestNodeData>[]
  //   edges: json.edges,   // expected: Edge[]
  //   nextNodeId: json.nextNodeId, // expected: number — highest existing id + 1
  // };

  // --- STUB (remove once backend is ready) ---
  await new Promise((resolve) => setTimeout(resolve, 0)); // keep async contract
  return {
    nodes: STUB_NODES,
    edges: STUB_EDGES,
    nextNodeId: 9007,
  };
}
