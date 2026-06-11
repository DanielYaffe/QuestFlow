import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  type Edge,
  type Connection,
  addEdge,
  applyEdgeChanges,
  type EdgeChange,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeTypes,
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
import { useProject } from '../../context/ProjectContext';
import {
  QuestFlowNode,
  defaultExportFields,
  edgesForPreQuest,
  incomingPreQuestForNode,
  syncNodePreQuestFromEdges,
} from './hooks/useQuestGraphSync';
import { fetchCharacters, fetchRewards } from '../../api/projectSidebarApi';
import { saveQuestlineGraph } from '../../api/questBuilderApi';
import { ExportDialog } from './components/ExportDialog';
import { AIEditPanel } from './components/AIEditPanel';
import { AIChange } from '../../api/questAiEditApi';

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

export function QuestBuilder() {
  const { questlineId = '' } = useParams<{ questlineId: string }>();
  const navigate = useNavigate();
  const { activeProjectId } = useProject();
  const { projectId, nodes: fetchedNodes, edges: fetchedEdges, nextNodeId, template, isLoading, error } = useQuestlineData(questlineId);

  // This questline belongs to one project. If the user switches the active
  // project (here or anywhere — switcher, Projects page), leave the builder so
  // they aren't stranded editing a quest outside the active project.
  useEffect(() => {
    if (projectId && activeProjectId && projectId !== activeProjectId) {
      navigate('/quest-builder', { replace: true });
    }
  }, [projectId, activeProjectId, navigate]);

  const [nodes, setNodes, onNodesChange] = useNodesState<QuestFlowNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<QuestFlowNode | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'edit' | 'create'>('edit');
  const [pendingNode, setPendingNode] = useState<PendingNode | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(1);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('LR');
  const [layoutTrigger, setLayoutTrigger] = useState(0);
  const [editingNode, setEditingNode] = useState<{ id: string; snapshot: NodeSnapshot } | null>(null);
  const [characterNames, setCharacterNames] = useState<Record<string, string>>({});
  const [rewardNames, setRewardNames]       = useState<Record<string, string>>({});
  const [isExportOpen, setIsExportOpen]     = useState(false);
  const [isAiEditOpen, setIsAiEditOpen]     = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving]           = useState(false);
  const nodesRef    = useRef(nodes);
  const edgesRef    = useRef(edges);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // Fetch character + reward name maps for node card display
  useEffect(() => {
    if (!questlineId) return;
    fetchCharacters(questlineId)
      .then((chars) => setCharacterNames(Object.fromEntries(chars.map((c) => [c.id, c.name]))))
      .catch(() => {});
    fetchRewards(questlineId)
      .then((rwds) => setRewardNames(Object.fromEntries(rwds.map((r) => [r.id, r.title]))))
      .catch(() => {});
  }, [questlineId]);

  // Populate graph once data is fetched and apply default horizontal layout
  useEffect(() => {
    if (fetchedNodes.length > 0) {
      const layouted = getLayoutedElements(fetchedNodes, fetchedEdges, 'LR');
      const layoutedNodes = layouted.nodes.map((n) => ({ ...n, data: { ...n.data, layoutDirection: 'LR' as const } }));
      setNodes(syncNodePreQuestFromEdges(layoutedNodes, layouted.edges));
      setEdges(layouted.edges);
      setNodeIdCounter(nextNodeId);
    }
  }, [fetchedNodes, fetchedEdges, nextNodeId, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const nextEdges = addEdge({ ...connection }, edgesRef.current);
      setEdges(nextEdges);
      setNodes((nds) => syncNodePreQuestFromEdges(nds, nextEdges));
      markUnsaved();
    },
    [setEdges, setNodes]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edgesRef.current);
      setEdges(nextEdges);
      setNodes((nds) => syncNodePreQuestFromEdges(nds, nextEdges));
      markUnsaved();
    },
    [setEdges, setNodes],
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: QuestFlowNode) => {
    setSelectedNode(node);
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
        data: { ...data, exportFields: defaultExportFields(newNodeId), templateValues: {}, layoutDirection, onAddPath: (pos) => requestNewNode(newNodeId, pos) },
      };
      const newEdge: Edge = {
        id: `e${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        type: 'smoothstep',
        animated: false,
      };
      const nextEdges = [...edgesRef.current, newEdge];

      setNodes((nds) => syncNodePreQuestFromEdges([...nds, newNode], nextEdges));
      setEdges(nextEdges);
      setPendingNode(null);
      markUnsaved();
    },
    [pendingNode, nodes, nodeIdCounter, setNodes, setEdges, requestNewNode]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nextEdges = edgesRef.current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
      setNodes((nds) => syncNodePreQuestFromEdges(nds.filter((node) => node.id !== nodeId), nextEdges));
      setEdges(nextEdges);
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
        setIsSidebarOpen(false);
      }
      markUnsaved();
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
      markUnsaved();
    },
    [setNodes]
  );

  const openEditSidebar = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId);
        if (node) {
          const exportFields = {
            ...defaultExportFields(node.id),
            ...node.data.exportFields,
            preQuest: incomingPreQuestForNode(node.id, nds, edgesRef.current),
          };
          setEditingNode({
            id: nodeId,
            snapshot: {
              title:      node.data.title,
              body:       node.data.body,
              variant:    (node.data.variant as NodeVariant) ?? 'story',
              npcIds:     (node.data.npcIds     as string[]) ?? [],
              monsterIds: (node.data.monsterIds as string[]) ?? [],
              rewardIds:  (node.data.rewardIds  as string[]) ?? [],
              exportFields,
              templateValues: node.data.templateValues as Record<string, unknown> | undefined,
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
      const nextEdges = edgesForPreQuest(nodeId, updated.exportFields?.preQuest ?? [-1], nodesRef.current, edgesRef.current);
      setEdges(nextEdges);
      setNodes((nds) =>
        syncNodePreQuestFromEdges(nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...updated } }
            : node
        ), nextEdges)
      );
      markUnsaved();
    },
    [setNodes, setEdges]
  );

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

  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await saveQuestlineGraph(questlineId, nodesRef.current, edgesRef.current);
        setHasUnsavedChanges(false);
      } catch {
        // will retry on next change
      } finally {
        setIsSaving(false);
      }
    }, 0);
  }, [questlineId]);

  const handleAutoLayout = useCallback((direction: 'TB' | 'LR') => {
    setLayoutDirection(direction);
    const layouted = getLayoutedElements(nodes, edges, direction);
    setNodes(layouted.nodes.map((n) => ({ ...n, data: { ...n.data, layoutDirection: direction } })));
    setEdges(layouted.edges);
    setLayoutTrigger((t) => t + 1);
  }, [nodes, edges, setNodes, setEdges]);

  const clearNodeHighlight = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, aiHighlight: undefined } } : n)
    );
  }, [setNodes]);

  const applyAiChange = useCallback((change: AIChange) => {
    const HIGHLIGHT_MS = 4000;

    switch (change.type) {
      case 'updateNode': {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === change.nodeId
              ? { ...n, data: { ...n.data, title: change.after.title, body: change.after.body, variant: change.after.variant, aiHighlight: 'updated' } }
              : n,
          ),
        );
        setTimeout(() => clearNodeHighlight(change.nodeId), HIGHLIGHT_MS);
        markUnsaved();
        break;
      }
      case 'addNode': {
        const newId = (nodeIdCounter + 1).toString();
        setNodeIdCounter((prev) => prev + 1);
        const sourceNode = change.connectFrom ? nodes.find((n) => n.id === change.connectFrom) : null;
        const position = sourceNode
          ? { x: sourceNode.position.x + 300, y: sourceNode.position.y }
          : { x: 200, y: 200 };
        const newNode: QuestFlowNode = {
          id: newId,
          type: 'questNode',
          position,
          data: {
            ...change.node,
            layoutDirection,
            aiHighlight: 'added',
            onAddPath: (pos: 'top' | 'bottom' | 'left' | 'right') => requestNewNode(newId, pos),
          },
        };
        if (change.connectFrom) {
          const edgeId = `e${change.connectFrom}-${newId}`;
          const nextEdges = [...edgesRef.current, { id: edgeId, source: change.connectFrom, target: newId, type: 'smoothstep', animated: true }];
          setNodes((nds) => syncNodePreQuestFromEdges([...nds, newNode], nextEdges));
          setEdges(nextEdges);
          setTimeout(() => {
            setEdges((eds) => eds.map((e) => e.id === edgeId ? { ...e, animated: false } : e));
          }, HIGHLIGHT_MS);
        } else {
          setNodes((nds) => [...nds, newNode]);
        }
        setTimeout(() => clearNodeHighlight(newId), HIGHLIGHT_MS);
        markUnsaved();
        break;
      }
      case 'deleteNode': {
        // deleteNode already calls markUnsaved
        deleteNode(change.nodeId);
        return;
      }
      case 'addEdge': {
        const edgeId = `e${change.source}-${change.target}`;
        if (edgesRef.current.find((e) => e.id === edgeId)) return;
        const nextEdges = [...edgesRef.current, { id: edgeId, source: change.source, target: change.target, type: 'smoothstep', animated: true }];
        setEdges(nextEdges);
        setNodes((nds) => syncNodePreQuestFromEdges(nds, nextEdges));
        setTimeout(() => {
          setEdges((eds) => eds.map((e) => e.id === edgeId ? { ...e, animated: false } : e));
        }, HIGHLIGHT_MS);
        markUnsaved();
        break;
      }
      case 'deleteEdge': {
        const nextEdges = edgesRef.current.filter((e) => !(e.source === change.source && e.target === change.target));
        setEdges(nextEdges);
        setNodes((nds) => syncNodePreQuestFromEdges(nds, nextEdges));
        markUnsaved();
        break;
      }
    }
  }, [nodes, nodeIdCounter, setNodes, setEdges, setNodeIdCounter, layoutDirection, requestNewNode, deleteNode, markUnsaved, clearNodeHighlight]);

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
        onExport={() => setIsExportOpen(true)}
        isAiEditOpen={isAiEditOpen}
        onOpenAiEdit={() => { setEditingNode(null); setIsAiEditOpen(true); }}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Canvas */}
      <div className="flex-1 relative">
        <ProjectSidebar questlineId={questlineId} isOpen={isLeftSidebarOpen} />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
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
        template={template ?? null}
        onClose={() => setEditingNode(null)}
        onApply={(updated) => {
          if (editingNode) updateNode(editingNode.id, updated);
          setEditingNode(null);
        }}
      />

      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        questlineId={questlineId}
      />

      <AIEditPanel
        isOpen={isAiEditOpen}
        onClose={() => setIsAiEditOpen(false)}
        questlineId={questlineId}
        nodes={nodes}
        edges={edges}
        onApplyChange={applyAiChange}
      />
    </div>
  );
}
