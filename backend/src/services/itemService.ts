import ItemModel, { IItem, ItemRarity, MAX_ITEM_SPRITE_CANDIDATES } from '../models/itemModel';
import QuestlineModel from '../models/questlineModel';
import GameModel from '../models/gameModel';
import KbDocumentModel from '../models/kbDocumentModel';
import { ingestDocument, editDocument } from './kbService';
import { StudioError } from './studioError';
import { applySpriteTool, SpriteTool } from './generation/spriteTools';
import { pushVersion, resolveIndex, selectVersion } from './generation/spriteHistory';
import { uploadBufferToS3, downloadBufferFromS3, deleteFileFromS3 } from '../utils/s3Helper';

// ---------------------------------------------------------------------------
// Item service — CRUD over the Item collection plus the design-studio
// operations (sprite tools, publish to KB). Mirrors characterStudioService.
// ---------------------------------------------------------------------------

const RARITIES: ItemRarity[] = ['common', 'rare', 'epic'];

export function isItemRarity(value: unknown): value is ItemRarity {
  return typeof value === 'string' && (RARITIES as string[]).includes(value);
}

async function findOwnedItem(ownerId: string, itemId: string): Promise<IItem> {
  const item = await ItemModel.findById(itemId);
  if (!item) throw new StudioError('Item not found', 404);
  if (item.ownerId !== ownerId) throw new StudioError('Forbidden', 403);
  return item;
}

/** The item's current canonical sprite key ('' when none). */
export function resolveItemSpriteKey(item: IItem): string {
  const candidates = item.assets.rawSpriteCandidates ?? [];
  return item.assets.snappedSpriteS3Key || candidates[candidates.length - 1] || '';
}

// --- CRUD --------------------------------------------------------------------

export async function listItems(ownerId: string, projectId?: string): Promise<IItem[]> {
  const filter: Record<string, unknown> = { ownerId };
  if (projectId) filter.projectId = projectId;
  return ItemModel.find(filter).sort({ updatedAt: -1 });
}

export async function getItem(ownerId: string, itemId: string): Promise<IItem> {
  return findOwnedItem(ownerId, itemId);
}

export async function createItem(input: {
  ownerId: string;
  projectId: string;
  name: string;
  description?: string;
  rarity?: ItemRarity;
  tags?: string[];
  // KB provenance tag ("{gameId}:{entityName}") when this item is materialized
  // from a knowledge-base entity. '' = not KB-linked.
  kbRef?: string;
}): Promise<IItem> {
  return ItemModel.create({
    ownerId: input.ownerId,
    projectId: input.projectId,
    name: input.name.trim(),
    description: input.description ?? '',
    rarity: input.rarity ?? 'common',
    tags: input.tags ?? [],
    kbRef: input.kbRef ?? '',
  });
}

export async function updateItem(
  ownerId: string,
  itemId: string,
  patch: {
    name?: string;
    description?: string;
    rarity?: ItemRarity;
    tags?: string[];
    spriteStyleId?: string;
    assets?: IItem['assets'];
  },
): Promise<IItem> {
  const item = await findOwnedItem(ownerId, itemId);
  if (patch.name !== undefined) item.name = patch.name.trim() || item.name;
  if (patch.description !== undefined) item.description = patch.description;
  if (patch.rarity !== undefined) item.rarity = patch.rarity;
  if (patch.tags !== undefined) item.tags = patch.tags;
  if (patch.spriteStyleId !== undefined) item.spriteStyleId = patch.spriteStyleId;
  if (patch.assets !== undefined) {
    item.assets = patch.assets;
    item.markModified('assets');
  }
  await item.save();
  return item;
}

/**
 * Delete the item and strip its id from every questline referencing it
 * (itemIds roster + node rewardIds) — same semantics as character deletion.
 */
export async function deleteItem(ownerId: string, itemId: string): Promise<void> {
  const item = await findOwnedItem(ownerId, itemId);
  const keys = [...(item.assets.rawSpriteCandidates ?? [])];
  await item.deleteOne();
  await QuestlineModel.updateMany(
    { ownerId },
    { $pull: { itemIds: itemId, 'nodes.$[].rewardIds': itemId } },
  );
  await Promise.allSettled(keys.map((key) => deleteFileFromS3(key)));
}

/**
 * How many quest nodes (across the owner's questlines) reference this item —
 * mirrors character usage, powering delete warnings.
 */
export async function getItemUsage(
  ownerId: string,
  itemId: string,
): Promise<{ nodeCount: number; questlineCount: number }> {
  await findOwnedItem(ownerId, itemId);
  const questlines = await QuestlineModel.find({
    ownerId,
    $or: [{ itemIds: itemId }, { 'nodes.rewardIds': itemId }],
  }).select('nodes').lean();

  let nodeCount = 0;
  for (const ql of questlines) {
    for (const n of ql.nodes ?? []) {
      if ((n.rewardIds ?? []).includes(itemId)) nodeCount++;
    }
  }
  return { nodeCount, questlineCount: questlines.length };
}

// --- Startup migration: embedded rewards → Item references -----------------------

// S3 keys never start with http — presigned URLs always do.
function isS3Key(value: string): boolean {
  return !!value && !value.startsWith('http');
}

/**
 * One-time startup migration to the character-style model: every embedded
 * questline reward becomes (or links to) a standalone Item doc, node.rewardIds
 * are remapped from embedded-subdoc ids (and legacy "rew-N" placeholders) to
 * Item ids, questline.itemIds is populated, and the embedded array is emptied.
 * Idempotent — questlines with no embedded rewards are untouched.
 */
export async function migrateEmbeddedRewardsToItems(): Promise<void> {
  const questlines = await QuestlineModel.find({ 'rewards.0': { $exists: true } });
  if (questlines.length === 0) return;

  // Dedupe scope is (ownerId, projectId): same-named rewards across a
  // project's questlines collapse into one Item.
  const itemsByScope = new Map<string, Map<string, string>>(); // scope → name(lower) → itemId
  const scopeKey = (ownerId: string, projectId: string) => `${ownerId}|${projectId}`;

  let migrated = 0;
  for (const questline of questlines) {
    const scope = scopeKey(questline.ownerId, questline.projectId);
    let byName = itemsByScope.get(scope);
    if (!byName) {
      const existing = await ItemModel.find({
        ownerId: questline.ownerId,
        projectId: questline.projectId,
      }).select('name').lean();
      byName = new Map(existing.map((i) => [i.name.trim().toLowerCase(), i._id.toString()]));
      itemsByScope.set(scope, byName);
    }

    const rewardToItem = new Map<string, string>(); // embedded _id / "rew-N" → item id
    const itemIds = new Set<string>(questline.itemIds ?? []);

    for (let i = 0; i < questline.rewards.length; i++) {
      const reward = questline.rewards[i];
      const name = reward.title?.trim();
      if (!name) continue;

      let itemId = reward.itemId && (await ItemModel.exists({ _id: reward.itemId }))
        ? reward.itemId
        : byName.get(name.toLowerCase());

      if (!itemId) {
        const imageKey = isS3Key(reward.imageUrl ?? '') ? reward.imageUrl! : '';
        const item = await ItemModel.create({
          ownerId: questline.ownerId,
          projectId: questline.projectId,
          name,
          description: reward.description ?? '',
          rarity: reward.rarity,
          kbRef: reward.kbRef ?? '',
          ...(imageKey
            ? { assets: { rawSpriteCandidates: [imageKey], snappedSpriteS3Key: imageKey } }
            : {}),
        });
        itemId = item._id.toString();
      }

      byName.set(name.toLowerCase(), itemId);
      rewardToItem.set(reward._id.toString(), itemId);
      rewardToItem.set(`rew-${i + 1}`, itemId); // pre-remap-fix placeholder ids
      itemIds.add(itemId);
    }

    questline.nodes.forEach((n) => {
      n.rewardIds = (n.rewardIds ?? []).map((id) => rewardToItem.get(id) ?? id);
    });
    questline.itemIds = [...itemIds];
    questline.rewards = [] as typeof questline.rewards;
    await questline.save();
    migrated++;
  }
  console.log(`[migrate] embedded rewards → Item refs: ${migrated} questline(s)`);
}

// --- Sprite: attach + tools -----------------------------------------------------

/** Append a new sprite version at the history cursor and make it canonical. */
function commitVersion(item: IItem, newKey: string): Promise<IItem> {
  const candidates = item.assets.rawSpriteCandidates ?? [];
  const index = resolveIndex(candidates, item.assets.snappedSpriteS3Key, item.assets.spriteHistoryIndex);
  // Re-attaching what is already current (a duplicate job callback, or picking
  // the same gallery sprite twice) must not add a second identical version.
  const next = candidates[index] === newKey
    ? { candidates, index }
    : pushVersion(candidates, index, newKey, MAX_ITEM_SPRITE_CANDIDATES);

  item.assets.rawSpriteCandidates = next.candidates;
  item.assets.spriteHistoryIndex = next.index;
  item.assets.snappedSpriteS3Key = newKey;
  item.markModified('assets');
  return item.save();
}

/** Make an existing sprite key the item's canonical sprite (appends to history). */
export async function attachSpriteKey(
  ownerId: string,
  itemId: string,
  imageKey: string,
): Promise<IItem> {
  if (!imageKey) throw new StudioError('imageKey is required', 400);
  const item = await findOwnedItem(ownerId, itemId);
  return commitVersion(item, imageKey);
}

/**
 * Move the history cursor (undo / redo / history-strip click) — re-points at an
 * existing version without appending, so the versions ahead stay redoable.
 */
export async function selectItemSpriteVersion(
  ownerId: string,
  itemId: string,
  index: number,
): Promise<IItem> {
  const item = await findOwnedItem(ownerId, itemId);
  const key = selectVersion(item.assets.rawSpriteCandidates ?? [], index);

  item.assets.snappedSpriteS3Key = key;
  item.assets.spriteHistoryIndex = index;
  item.markModified('assets');
  return item.save();
}

export async function transformItemSprite(
  ownerId: string,
  itemId: string,
  tool: SpriteTool,
  params: { targetSize?: number },
): Promise<IItem> {
  const item = await findOwnedItem(ownerId, itemId);
  const sourceKey = resolveItemSpriteKey(item);
  if (!sourceKey) throw new StudioError('Item has no sprite yet — attach or generate one first', 400);

  const source = await downloadBufferFromS3(sourceKey);
  const output = await applySpriteTool(source, tool, params);
  const newKey = await uploadBufferToS3(output, 'image/png', 'sprites');
  return commitVersion(item, newKey);
}

// --- Publish to KB ----------------------------------------------------------------

/**
 * Render the item as the markdown shape the KB entity parser recognizes
 * (`## Name` heading + `Key: value` lines).
 */
export function buildItemKbMarkdown(item: IItem): string {
  const lines: string[] = [`## ${item.name}`];
  lines.push(`Rarity: ${item.rarity}`);
  if (item.tags.length > 0) lines.push(`Tags: ${item.tags.join(', ')}`);
  if (item.description.trim()) lines.push(`Description: ${item.description.trim()}`);
  return `${lines.join('\n')}\n`;
}

export async function publishItemToKb(
  ownerId: string,
  itemId: string,
  gameId: string,
): Promise<IItem> {
  const item = await findOwnedItem(ownerId, itemId);

  const game = await GameModel.findOne({ _id: gameId, ownerId }).lean();
  if (!game) throw new StudioError('Game not found', 404);

  const text = buildItemKbMarkdown(item);
  const metadata = { source: 'design-studio', itemId: item._id.toString() };

  const existing = item.kbDocId
    ? await KbDocumentModel.findOne({ _id: item.kbDocId, gameId })
    : null;

  if (existing) {
    await editDocument(existing, { title: item.name, text, metadata });
  } else {
    item.kbDocId = await ingestDocument({
      gameId,
      type: 'items',
      title: item.name,
      text,
      metadata,
    });
  }

  item.kbRef = `${gameId}:${item.name}`;
  await item.save();
  return item;
}
