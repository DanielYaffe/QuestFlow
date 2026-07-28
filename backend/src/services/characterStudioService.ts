import sharp from 'sharp';
import CharacterModel, {
  ICharacter,
  MAX_SPRITE_CANDIDATES,
  ROTATION_DIRECTIONS,
  RotationDirection,
} from '../models/characterModel';
import GameModel from '../models/gameModel';
import KbDocumentModel from '../models/kbDocumentModel';
import { KbType } from './qdrant';
import { ingestDocument, editDocument } from './kbService';
import { animationQueue, AnimationJobData } from '../queues/animationQueue';
import { applySpriteTool, SpriteTool } from './generation/spriteTools';
import { uploadBufferToS3, downloadBufferFromS3 } from '../utils/s3Helper';

// ---------------------------------------------------------------------------
// Design-studio operations on Characters: 8-direction rotations (PixelLab),
// manual "Publish to KB" (feeds quest-generation grounding), and sprite image
// tools (resize / remove background / pixel snap).
// ---------------------------------------------------------------------------

export class StudioError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'StudioError';
  }
}

async function findOwnedCharacter(ownerId: string, characterId: string): Promise<ICharacter> {
  const character = await CharacterModel.findById(characterId);
  if (!character) throw new StudioError('Character not found', 404);
  if (character.ownerId !== ownerId) throw new StudioError('Forbidden', 403);
  return character;
}

/** The character's current canonical sprite key (same fallback chain the roster preview uses). */
export function resolveSpriteSourceKey(character: ICharacter): string {
  const candidates = character.assets.rawSpriteCandidates ?? [];
  const key = character.assets.snappedSpriteS3Key || candidates[candidates.length - 1] || '';
  if (!key) throw new StudioError('Character has no sprite yet — attach or generate one first', 400);
  return key;
}

// --- 8-direction rotations ------------------------------------------------------

export async function startRotationsJob(
  ownerId: string,
  characterId: string,
): Promise<{ jobId: string }> {
  const character = await findOwnedCharacter(ownerId, characterId);
  const sourceImageKey = resolveSpriteSourceKey(character);

  const job = await animationQueue.add('rotations', {
    kind: 'rotations',
    characterId: character._id.toString(),
    sourceImageKey,
  } satisfies AnimationJobData);

  return { jobId: String(job.id) };
}

// --- Publish to KB ----------------------------------------------------------------

function statLine(character: ICharacter): string {
  const s = character.speciesData;
  const parts: string[] = [];
  if (s.base_hp) parts.push(`HP ${s.base_hp}`);
  if (s.base_melee_attack) parts.push(`Melee ATK ${s.base_melee_attack}`);
  if (s.base_melee_defense) parts.push(`Melee DEF ${s.base_melee_defense}`);
  if (s.base_ranged_attack) parts.push(`Ranged ATK ${s.base_ranged_attack}`);
  if (s.base_ranged_defense) parts.push(`Ranged DEF ${s.base_ranged_defense}`);
  if (s.base_speed) parts.push(`Speed ${s.base_speed}`);
  if (s.base_max_ap) parts.push(`AP ${s.base_max_ap}`);
  return parts.join(', ');
}

/**
 * Render the character as the markdown shape the KB entity parser recognizes
 * (`## Name` heading + `Key: value` lines) so publishing yields a real entity,
 * not just searchable prose.
 */
export function buildKbMarkdown(character: ICharacter): string {
  const lines: string[] = [`## ${character.name}`];
  lines.push(`Role: ${character.kind === 'monster' ? 'monster' : 'npc'}`);

  if (character.kind === 'monster') {
    const s = character.speciesData;
    const types = [s.type1, s.type2].filter(Boolean).join(' / ');
    if (types) lines.push(`Type: ${types}`);
    const stats = statLine(character);
    if (stats) lines.push(`Stats: ${stats}`);
    if (s.move_tags.length > 0) lines.push(`Moves: ${s.move_tags.join(', ')}`);
  } else if (character.dialogueTraits.length > 0) {
    lines.push(`Traits: ${character.dialogueTraits.join(', ')}`);
  }

  if (character.tags.length > 0) lines.push(`Tags: ${character.tags.join(', ')}`);
  if (character.appearance.trim()) lines.push(`Appearance: ${character.appearance.trim()}`);
  const notes = character.lore.trim() || character.speciesData.bestiary_bio.trim();
  if (notes) lines.push(`Notes: ${notes}`);

  return `${lines.join('\n')}\n`;
}

export async function publishToKb(
  ownerId: string,
  characterId: string,
  gameId: string,
): Promise<ICharacter> {
  const character = await findOwnedCharacter(ownerId, characterId);

  const game = await GameModel.findOne({ _id: gameId, ownerId }).lean();
  if (!game) throw new StudioError('Game not found', 404);

  const type: KbType = character.kind === 'monster' ? 'monsters' : 'characters';
  const text = buildKbMarkdown(character);
  const metadata = { source: 'design-studio', characterId: character._id.toString() };

  const existing = character.kbDocId
    ? await KbDocumentModel.findOne({ _id: character.kbDocId, gameId })
    : null;

  if (existing) {
    await editDocument(existing, { title: character.name, text, metadata });
  } else {
    character.kbDocId = await ingestDocument({
      gameId,
      type,
      title: character.name,
      text,
      metadata,
    });
  }

  character.kbRef = `${gameId}:${character.name}`;
  await character.save();
  return character;
}

// --- Sprite image tools -------------------------------------------------------------

export type { SpriteTool };

// --- Rotation sheet export ------------------------------------------------------

export interface RotationSheetResult {
  sheet: Buffer; // horizontal spritesheet PNG, one cell per direction
  metadata: {
    name: string;
    cellSize: { width: number; height: number };
    frames: {
      direction: RotationDirection;
      index: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
  };
}

/**
 * Compose the character's 8-direction rotations into a single horizontal
 * spritesheet (compass order, starting south, CCW — the PixelLab output order)
 * plus frame metadata. Built on demand; nothing is persisted.
 */
export async function buildRotationSheet(
  ownerId: string,
  characterId: string,
): Promise<RotationSheetResult> {
  const character = await findOwnedCharacter(ownerId, characterId);
  const rotations = character.assets.rotations;
  const directions = ROTATION_DIRECTIONS.filter((dir) => rotations?.[dir]);
  if (!rotations || directions.length === 0) {
    throw new StudioError('Character has no rotations yet — generate them first', 400);
  }

  const frames = await Promise.all(directions.map((dir) => downloadBufferFromS3(rotations[dir])));

  // Frames should be uniform, but center each in a max-sized cell to be safe.
  const dims: { width: number; height: number }[] = [];
  let cellW = 0;
  let cellH = 0;
  for (const frame of frames) {
    const meta = await sharp(frame).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new StudioError('A rotation image has no dimensions', 500);
    dims.push({ width, height });
    cellW = Math.max(cellW, width);
    cellH = Math.max(cellH, height);
  }

  const sheet = await sharp({
    create: {
      width: cellW * directions.length,
      height: cellH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frames.map((input, i) => ({
      input,
      left: i * cellW + Math.floor((cellW - dims[i].width) / 2),
      top: Math.floor((cellH - dims[i].height) / 2),
    })))
    .png()
    .toBuffer();

  return {
    sheet,
    metadata: {
      name: character.name,
      cellSize: { width: cellW, height: cellH },
      frames: directions.map((direction, index) => ({
        direction,
        index,
        x: index * cellW,
        y: 0,
        width: cellW,
        height: cellH,
      })),
    },
  };
}

export async function transformSprite(
  ownerId: string,
  characterId: string,
  tool: SpriteTool,
  params: { targetSize?: number },
): Promise<ICharacter> {
  const character = await findOwnedCharacter(ownerId, characterId);
  const sourceKey = resolveSpriteSourceKey(character);

  const source = await downloadBufferFromS3(sourceKey);
  const output = await applySpriteTool(source, tool, params);
  const newKey = await uploadBufferToS3(output, 'image/png', 'sprites');

  const candidates = [...(character.assets.rawSpriteCandidates ?? []), newKey];
  character.assets.rawSpriteCandidates = candidates.slice(-MAX_SPRITE_CANDIDATES);
  character.assets.snappedSpriteS3Key = newKey;
  character.markModified('assets');
  await character.save();
  return character;
}
