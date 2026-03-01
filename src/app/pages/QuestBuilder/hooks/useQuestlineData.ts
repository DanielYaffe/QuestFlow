import { useState, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import { fetchQuestlineById } from '../../../api/questBuilderApi';
import { QuestNodeData } from '../../../types/quest';

interface QuestlineState {
  nodes: Node<QuestNodeData>[];
  edges: Edge[];
  nextNodeId: number;
  isLoading: boolean;
  error: string | null;
}

export function useQuestlineData(questlineId: string): QuestlineState {
  const [state, setState] = useState<QuestlineState>({
    nodes: [],
    edges: [],
    nextNodeId: 1,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchQuestlineById(questlineId)
      .then((data) => {
        if (cancelled) return;
        setState({ ...data, isLoading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, isLoading: false, error: err.message }));
      });

    return () => {
      cancelled = true;
    };
  }, [questlineId]);

  return state;
}
