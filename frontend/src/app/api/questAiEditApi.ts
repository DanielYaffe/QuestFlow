import api from './axiosInstance';

export type AIChange =
  | {
      type: 'updateNode';
      nodeId: string;
      summary: string;
      before: { title: string; body: string; variant: string };
      after: { title: string; body: string; variant: string };
    }
  | {
      type: 'addNode';
      summary: string;
      node: { title: string; body: string; variant: string };
      connectFrom?: string;
    }
  | { type: 'deleteNode'; nodeId: string; nodeTitle: string; summary: string }
  | {
      type: 'addEdge';
      source: string;
      target: string;
      sourceTitle: string;
      targetTitle: string;
      summary: string;
    }
  | {
      type: 'deleteEdge';
      source: string;
      target: string;
      sourceTitle: string;
      targetTitle: string;
      summary: string;
    };

export async function requestAiEdit(
  questlineId: string,
  payload: { instruction: string; nodes: unknown[]; edges: unknown[] },
): Promise<{ changes: AIChange[] }> {
  const { data } = await api.post(`/questlines/${questlineId}/ai-edit`, payload);
  return data;
}
