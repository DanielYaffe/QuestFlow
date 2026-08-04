import CharacterModel from '../models/characterModel';
import ItemModel, { ItemRarity } from '../models/itemModel';
import { resolveProjectId } from '../models/projectModel';

// ---------------------------------------------------------------------------
// Project roster context — what the project already has, offered to generation
// and to AI edits so they reuse existing designs instead of minting near-
// duplicates on every run. Shared by the quest-generation wizard and the quest
// editor's /ai-edit endpoint.
// ---------------------------------------------------------------------------

const ROSTER_LIMIT = 30;

export interface ProjectCharacterRef {
  id: string;
  name: string;
  kind: string;
  lore: string;
}

export interface ProjectItemRef {
  id: string;
  name: string;
  rarity: ItemRarity;
}

export async function loadProjectCharacters(
  userId: string | undefined,
  projectIdHint: string,
): Promise<ProjectCharacterRef[]> {
  if (!userId) return [];
  try {
    const projectId = await resolveProjectId(userId, projectIdHint);
    const docs = await CharacterModel.find({ projectId })
      .select('name kind lore')
      .sort({ updatedAt: -1 })
      .limit(ROSTER_LIMIT)
      .lean();
    return docs.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      kind: d.kind,
      lore: (d.lore ?? '').slice(0, 120),
    }));
  } catch {
    return [];
  }
}

/**
 * Items with their ids — an AI edit that reuses an existing item has to name
 * the id it is linking, which the title-only loader below cannot express.
 */
export async function loadProjectItems(
  userId: string | undefined,
  projectIdHint: string,
): Promise<ProjectItemRef[]> {
  if (!userId) return [];
  try {
    const projectId = await resolveProjectId(userId, projectIdHint);
    const docs = await ItemModel.find({ projectId })
      .select('name rarity')
      .sort({ updatedAt: -1 })
      .limit(ROSTER_LIMIT)
      .lean();
    return docs.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      rarity: d.rarity ?? 'common',
    }));
  } catch {
    return [];
  }
}

/** Titles only — the wizard's rewards step names rewards, it does not link them. */
export async function loadProjectRewardTitles(
  userId: string | undefined,
  projectIdHint: string,
): Promise<string[]> {
  const items = await loadProjectItems(userId, projectIdHint);
  return [...new Set(items.map((i) => i.name.trim()).filter(Boolean))];
}

export function buildProjectRewardsBlock(titles: string[]): string {
  if (titles.length === 0) return '';
  return `
REWARDS THAT ALREADY EXIST IN THIS PROJECT:
${titles.map((t) => `  - ${t}`).join('\n')}
Avoid inventing near-duplicates of these. If the story genuinely calls for one of them again, reuse its exact title; otherwise create rewards clearly distinct from this list.`;
}

export function buildProjectCharactersBlock(chars: ProjectCharacterRef[]): string {
  if (chars.length === 0) return '';
  return `
CHARACTERS THAT ALREADY EXIST IN THIS PROJECT (reusable — linking avoids duplicates):
${chars.map((c) => `  - existingId="${c.id}" name="${c.name}" role="${c.kind}"${c.lore ? ` — ${c.lore}` : ''}`).join('\n')}`;
}

export function buildProjectItemsBlock(items: ProjectItemRef[]): string {
  if (items.length === 0) return '';
  return `
ITEMS THAT ALREADY EXIST IN THIS PROJECT (reusable — linking avoids duplicates):
${items.map((i) => `  - existingId="${i.id}" name="${i.name}" rarity="${i.rarity}"`).join('\n')}`;
}
