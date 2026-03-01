import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
import { getLayoutedElements } from '../../utils/layoutUtils';
import { QuestNodeData, NodeVariant } from '../../types/quest';
import { useQuestlineData } from './hooks/useQuestlineData';

const nodeTypes = {
  questNode: QuestNode,
} satisfies NodeTypes;

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

  // Populate graph once data is fetched and apply default horizontal layout
  useEffect(() => {
    if (fetchedNodes.length > 0) {
      const layouted = getLayoutedElements(fetchedNodes, fetchedEdges, 'LR');
      setNodes(layouted.nodes.map((n) => ({ ...n, data: { ...n.data, layoutDirection: 'LR' as const } })));
      setEdges(layouted.edges);
      setNodeIdCounter(nextNodeId);
    }
  }, [fetchedNodes, fetchedEdges, nextNodeId, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: 'smoothstep', animated: true, style: { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '6 4' } }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node as QuestFlowNode);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

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
          animated: true,
          style: { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '6 4' },
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

  // Attach interaction callbacks to every node whenever the handlers update
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onAddPath: (pos: 'top' | 'bottom' | 'left' | 'right') => requestNewNode(node.id, pos),
          onDelete: () => deleteNode(node.id),
          onChangeVariant: (variant: NodeVariant) => changeNodeVariant(node.id, variant),
          // preserve layoutDirection already set in node.data
        },
      }))
    );
  }, [requestNewNode, deleteNode, changeNodeVariant]);

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
      />

      {/* Canvas */}
      <div className="flex-1 relative">
        <ProjectSidebar questlineId={questlineId} isOpen={isLeftSidebarOpen} />
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
    </div>
  );
}
