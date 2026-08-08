import api from './axiosInstance';

/** A design the AI wants to reference that does not exist yet. */
export interface ProposedDesign {
  tempId: string;
  kind: 'npc' | 'monster' | 'item';
  name: string;
  appearance?: string;
  lore?: string;
  description?: string;
  rarity?: 'common' | 'rare' | 'epic';
  /** Exact KB entity name this reuses — presence means it is grounded. */
  kbRef?: string;
  existingId?: string;
}

/** A design that now exists, returned by materialize. */
export interface MaterializedDesign {
  tempId: string;
  id: string;
  kind: 'npc' | 'monster' | 'item';
  name: string;
  kbRef: string;
  created: boolean;
}

export interface RefLists {
  npcIds: string[];
  monsterIds: string[];
  rewardIds: string[];
}

/**
 * Node references before and after the change. Complete lists, not deltas — an
 * id missing from `after` is a detach. See docs/adr/0002.
 */
export interface RefsChange {
  before: RefLists;
  after: RefLists;
}

/** Why the knowledge base did or did not contribute to this proposal. */
export interface Grounding {
  consulted: boolean;
  reason?: 'no-game' | 'not-owned' | 'no-matches';
  gameId?: string;
  gameName?: string;
  entityCount: number;
}

export type AIChange =
  | {
      type: 'updateNode';
      nodeId: string;
      summary: string;
      before: { title: string; body: string; variant: string };
      after: { title: string; body: string; variant: string };
      refs?: RefsChange;
    }
  | {
      type: 'addNode';
      summary: string;
      node: { title: string; body: string; variant: string };
      connectFrom?: string;
      refs?: RefsChange;
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

export interface AiEditResponse {
  changes: AIChange[];
  entities: ProposedDesign[];
  grounding: Grounding;
}

export async function requestAiEdit(
  questlineId: string,
  payload: {
    instruction: string;
    nodes: unknown[];
    edges: unknown[];
    /** Restrict the edit to one node — the node editor's scoped rewrite. */
    focusNodeId?: string;
  },
): Promise<AiEditResponse> {
  const { data } = await api.post(`/questlines/${questlineId}/ai-edit`, payload);
  return data;
}

/**
 * Create project designs for the proposed entities an approved change needs.
 * Called on approval, never on suggestion — a rejected proposal writes nothing.
 */
export async function materializeAiEditDesigns(
  questlineId: string,
  entities: ProposedDesign[],
): Promise<{ ids: Record<string, string>; designs: MaterializedDesign[] }> {
  const { data } = await api.post(`/questlines/${questlineId}/ai-edit/materialize`, { entities });
  return data;
}

/** Replace temp ids with the real design ids materialize handed back. */
export function remapRefs(refs: RefLists, ids: Record<string, string>): RefLists {
  const remap = (list: string[]) => list.map((id) => ids[id] ?? id);
  return {
    npcIds: remap(refs.npcIds),
    monsterIds: remap(refs.monsterIds),
    rewardIds: remap(refs.rewardIds),
  };
}

/** The proposed designs an approved set of changes actually needs created. */
export function proposalsFor(changes: AIChange[], entities: ProposedDesign[]): ProposedDesign[] {
  const needed = new Set<string>();
  for (const change of changes) {
    if (change.type !== 'updateNode' && change.type !== 'addNode') continue;
    if (!change.refs) continue;
    const { npcIds, monsterIds, rewardIds } = change.refs.after;
    [...npcIds, ...monsterIds, ...rewardIds].forEach((id) => needed.add(id));
  }
  return entities.filter((e) => needed.has(e.tempId));
}
