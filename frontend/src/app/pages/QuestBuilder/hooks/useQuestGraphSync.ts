import { Node, type Edge } from '@xyflow/react';
import { QuestNodeData } from '../../../types/quest';

export type QuestFlowNode = Node<QuestNodeData>;

export function defaultExportFields(_nodeId: string) {
  return {
    // Deliberately absent. A node's quest id used to default to its position,
    // which put it outside the project's ID pool and gave the same number to
    // every questline's nth node. The server allocates one on save instead; a
    // node that already has an id keeps it, because the caller spreads its own
    // exportFields over these defaults.
    questId: undefined as number | undefined,
    silent: true,
    preQuest: [-1],
    daily: false,
    toKill: [],
    toCollect: [],
    rewardItems: [],
  };
}

function questIdForNode(node: QuestFlowNode): number | undefined {
  const configured = node.data.exportFields?.questId;
  if (typeof configured === 'number' && Number.isFinite(configured)) return configured;
  const parsed = Number(node.id);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function incomingPreQuestForNode(nodeId: string, graphNodes: QuestFlowNode[], graphEdges: Edge[]): number[] {
  const questIdByNodeId = new Map(
    graphNodes
      .map((node) => [node.id, questIdForNode(node)] as const)
      .filter(([, questId]) => questId !== undefined),
  );
  const incoming = graphEdges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => questIdByNodeId.get(edge.source))
    .filter((questId): questId is number => typeof questId === 'number' && Number.isFinite(questId));
  return incoming.length ? incoming : [-1];
}

export function syncNodePreQuestFromEdges(graphNodes: QuestFlowNode[], graphEdges: Edge[]): QuestFlowNode[] {
  return graphNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      exportFields: {
        ...defaultExportFields(node.id),
        ...node.data.exportFields,
        preQuest: incomingPreQuestForNode(node.id, graphNodes, graphEdges),
      },
    },
  }));
}

export function edgesForPreQuest(nodeId: string, preQuest: number[], graphNodes: QuestFlowNode[], graphEdges: Edge[]): Edge[] {
  const wanted = new Set(preQuest.filter((questId) => questId !== -1 && Number.isFinite(questId)));
  const sourceByQuestId = new Map(
    graphNodes
      .map((node) => [questIdForNode(node), node.id] as const)
      .filter(([questId, sourceId]) => questId !== undefined && sourceId !== nodeId),
  );
  const keptEdges = graphEdges.filter((edge) => edge.target !== nodeId);
  const existingIds = new Set(keptEdges.map((edge) => edge.id));
  const incomingEdges = [...wanted].flatMap((questId) => {
    const source = sourceByQuestId.get(questId);
    if (!source) return [];
    const id = `e${source}-${nodeId}`;
    return [{
      id: existingIds.has(id) ? `${id}-${questId}` : id,
      source,
      target: nodeId,
      type: 'smoothstep',
      animated: false,
    } satisfies Edge];
  });
  return [...keptEdges, ...incomingEdges];
}
