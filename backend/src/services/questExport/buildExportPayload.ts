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

function uniqueSlug(base: string, seen: Set<string>): string {
  let slug = base;
  let counter = 2;
  while (seen.has(slug)) {
    slug = `${base}-${counter++}`;
  }
  seen.add(slug);
  return slug;
}

export function buildExportPayload(questline: IQuestline): CanonicalExport {
  const seenSlugs = new Set<string>();

  // ── Characters: _id → "npc_<slug>" ──────────────────────────────────────
  const charIdMap = new Map<string, string>();
  const characters: CanonicalCharacter[] = questline.characters.map((c) => {
    const slug = uniqueSlug(`npc_${slugify(c.name)}`, seenSlugs);
    charIdMap.set(c._id.toString(), slug);
    return {
      id:         slug,
      name:       c.name,
      appearance: c.appearance ?? '',
      background: c.background ?? '',
      imageUrl:   c.imageUrl ?? '',
    };
  });

  // ── Rewards: _id → "reward_<slug>" ──────────────────────────────────────
  const rewardIdMap = new Map<string, string>();
  const rewards: CanonicalReward[] = questline.rewards.map((r) => {
    const slug = uniqueSlug(`reward_${slugify(r.title)}`, seenSlugs);
    rewardIdMap.set(r._id.toString(), slug);
    return {
      id:          slug,
      title:       r.title,
      description: r.description ?? '',
      rarity:      r.rarity,
      imageUrl:    r.imageUrl ?? '',
    };
  });

  // ── Objectives ───────────────────────────────────────────────────────────
  const objectives: CanonicalObjective[] = questline.objectives.map((o) => ({
    id:          o.objectiveId,
    title:       o.title,
    description: o.description ?? '',
  }));

  // ── Chapters ─────────────────────────────────────────────────────────────
  const chapterIdMap = new Map<string, string>();
  const chapters: CanonicalChapter[] = questline.chapters.map((ch) => {
    const slug = uniqueSlug(`chapter_${slugify(ch.title)}`, seenSlugs);
    chapterIdMap.set(ch._id.toString(), slug);
    return {
      id:     slug,
      title:  ch.title,
      scenes: ch.scenes.map((s) => ({ id: s.id, title: s.title })),
    };
  });

  // ── Nodes ────────────────────────────────────────────────────────────────
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
  }));

  const edges: CanonicalEdge[] = questline.edges.map((e) => ({
    id:     e.edgeId,
    source: nodeIdMap.get(e.source) ?? `quest_${e.source}`,
    target: nodeIdMap.get(e.target) ?? `quest_${e.target}`,
  }));

  // ── StartNodeId: node with no incoming edges ─────────────────────────────
  const targetIds = new Set(edges.map((e) => e.target));
  const startNode = nodes.find((n) => !targetIds.has(n.id)) ?? nodes[0];
  const startNodeId = startNode?.id ?? '';

  return {
    meta: {
      id:          slugify(questline.title),
      title:       questline.title,
      genre:       questline.genre ?? '',
      description: questline.description ?? '',
      startNodeId,
    },
    nodes,
    edges,
    characters,
    rewards,
    objectives,
    chapters,
  };
}
