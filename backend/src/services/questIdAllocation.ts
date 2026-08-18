import mongoose from 'mongoose';
import ProjectModel, { IProject } from '../models/projectModel';
import QuestlineModel from '../models/questlineModel';
import { pickFreeValue } from './assetPoolAllocation';

// ---------------------------------------------------------------------------
// Quest id allocation.
//
// Quest ids used to be the node's position, so every questline in a project
// exported quests 1..N and collided with every other one.
//
// A quest is not an asset, so it has no entry in the project's asset schema and
// cannot draw from a value pool the way a character attribute does. Its range
// therefore still lives in the project's Maple settings — the one piece of this
// that is not schema-driven, and the obvious thing to move once quests have a
// declared shape of their own.
// ---------------------------------------------------------------------------

/** Quest ids already taken across the project's questlines. */
export async function usedQuestIds(projectId: string): Promise<Set<number>> {
  const used = new Set<number>();
  const questlines = await QuestlineModel.find({ projectId }).select('nodes.exportFields.questId').lean();
  for (const questline of questlines) {
    for (const node of questline.nodes ?? []) {
      const id = node.exportFields?.questId;
      if (typeof id === 'number' && Number.isInteger(id) && id > 0) used.add(id);
    }
  }
  return used;
}

/**
 * Unique quest ids for `count` nodes, or an empty list when the project has no
 * quest range configured — callers then keep whatever id the node already had
 * rather than exporting none.
 */
export async function allocateQuestIds(args: {
  projectId: string;
  count: number;
  taken?: Iterable<number>;
}): Promise<number[]> {
  if (args.count <= 0 || !mongoose.isValidObjectId(args.projectId)) return [];
  const project = await ProjectModel.findById(args.projectId).select('mapleSettings').lean() as IProject | null;
  const ranges = project?.mapleSettings?.questIdRanges ?? [];
  if (!ranges.length) return [];

  const used = await usedQuestIds(args.projectId);
  for (const id of args.taken ?? []) used.add(id);

  const ids: number[] = [];
  for (let index = 0; index < args.count; index += 1) {
    const id = pickFreeValue(ranges, used);
    if (!id) break;
    used.add(id);
    ids.push(id);
  }
  return ids;
}
