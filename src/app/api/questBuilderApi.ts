import { Node, Edge } from '@xyflow/react';
import { QuestNodeData } from '../types/quest';
import api from './axiosInstance';

export interface QuestlineSummary {
  _id: string;
  title: string;
  description: string;
  updatedAt: string;
  nodeCount?: number;
}

export async function fetchQuestlines(): Promise<QuestlineSummary[]> {
  const { data } = await api.get('/questlines');
  return data;
}

export interface QuestlineData {
  nodes: Node<QuestNodeData>[];
  edges: Edge[];
  nextNodeId: number;
}

export async function fetchQuestlineById(questlineId: string): Promise<QuestlineData> {
  const { data } = await api.get(`/questlines/${questlineId}/graph`);
  return data;
}

export async function saveQuestlineGraph(
  questlineId: string,
  nodes: Node<QuestNodeData>[],
  edges: Edge[],
): Promise<void> {
  await api.put(`/questlines/${questlineId}/graph`, { nodes, edges });
}
