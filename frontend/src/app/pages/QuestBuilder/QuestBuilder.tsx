import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Node,
  type Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, Crosshair } from 'lucide-react';
import { QuestNode } from './components/QuestNode';
import { QuestBuilderHeader } from './components/QuestBuilderHeader';
import { ProjectSidebar } from './components/ProjectSidebar';
import { AISidebar } from '../../components/shared/AISidebar';
import { NodeEditSidebar, NodeSnapshot } from './components/NodeEditSidebar';
import { getLayoutedElements } from '../../utils/layoutUtils';
import { QuestNodeData, NodeVariant } from '../../types/quest';
import { useQuestlineData } from './hooks/useQuestlineData';
import { fetchRewards } from '../../api/projectSidebarApi';
import { listCharacters } from '../../api/characterApi';
import { fetchQuestlineMeta, saveQuestlineGraph } from '../../api/questBuilderApi';
import { toast } from 'sonner';

const nodeTypes = {
  questNode: QuestNode,
} satisfies NodeTypes;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// Stable serialization of only the persisted graph fields, so transient UI churn
// (selection, drag positions, injected callbacks/name maps, layout direction)
// doesn't register as an unsaved change.
function graphSignature(nodes: Node<QuestNodeData>[], edges: Edge[]): string {
  return JSON.stringify({
    n: nodes.map((nd) => ({
      id:         nd.id,
      type:       nd.type,
      title:      nd.data.title,
      body:       nd.data.body,
      variant:    nd.data.variant ?? 'story',
      npcIds:     nd.data.npcIds     ?? [],
      monsterIds: nd.data.monsterIds ?? [],
      rewardIds:  nd.data.rewardIds  ?? [],
    })),
    e: edges.map((ed) => ({ id: ed.id, source: ed.source, target: ed.target })),
  });
}

function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <Panel position="bottom-right" style={{ marginBottom: '120px' }}>
      <button
        onClick={() => fitView({ padding: 0.15, duration: 400 })}
        title="Center view"
        className="w-8 h-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors shadow-md"
      >
        <Crosshair className="w-4 h-4" />
      </button>
    </Panel>
  );
}

// Separate component so it can call useReactFlow (must be inside ReactFlow provider)
function AutoLayoutTrigger({ trigger }: { trigger: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (trigger > 0) {
      // Small delay so React Flow has time to update node positions before fitting
      const id = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50);
      return () => clearTimeout(id);
    }
  }, [trigger, fitView]);
  return null;
}

// Pans/centres the viewport onto a node when asked from outside the flow (e.g. the
// Quests tab in the side panel). The nonce makes repeat clicks on the same node fire.
function FocusNodeController({ target }: { target: { nodeId: string; nonce: number } | null }) {
  const { getNode, setCenter, getZoom } = useReactFlow();
  useEffect(() => {
    if (!target) return;
    const node = getNode(target.nodeId);
    if (!node) return;
    const width  = node.measured?.width  ?? 300;
    const height = node.measured?.height ?? 140;
    const x = node.position.x + width / 2;
    const y = node.position.y + height / 2;
    setCenter(x, y, { zoom: Math.max(getZoom(), 1), duration: 500 });
  }, [target, getNode, setCenter, getZoom]);
  return null;
}

type PendingNode = { sourceNodeId: string; position: 'top' | 'bottom' | 'left' | 'right' };

type QuestFlowNode = Node<QuestNodeData>;

export function QuestBuilder() {
  const { questlineId = '' } = useParams<{ questlineId: string }>();
  const { nodes: fetchedNodes, edges: fetchedEdges, nextNodeId, isLoading, error } = useQuestlineData(questlineId);

  const [nodes, setNodes, onNodesChange] = useNodesState<QuestFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<QuestFlowNode | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'edit' | 'create'>('edit');
  const [pendingNode, setPendingNode] = useState<PendingNode | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(1);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('LR');
  const [layoutTrigger, setLayoutTrigger] = useState(0);
  const [focusTarget, setFocusTarget] = useState<{ nodeId: string; nonce: number } | null>(null);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editingNode, setEditingNode] = useState<{ id: string; snapshot: NodeSnapshot } | null>(null);
  const [characterNames, setCharacterNames] = useState<Record<string, string>>({});
  const [rewardNames, setRewardNames]       = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState('');
  const [autoAttachId, setAutoAttachId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const attachHandledRef = useRef(false);

  // Latest nodes/edges, so the debounced save reads current state without being
  // re-created on every change (which would keep resetting the debounce timer).
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const currentSig = useMemo(() => graphSignature(nodes, edges), [nodes, edges]);
  const isDirty = savedSig !== null && currentSig !== savedSig;

  // Resolve the owning project so we can source project-scoped characters
  useEffect(() => {
    if (!questlineId) return;
    fetchQuestlineMeta(questlineId)
      .then((meta) => setProjectId(meta.projectId))
      .catch(() => {});
  }, [questlineId]);

  // Character name map (for node cards) comes from the project character collection
  useEffect(() => {
    if (!projectId) return;
    listCharacters({ projectId })
      .then((chars) => setCharacterNames(Object.fromEntries(chars.map((c) => [c._id, c.name]))))
      .catch(() => {});
  }, [projectId]);

  // Reward name map stays sourced from the questline
  useEffect(() => {
    if (!questlineId) return;
    fetchRewards(questlineId)
      .then((rwds) => setRewardNames(Object.fromEntries(rwds.map((r) => [r.id, r.title]))))
      .catch(() => {});
  }, [questlineId]);

  // Populate graph once data is fetched and apply default horizontal layout
  useEffect(() => {
    if (fetchedNodes.length > 0) {
      const layouted = getLayoutedElements(fetchedNodes, fetchedEdges, 'LR');
      setNodes(layouted.nodes.map((n) => ({ ...n, data: { ...n.data, layoutDirection: 'LR' as const } })));
      setEdges(layouted.edges);
      setNodeIdCounter(nextNodeId);
      // Baseline for dirty-tracking: the freshly loaded graph is "saved".
      setSavedSig(graphSignature(layouted.nodes, layouted.edges));
      setSaveState('idle');
    }
  }, [fetchedNodes, fetchedEdges, nextNodeId, setNodes, setEdges]);

  // Establish a baseline for an empty questline too, so the first edit is tracked.
  useEffect(() => {
    if (!isLoading && fetchedNodes.length === 0 && savedSig === null) {
      setSavedSig(graphSignature([], []));
    }
  }, [isLoading, fetchedNodes, savedSig]);

  // Persist the graph (used by the Save button and the debounced autosave).
  const persist = useCallback(async () => {
    setSaveState('saving');
    try {
      const ns = nodesRef.current;
      const es = edgesRef.current;
      await saveQuestlineGraph(questlineId, ns, es);
      setSavedSig(graphSignature(ns, es));
      setSaveState('saved');
    } catch {
      setSaveState('error');
      toast.error('Failed to save graph');
    }
  }, [questlineId]);

  // Debounced autosave whenever the graph diverges from the last saved snapshot.
  useEffect(() => {
    if (savedSig === null || currentSig === savedSig) return;
    const id = setTimeout(() => { void persist(); }, 1500);
    return () => clearTimeout(id);
  }, [currentSig, savedSig, persist]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node as QuestFlowNode);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Focus a node from outside the canvas (Quests tab): highlight it + centre on it.
  const focusNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
      setSelectedNode(nodes.find((n) => n.id === nodeId) ?? null);
      setFocusTarget({ nodeId, nonce: Date.now() });
    },
    [setNodes, nodes],
  );

  // Keep the in-memory graph consistent when a character/reward is deleted from
  // the side panel (the backend strips the references; this mirrors it on-screen).
  const removeCharacterFromGraph = useCallback((charId: string) => {
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: {
        ...n.data,
        npcIds:     ((n.data.npcIds     as string[]) ?? []).filter((id) => id !== charId),
        monsterIds: ((n.data.monsterIds as string[]) ?? []).filter((id) => id !== charId),
      },
    })));
    setCharacterNames((prev) => {
      if (!(charId in prev)) return prev;
      const next = { ...prev };
      delete next[charId];
      return next;
    });
  }, [setNodes]);

  const removeRewardFromGraph = useCallback((rewardId: string) => {
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: {
        ...n.data,
        rewardIds: ((n.data.rewardIds as string[]) ?? []).filter((id) => id !== rewardId),
      },
    })));
    setRewardNames((prev) => {
      if (!(rewardId in prev)) return prev;
      const next = { ...prev };
      delete next[rewardId];
      return next;
    });
  }, [setNodes]);

  // Step 1: + button pressed — open sidebar in create mode
  const requestNewNode = useCallback(
    (sourceNodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => {
      setPendingNode({ sourceNodeId, position });
      setSidebarMode('create');
      setIsSidebarOpen(true);
    },
    []
  );

  // Step 2: user submits the form — place the node on the canvas
  const confirmNewNode = useCallback(
    (data: { title: string; body: string; variant: NodeVariant }) => {
      if (!pendingNode) return;
      const { sourceNodeId, position } = pendingNode;
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      const newNodeId = (nodeIdCounter + 1).toString();
      setNodeIdCounter((prev) => prev + 1);

      const offset = 250;
      const positionMap = {
        top:    { x: sourceNode.position.x,          y: sourceNode.position.y - offset },
        bottom: { x: sourceNode.position.x,          y: sourceNode.position.y + offset },
        left:   { x: sourceNode.position.x - offset, y: sourceNode.position.y },
        right:  { x: sourceNode.position.x + offset, y: sourceNode.position.y },
      };

      const newNode: QuestFlowNode = {
        id: newNodeId,
        type: 'questNode',
        position: positionMap[position],
        data: { ...data, layoutDirection, onAddPath: (pos) => requestNewNode(newNodeId, pos) },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [
        ...eds,
        {
          id: `e${sourceNodeId}-${newNodeId}`,
          source: sourceNodeId,
          target: newNodeId,
          type: 'smoothstep',
          animated: false,
        },
      ]);
      setPendingNode(null);
    },
    [pendingNode, nodes, nodeIdCounter, setNodes, setEdges, requestNewNode]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
        setIsSidebarOpen(false);
      }
    },
    [setNodes, setEdges, selectedNode]
  );

  const changeNodeVariant = useCallback(
    (nodeId: string, variant: NodeVariant) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, variant } } : node
        )
      );
    },
    [setNodes]
  );

  const openEditSidebar = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId);
        if (node) {
          setEditingNode({
            id: nodeId,
            snapshot: {
              title:      node.data.title,
              body:       node.data.body,
              variant:    (node.data.variant as NodeVariant) ?? 'story',
              npcIds:     (node.data.npcIds     as string[]) ?? [],
              monsterIds: (node.data.monsterIds as string[]) ?? [],
              rewardIds:  (node.data.rewardIds  as string[]) ?? [],
            },
          });
        }
        return nds;
      });
    },
    [setNodes]
  );

  const updateNode = useCallback(
    (nodeId: string, updated: NodeSnapshot) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...updated } }
            : node
        )
      );
    },
    [setNodes]
  );

  // Returning from the "+ Create new" character flow (?attachNode=&attachChar=):
  // reopen the node editor for that node and auto-attach the new character.
  useEffect(() => {
    if (attachHandledRef.current || nodes.length === 0) return;
    const attachNode = searchParams.get('attachNode');
    const attachChar = searchParams.get('attachChar');
    if (!attachNode || !attachChar) return;
    attachHandledRef.current = true;
    setAutoAttachId(attachChar);
    openEditSidebar(attachNode);
    setSearchParams({}, { replace: true });
  }, [nodes, searchParams, openEditSidebar, setSearchParams]);

  // Attach interaction callbacks and name maps to every node whenever they update
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          characterNames,
          rewardNames,
          onAddPath: (pos: 'top' | 'bottom' | 'left' | 'right') => requestNewNode(node.id, pos),
          onDelete: () => deleteNode(node.id),
          onChangeVariant: (variant: NodeVariant) => changeNodeVariant(node.id, variant),
          onEdit: () => openEditSidebar(node.id),
        },
      }))
    );
  }, [requestNewNode, deleteNode, changeNodeVariant, openEditSidebar, characterNames, rewardNames]);

  const handleAutoLayout = useCallback((direction: 'TB' | 'LR') => {
    setLayoutDirection(direction);
    const layouted = getLayoutedElements(nodes, edges, direction);
    setNodes(layouted.nodes.map((n) => ({ ...n, data: { ...n.data, layoutDirection: direction } })));
    setEdges(layouted.edges);
    setLayoutTrigger((t) => t + 1);
  }, [nodes, edges, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-zinc-400 text-sm">Loading questline...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="bg-zinc-900 border border-red-800 rounded-xl px-8 py-6 text-center max-w-sm">
          <p className="text-red-400 mb-2">Failed to load questline</p>
          <p className="text-zinc-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <QuestBuilderHeader
        selectedNode={selectedNode}
        onOpenSidebar={() => { setSidebarMode('edit'); setIsSidebarOpen(true); }}
        onAutoLayout={handleAutoLayout}
        layoutDirection={layoutDirection}
        isSidebarOpen={isLeftSidebarOpen}
        onToggleSidebar={() => setIsLeftSidebarOpen((v) => !v)}
        onSave={persist}
        saveState={saveState}
        isDirty={isDirty}
      />

      {/* Canvas */}
      <div className="flex-1 relative">
        <ProjectSidebar
          questlineId={questlineId}
          isOpen={isLeftSidebarOpen}
          onQuestClick={focusNode}
          onCharacterDeleted={removeCharacterFromGraph}
          onRewardDeleted={removeRewardFromGraph}
        />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-zinc-900"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="#52525b" gap={20} size={1.5} />
          <Controls className="!bg-zinc-800 !border-zinc-700 [&_button]:!bg-zinc-800 [&_button]:!border-zinc-700 [&_button]:!text-zinc-300 hover:[&_button]:!bg-zinc-700" />
          <MiniMap
            className="!bg-zinc-900 !border-zinc-800"
            nodeColor={(node) => {
              const variant = (node.data as QuestNodeData).variant;
              const colors = { story: '#7c3aed', combat: '#ef4444', dialogue: '#3b82f6', treasure: '#f59e0b' };
              return colors[variant || 'story'];
            }}
            maskColor="rgba(0, 0, 0, 0.6)"
          />
          <FitViewButton />
          <AutoLayoutTrigger trigger={layoutTrigger} />
          <FocusNodeController target={focusTarget} />
        </ReactFlow>

        <div className="absolute top-4 left-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg px-4 py-3 z-10">
          <p className="text-zinc-400 text-sm">Click a node to edit • Hover for + buttons • Drag to connect paths</p>
        </div>

        <div className="absolute bottom-4 left-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg p-4 z-10">
          <h3 className="text-white text-sm mb-2">Node Types</h3>
          <div className="space-y-2">
            {[
              { color: 'bg-purple-500', label: 'Story' },
              { color: 'bg-red-500', label: 'Combat' },
              { color: 'bg-blue-500', label: 'Dialogue' },
              { color: 'bg-amber-500', label: 'Treasure' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-3 h-3 ${color} rounded-full`} />
                <span className="text-zinc-400 text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create-node sidebar (+ button flow) or AI chat sidebar */}
      <AISidebar
        isOpen={isSidebarOpen}
        mode={sidebarMode}
        onClose={() => {
          setIsSidebarOpen(false);
          setPendingNode(null);
          setSidebarMode('edit');
        }}
        selectedNodeTitle={selectedNode?.data.title}
        onCreateNode={confirmNewNode}
      />

      {/* Edit-node sidebar (click node flow) */}
      <NodeEditSidebar
        isOpen={editingNode !== null}
        node={editingNode?.snapshot ?? null}
        questlineId={questlineId}
        projectId={projectId}
        nodeId={editingNode?.id ?? ''}
        autoAttachId={autoAttachId}
        onClose={() => { setEditingNode(null); setAutoAttachId(null); }}
        onApply={(updated) => {
          if (editingNode) updateNode(editingNode.id, updated);
          setEditingNode(null);
          setAutoAttachId(null);
        }}
      />
    </div>
  );
}
