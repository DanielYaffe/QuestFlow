import api from './axiosInstance';
import { SpriteTool } from './characterApi';

// Studio item designs (dedicated Item collection). Questline "rewards" are
// references to these docs (questline.itemIds + node.rewardIds), the same way
// characters are referenced — the item is the single source of truth.

export type ItemRarity = 'common' | 'rare' | 'epic';

export interface ItemAssets {
  rawSpriteCandidates: string[];
  snappedSpriteS3Key: string;
  // Undo/redo cursor into rawSpriteCandidates.
  spriteHistoryIndex?: number;
}

export interface ItemRecord {
  _id: string;
  projectId: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  tags: string[];
  // "{gameId}:{entityName}" when published to a knowledge base; '' otherwise.
  kbRef: string;
  kbDocId: string;
  // SpriteStyle.id this design generates in; '' until the user picks one.
  spriteStyleId?: string;
  assets: ItemAssets;
  previewUrl?: string;
  // Presigned sprite version history (detail responses only) — powers undo.
  candidateUrls?: string[];
  createdAt: string;
  updatedAt: string;
}

export async function listItems(params?: { projectId?: string }): Promise<ItemRecord[]> {
  const { data } = await api.get<ItemRecord[]>('/items', { params });
  return data;
}

export interface ItemUsage {
  nodeCount: number;
  questlineCount: number;
}

// How many quest nodes (across the user's questlines) reference this item.
export async function getItemUsage(id: string): Promise<ItemUsage> {
  const { data } = await api.get<ItemUsage>(`/items/${id}/usage`);
  return data;
}

export async function getItem(id: string): Promise<ItemRecord> {
  const { data } = await api.get<ItemRecord>(`/items/${id}`);
  return data;
}

export async function createItem(input: {
  name: string;
  projectId?: string;
  description?: string;
  rarity?: ItemRarity;
  tags?: string[];
}): Promise<ItemRecord> {
  const { data } = await api.post<ItemRecord>('/items', input);
  return data;
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<ItemRecord, 'name' | 'description' | 'rarity' | 'tags' | 'spriteStyleId' | 'assets'>>,
): Promise<ItemRecord> {
  const { data } = await api.put<ItemRecord>(`/items/${id}`, patch);
  return data;
}

export async function deleteItem(id: string): Promise<void> {
  await api.delete(`/items/${id}`);
}

// Make an existing sprite (by S3 key) the item's canonical sprite.
export async function attachSpriteToItem(id: string, imageKey: string): Promise<ItemRecord> {
  const { data } = await api.post<ItemRecord>(`/items/${id}/sprite/attach`, { imageKey });
  return data;
}

export async function transformItemSprite(
  id: string,
  tool: SpriteTool,
  targetSize?: number,
): Promise<ItemRecord> {
  const { data } = await api.post<ItemRecord>(`/items/${id}/sprite/transform`, { tool, targetSize });
  return data;
}

/**
 * Move the sprite history cursor to `index` — undo, redo and history-strip
 * clicks all go through here. Nothing is appended, so redo stays available.
 */
export async function selectItemSpriteVersion(id: string, index: number): Promise<ItemRecord> {
  const { data } = await api.post<ItemRecord>(`/items/${id}/sprite/version`, { index });
  return data;
}

export async function publishItemToKb(id: string, gameId: string): Promise<ItemRecord> {
  const { data } = await api.post<ItemRecord>(`/items/${id}/publish-kb`, { gameId });
  return data;
}
