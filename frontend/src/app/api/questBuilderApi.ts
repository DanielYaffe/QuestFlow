import { Edge } from '@xyflow/react';
import { QuestNodeData } from '../types/quest';

// Use a local Node type alias to avoid @xyflow/react export issues
type Node<T> = { id: string; type?: string; data: T; position?: { x: number; y: number }; [key: string]: unknown };
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

export interface QuestlineMeta {
  _id: string;
  title: string;
  genre: string;
  styleId: string;
}

export async function fetchQuestlineMeta(questlineId: string): Promise<QuestlineMeta> {
  const { data } = await api.get(`/questlines/${questlineId}`);
  return { _id: data._id, title: data.title, genre: data.genre ?? '', styleId: data.styleId ?? '' };
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
