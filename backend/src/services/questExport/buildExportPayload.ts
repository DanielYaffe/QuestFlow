import { IQuestline } from '../../models/questlineModel';
import {
  CanonicalExport,
  CanonicalNode,
  CanonicalEdge,
  CanonicalCharacter,
  CanonicalReward,
  CanonicalObjective,
  CanonicalChapter,
} from './types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

// Ensure unique slugs by appending an index when names collide
function uniqueSlug(base: string, seen: Set<string>): string {
  let slug = base;
  let counter = 2;
  while (seen.has(slug)) {
    slug = `${base}-${counter++}`;
  }
  seen.add(slug);
  return slug;
}

export interface ExportCharacterInput {
  _id: { toString(): string };
  name: string;
  appearance?: string;
  background?: string;
}

export interface ExportRewardInput {
  _id: { toString(): string };
  title: string;
  description?: string;
  rarity: 'common' | 'rare' | 'epic';
}

export function buildExportPayload(
  questline: IQuestline,
  characterDocs: ExportCharacterInput[] = [],
  // Rewards live in the standalone Item collection (referenced by
  // questline.itemIds); the caller resolves the docs and passes them in.
  // Defaults to legacy embedded rewards for pre-migration fixtures.
  rewardDocs: ExportRewardInput[] = questline.rewards ?? [],
): CanonicalExport {
  const seenSlugs = new Set<string>();

  // ── Characters: _id → "npc_<slug>" ──────────────────────────────────────
  // Characters live in the standalone Character collection (referenced by
  // questline.characterIds); the caller resolves the docs and passes them in.
  const charIdMap = new Map<string, string>();
  const characters: CanonicalCharacter[] = characterDocs.map((c) => {
    const slug = uniqueSlug(`npc_${slugify(c.name)}`, seenSlugs);
    charIdMap.set(c._id.toString(), slug);
    return {
      id:         slug,
      name:       c.name,
      appearance: c.appearance ?? '',
      background: c.background ?? '',
    };
  });

  // ── Rewards: _id → "reward_<slug>" ──────────────────────────────────────
  const rewardIdMap = new Map<string, string>();
  const rewards: CanonicalReward[] = rewardDocs.map((r) => {
    const slug = uniqueSlug(`reward_${slugify(r.title)}`, seenSlugs);
    rewardIdMap.set(r._id.toString(), slug);
    return {
      id:          slug,
      title:       r.title,
      description: r.description ?? '',
      rarity:      r.rarity,
    };
  });

  // ── Objectives: objectiveId → "obj_<slug>" ───────────────────────────────
  const objectives: CanonicalObjective[] = questline.objectives.map((o) => ({
    id:          o.objectiveId,
    title:       o.title,
    description: o.description ?? '',
  }));

  // ── Chapters: not modeled in the unified questline schema ────────────────
  const chapters: CanonicalChapter[] = [];

  // ── Nodes: nodeId → "quest_<nodeId>" ────────────────────────────────────
  const nodeIdMap = new Map<string, string>();
  questline.nodes.forEach((n) => {
    nodeIdMap.set(n.nodeId, `quest_${n.nodeId}`);
  });

  const remap = (id: string): string =>
    charIdMap.get(id) ?? rewardIdMap.get(id) ?? nodeIdMap.get(id) ?? id;

  const nodes: CanonicalNode[] = questline.nodes.map((n) => ({
    id:         `quest_${n.nodeId}`,
    variant:    n.variant ?? 'story',
    title:      n.title,
    body:       n.body,
    npcIds:     (n.npcIds     ?? []).map(remap),
    monsterIds: (n.monsterIds ?? []).map(remap),
    rewardIds:  (n.rewardIds  ?? []).map(remap),
    ...(Object.keys(n.templateValues ?? {}).length > 0 ? { templateValues: n.templateValues } : {}),
    exportFields: n.exportFields,
  }));

  const edges: CanonicalEdge[] = questline.edges.map((e) => ({
    id:     e.edgeId,
    source: nodeIdMap.get(e.source) ?? `quest_${e.source}`,
    target: nodeIdMap.get(e.target) ?? `quest_${e.target}`,
  }));

  return {
    meta: {
      id:          slugify(questline.title),
      title:       questline.title,
      genre:       questline.genre ?? '',
      description: questline.description ?? '',
    },
    nodes,
    edges,
    characters,
    rewards,
    objectives,
    chapters,
  };
}
