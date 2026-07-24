import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useReducer,
} from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Crosshair } from "lucide-react";
import { QuestNode } from "./components/QuestNode";
import { QuestBuilderHeader } from "./components/QuestBuilderHeader";
import { BuilderDock } from "./components/BuilderDock";
import { CreateNodeSidebar } from "./components/CreateNodeSidebar";
import { NodeEditSidebar, NodeSnapshot } from "./components/NodeEditSidebar";
import { getLayoutedElements } from "../../utils/layoutUtils";
import { useQuestlineData } from "./hooks/useQuestlineData";
import { useProject } from "../../context/ProjectContext";
import {
  QuestFlowNode,
  defaultExportFields,
  edgesForPreQuest,
  incomingPreQuestForNode,
  syncNodePreQuestFromEdges,
} from "./hooks/useQuestGraphSync";
import { fetchRewards } from "../../api/projectSidebarApi";
import { listCharacters } from "../../api/characterApi";
import {
  fetchQuestlineMeta,
  saveQuestlineGraph,
} from "../../api/questBuilderApi";
import { ExportDialog } from "./components/ExportDialog";
import { AIEditPanel } from "./components/AIEditPanel";
import { AIChange } from "../../api/questAiEditApi";
import { NodeVariant } from "@/types/quest";

const nodeTypes = {
  questNode: QuestNode,
} satisfies NodeTypes;

function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <Panel position="top-right">
      <button
        onClick={() => fitView({ padding: 0.15, duration: 400 })}
        title="Center view"
        className="w-8 h-8 flex items-center justify-center bg-steel-800 border border-steel-600 rounded-md text-steel-200 hover:bg-steel-700 hover:text-steel-100 transition-colors shadow-md cursor-pointer"
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
      const id = setTimeout(
        () => fitView({ padding: 0.15, duration: 400 }),
        50,
      );
      return () => clearTimeout(id);
    }
  }, [trigger, fitView]);
  return null;
}

// Pans/centres the viewport onto a node when asked from outside the flow (e.g. the
// Quests tab in the side panel). The nonce makes repeat clicks on the same node fire.
function FocusNodeController({
  target,
}: {
  target: { nodeId: string; nonce: number } | null;
}) {
  const { getNode, setCenter, getZoom } = useReactFlow();
  useEffect(() => {
    if (!target) return;
    const node = getNode(target.nodeId);
    if (!node) return;
    const width = node.measured?.width ?? 300;
    const height = node.measured?.height ?? 140;
    const x = node.position.x + width / 2;
    const y = node.position.y + height / 2;
    setCenter(x, y, { zoom: Math.max(getZoom(), 1), duration: 500 });
  }, [target, getNode, setCenter, getZoom]);
  return null;
}

type PendingNode = {
  sourceNodeId: string;
  position: "top" | "bottom" | "left" | "right";
};

type GraphSnapshot = { nodes: QuestFlowNode[]; edges: Edge[] };

export function QuestBuilder() {
  const { questlineId = "" } = useParams<{ questlineId: string }>();
  const navigate = useNavigate();
  const { activeProjectId } = useProject();
  const {
    projectId: questlineProjectId,
    nodes: fetchedNodes,
    edges: fetchedEdges,
    nextNodeId,
    template,
    isLoading,
    error,
  } = useQuestlineData(questlineId);

  // This questline belongs to one project. If the user switches the active
  // project (here or anywhere — switcher, Projects page), leave the builder so
  // they aren't stranded editing a quest outside the active project.
  useEffect(() => {
    if (
      questlineProjectId &&
      activeProjectId &&
      questlineProjectId !== activeProjectId
    ) {
      navigate("/quest-builder", { replace: true });
    }
  }, [questlineProjectId, activeProjectId, navigate]);

  const [nodes, setNodes, onNodesChange] = useNodesState<QuestFlowNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<QuestFlowNode | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingNode, setPendingNode] = useState<PendingNode | null>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(1);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [layoutDirection, setLayoutDirection] = useState<"TB" | "LR">("LR");
  const [layoutTrigger, setLayoutTrigger] = useState(0);
  const [focusTarget, setFocusTarget] = useState<{
    nodeId: string;
    nonce: number;
  } | null>(null);
  const [editingNode, setEditingNode] = useState<{
    id: string;
    snapshot: NodeSnapshot;
  } | null>(null);
  const [characterNames, setCharacterNames] = useState<Record<string, string>>(
    {},
  );
  const [rewardNames, setRewardNames] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState("");
  const [autoAttachId, setAutoAttachId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const attachHandledRef = useRef(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAiEditOpen, setIsAiEditOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // ── Undo / redo history ──────────────────────────────────────────────────
  // Each entry is a full graph snapshot taken *before* a discrete content change
  // (node add/delete, node edit, AI apply). Refs hold the stacks so undo/redo stay
  // correct under rapid clicks; a version counter forces the toolbar buttons to re-render.
  const undoStackRef = useRef<GraphSnapshot[]>([]);
  const redoStackRef = useRef<GraphSnapshot[]>([]);
  const [, bumpHistory] = useReducer((x: number) => x + 1, 0);

  const pushHistory = useCallback(() => {
    undoStackRef.current = [
      ...undoStackRef.current,
      { nodes: nodesRef.current, edges: edgesRef.current },
    ];
    redoStackRef.current = [];
    bumpHistory();
  }, []);

  // Eagerly sync the refs before setState so two rapid undo/redo clicks read fresh
  // values (nodesRef/edgesRef are otherwise only updated by an effect after render).
  const restoreSnapshot = useCallback(
    (snap: GraphSnapshot) => {
      nodesRef.current = snap.nodes;
      edgesRef.current = snap.edges;
      setNodes(snap.nodes);
      setEdges(snap.edges);
      markUnsaved();
      // markUnsaved intentionally omitted from deps — it is declared later in this
      // component; referencing it here at call time is safe, but adding it to the
      // dependency array would hit the temporal dead zone at render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    redoStackRef.current = [
      ...redoStackRef.current,
      { nodes: nodesRef.current, edges: edgesRef.current },
    ];
    undoStackRef.current = stack.slice(0, -1);
    restoreSnapshot(stack[stack.length - 1]);
    bumpHistory();
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    undoStackRef.current = [
      ...undoStackRef.current,
      { nodes: nodesRef.current, edges: edgesRef.current },
    ];
    redoStackRef.current = stack.slice(0, -1);
    restoreSnapshot(stack[stack.length - 1]);
    bumpHistory();
  }, [restoreSnapshot]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  // Resolve the owning project so we can source project-scoped characters
  useEffect(() => {
    if (!questlineId) return;
    fetchQuestlineMeta(questlineId)
      .then((meta) => setProjectId(meta.projectId ?? ""))
      .catch(() => {});
  }, [questlineId]);

  // Character name map (for node cards) comes from the project character collection
  useEffect(() => {
    if (!projectId) return;
    listCharacters({ projectId })
      .then((chars) =>
        setCharacterNames(
          Object.fromEntries(chars.map((c) => [c._id, c.name])),
        ),
      )
      .catch(() => {});
  }, [projectId]);

  // Reward name map stays sourced from the questline
  useEffect(() => {
    if (!questlineId) return;
    fetchRewards(questlineId)
      .then((rwds) =>
        setRewardNames(Object.fromEntries(rwds.map((r) => [r.id, r.title]))),
      )
      .catch(() => {});
  }, [questlineId]);

  // Populate graph once data is fetched and apply default horizontal layout
  useEffect(() => {
    if (fetchedNodes.length > 0) {
      const layouted = getLayoutedElements(fetchedNodes, fetchedEdges, "LR");
      const layoutedNodes = layouted.nodes.map((n) => ({
        ...n,
        data: { ...n.data, layoutDirection: "LR" as const },
      }));
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
    [setEdges, setNodes],
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

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: QuestFlowNode) => {
      setSelectedNode(node);
    },
    [],
  );

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
  const removeCharacterFromGraph = useCallback(
    (charId: string) => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            npcIds: ((n.data.npcIds as string[]) ?? []).filter(
              (id) => id !== charId,
            ),
            monsterIds: ((n.data.monsterIds as string[]) ?? []).filter(
              (id) => id !== charId,
            ),
          },
        })),
      );
      setCharacterNames((prev) => {
        if (!(charId in prev)) return prev;
        const next = { ...prev };
        delete next[charId];
        return next;
      });
    },
    [setNodes],
  );

  const removeRewardFromGraph = useCallback(
    (rewardId: string) => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            rewardIds: ((n.data.rewardIds as string[]) ?? []).filter(
              (id) => id !== rewardId,
            ),
          },
        })),
      );
      setRewardNames((prev) => {
        if (!(rewardId in prev)) return prev;
        const next = { ...prev };
        delete next[rewardId];
        return next;
      });
    },
    [setNodes],
  );

  // Step 1: + button pressed — open the create-node sidebar
  const requestNewNode = useCallback(
    (sourceNodeId: string, position: "top" | "bottom" | "left" | "right") => {
      setPendingNode({ sourceNodeId, position });
      setIsSidebarOpen(true);
    },
    [],
  );

  // Step 2: user submits the form — place the node on the canvas
  const confirmNewNode = useCallback(
    (data: { title: string; body: string; variant: NodeVariant }) => {
      if (!pendingNode) return;
      const { sourceNodeId, position } = pendingNode;
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      pushHistory();

      const newNodeId = (nodeIdCounter + 1).toString();
      setNodeIdCounter((prev) => prev + 1);

      const offset = 250;
      const positionMap = {
        top: { x: sourceNode.position.x, y: sourceNode.position.y - offset },
        bottom: { x: sourceNode.position.x, y: sourceNode.position.y + offset },
        left: { x: sourceNode.position.x - offset, y: sourceNode.position.y },
        right: { x: sourceNode.position.x + offset, y: sourceNode.position.y },
      };

      const newNode: QuestFlowNode = {
        id: newNodeId,
        type: "questNode",
        position: positionMap[position],
        data: {
          ...data,
          exportFields: defaultExportFields(newNodeId),
          templateValues: {},
          layoutDirection,
          onAddPath: (pos: "top" | "bottom" | "left" | "right") =>
            requestNewNode(newNodeId, pos),
        },
      };
      const newEdge: Edge = {
        id: `e${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        type: "smoothstep",
        animated: false,
      };
      const nextEdges = [...edgesRef.current, newEdge];

      setNodes((nds) =>
        syncNodePreQuestFromEdges([...nds, newNode], nextEdges),
      );
      setEdges(nextEdges);
      setPendingNode(null);
      markUnsaved();
    },
    [
      pendingNode,
      nodes,
      nodeIdCounter,
      setNodes,
      setEdges,
      requestNewNode,
      pushHistory,
    ],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nextEdges = edgesRef.current.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      );
      setNodes((nds) =>
        syncNodePreQuestFromEdges(
          nds.filter((node) => node.id !== nodeId),
          nextEdges,
        ),
      );
      setEdges(nextEdges);
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
        setIsSidebarOpen(false);
      }
      markUnsaved();
    },
    [setNodes, setEdges, selectedNode],
  );

  const changeNodeVariant = useCallback(
    (nodeId: string, variant: NodeVariant) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, variant } }
            : node,
        ),
      );
      markUnsaved();
    },
    [setNodes],
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
              title: node.data.title,
              body: node.data.body,
              variant: (node.data.variant as NodeVariant) ?? "story",
              npcIds: (node.data.npcIds as string[]) ?? [],
              monsterIds: (node.data.monsterIds as string[]) ?? [],
              rewardIds: (node.data.rewardIds as string[]) ?? [],
              exportFields,
              templateValues: node.data.templateValues as
                | Record<string, unknown>
                | undefined,
            },
          });
        }
        return nds;
      });
    },
    [setNodes],
  );

  const updateNode = useCallback(
    (nodeId: string, updated: NodeSnapshot) => {
      const nextEdges = edgesForPreQuest(
        nodeId,
        updated.exportFields?.preQuest ?? [-1],
        nodesRef.current,
        edgesRef.current,
      );
      setEdges(nextEdges);
      setNodes((nds) =>
        syncNodePreQuestFromEdges(
          nds.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, ...updated } }
              : node,
          ),
          nextEdges,
        ),
      );
      markUnsaved();
    },
    [setNodes, setEdges],
  );

  // Returning from the "+ Create new" character flow (?attachNode=&attachChar=):
  // reopen the node editor for that node and auto-attach the new character.
  useEffect(() => {
    if (attachHandledRef.current || nodes.length === 0) return;
    const attachNode = searchParams.get("attachNode");
    const attachChar = searchParams.get("attachChar");
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
          onAddPath: (pos: "top" | "bottom" | "left" | "right") =>
            requestNewNode(node.id, pos),
          onDelete: () => {
            pushHistory();
            deleteNode(node.id);
          },
          onChangeVariant: (variant: NodeVariant) =>
            changeNodeVariant(node.id, variant),
          onEdit: () => openEditSidebar(node.id),
        },
      })),
    );
  }, [
    requestNewNode,
    deleteNode,
    changeNodeVariant,
    openEditSidebar,
    characterNames,
    rewardNames,
    pushHistory,
  ]);

  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await saveQuestlineGraph(
          questlineId,
          nodesRef.current,
          edgesRef.current,
        );
        setHasUnsavedChanges(false);
      } catch {
        // will retry on next change
      } finally {
        setIsSaving(false);
      }
    }, 0);
  }, [questlineId]);

  const handleAutoLayout = useCallback(
    (direction: "TB" | "LR") => {
      setLayoutDirection(direction);
      const layouted = getLayoutedElements(nodes, edges, direction);
      setNodes(
        layouted.nodes.map((n) => ({
          ...n,
          data: { ...n.data, layoutDirection: direction },
        })),
      );
      setEdges(layouted.edges);
      setLayoutTrigger((t) => t + 1);
    },
    [nodes, edges, setNodes, setEdges],
  );

  const clearNodeHighlight = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, aiHighlight: undefined } }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const applyAiChange = useCallback(
    (change: AIChange) => {
      const HIGHLIGHT_MS = 4000;

      switch (change.type) {
        case "updateNode": {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === change.nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      title: change.after.title,
                      body: change.after.body,
                      variant: change.after.variant,
                      aiHighlight: "updated",
                    },
                  }
                : n,
            ),
          );
          setTimeout(() => clearNodeHighlight(change.nodeId), HIGHLIGHT_MS);
          markUnsaved();
          break;
        }
        case "addNode": {
          const newId = (nodeIdCounter + 1).toString();
          setNodeIdCounter((prev) => prev + 1);
          const sourceNode = change.connectFrom
            ? nodes.find((n) => n.id === change.connectFrom)
            : null;
          const position = sourceNode
            ? { x: sourceNode.position.x + 300, y: sourceNode.position.y }
            : { x: 200, y: 200 };
          const newNode: QuestFlowNode = {
            id: newId,
            type: "questNode",
            position,
            data: {
              ...change.node,
              layoutDirection,
              aiHighlight: "added",
              onAddPath: (pos: "top" | "bottom" | "left" | "right") =>
                requestNewNode(newId, pos),
            },
          };
          if (change.connectFrom) {
            const edgeId = `e${change.connectFrom}-${newId}`;
            const nextEdges = [
              ...edgesRef.current,
              {
                id: edgeId,
                source: change.connectFrom,
                target: newId,
                type: "smoothstep",
                animated: true,
              },
            ];
            setNodes((nds) =>
              syncNodePreQuestFromEdges([...nds, newNode], nextEdges),
            );
            setEdges(nextEdges);
            setTimeout(() => {
              setEdges((eds) =>
                eds.map((e) =>
                  e.id === edgeId ? { ...e, animated: false } : e,
                ),
              );
            }, HIGHLIGHT_MS);
          } else {
            setNodes((nds) => [...nds, newNode]);
          }
          setTimeout(() => clearNodeHighlight(newId), HIGHLIGHT_MS);
          markUnsaved();
          break;
        }
        case "deleteNode": {
          // deleteNode already calls markUnsaved
          deleteNode(change.nodeId);
          return;
        }
        case "addEdge": {
          const edgeId = `e${change.source}-${change.target}`;
          if (edgesRef.current.find((e) => e.id === edgeId)) return;
          const nextEdges = [
            ...edgesRef.current,
            {
              id: edgeId,
              source: change.source,
              target: change.target,
              type: "smoothstep",
              animated: true,
            },
          ];
          setEdges(nextEdges);
          setNodes((nds) => syncNodePreQuestFromEdges(nds, nextEdges));
          setTimeout(() => {
            setEdges((eds) =>
              eds.map((e) => (e.id === edgeId ? { ...e, animated: false } : e)),
            );
          }, HIGHLIGHT_MS);
          markUnsaved();
          break;
        }
        case "deleteEdge": {
          const nextEdges = edgesRef.current.filter(
            (e) => !(e.source === change.source && e.target === change.target),
          );
          setEdges(nextEdges);
          setNodes((nds) => syncNodePreQuestFromEdges(nds, nextEdges));
          markUnsaved();
          break;
        }
      }
    },
    [
      nodes,
      nodeIdCounter,
      setNodes,
      setEdges,
      setNodeIdCounter,
      layoutDirection,
      requestNewNode,
      deleteNode,
      markUnsaved,
      clearNodeHighlight,
    ],
  );

  // Apply a batch of AI-Edit changes as one undoable step: snapshot once, then apply
  // all. A single approval passes a one-element array, so it stays one undo step too.
  const applyAiChangesWithUndo = useCallback(
    (changes: AIChange[]) => {
      if (changes.length === 0) return;
      pushHistory();
      changes.forEach(applyAiChange);
    },
    [pushHistory, applyAiChange],
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-pulse animate-spin" />
          <p className="text-steel-400 text-sm">Loading questline...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <div className="bg-steel-850 border border-red-800 rounded-md px-8 py-6 text-center max-w-sm">
          <p className="text-red-400 mb-2">Failed to load questline</p>
          <p className="text-steel-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <QuestBuilderHeader
        onAutoLayout={handleAutoLayout}
        layoutDirection={layoutDirection}
        isSidebarOpen={isLeftSidebarOpen}
        onToggleSidebar={() => setIsLeftSidebarOpen((v) => !v)}
        onExport={() => setIsExportOpen(true)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        isAiEditOpen={isAiEditOpen}
        onOpenAiEdit={() => {
          setEditingNode(null);
          setIsAiEditOpen(true);
        }}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Canvas */}
      <div className="flex-1 relative">
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
          className="bg-steel-850"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#2a323b"
            gap={20}
            size={1.5}
          />
          <Controls className="!bg-steel-800 !border-steel-600 [&_button]:!bg-steel-800 [&_button]:!border-steel-600 [&_button]:!text-steel-200 hover:[&_button]:!bg-steel-700" />
          <FitViewButton />
          <AutoLayoutTrigger trigger={layoutTrigger} />
          <FocusNodeController target={focusTarget} />
        </ReactFlow>

        <div className="absolute top-4 left-4 bg-steel-850/90 backdrop-blur-sm border border-steel-700 rounded-lg px-4 py-3 z-10">
          <p className="text-steel-400 text-sm">
            Click a node to edit • Hover for + buttons • Drag to connect paths
          </p>
        </div>
      </div>

      {/* Bottom dock: quests / characters / mobs / items */}
      <BuilderDock
        questlineId={questlineId}
        isOpen={isLeftSidebarOpen}
        onQuestClick={focusNode}
        onCharacterDeleted={removeCharacterFromGraph}
        onRewardDeleted={removeRewardFromGraph}
      />

      {/* Create-node sidebar (+ button flow) */}
      <CreateNodeSidebar
        isOpen={isSidebarOpen}
        onClose={() => {
          setIsSidebarOpen(false);
          setPendingNode(null);
        }}
        onCreateNode={confirmNewNode}
      />

      {/* Edit-node sidebar (click node flow) */}
      <NodeEditSidebar
        isOpen={editingNode !== null}
        node={editingNode?.snapshot ?? null}
        questlineId={questlineId}
        projectId={projectId}
        nodeId={editingNode?.id ?? ""}
        nodes={nodes}
        edges={edges}
        autoAttachId={autoAttachId}
        template={template ?? null}
        onClose={() => {
          setEditingNode(null);
          setAutoAttachId(null);
        }}
        onApply={(updated) => {
          if (editingNode) {
            pushHistory();
            updateNode(editingNode.id, updated);
          }
          setEditingNode(null);
          setAutoAttachId(null);
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
        onApplyChanges={applyAiChangesWithUndo}
      />
    </div>
  );
}
