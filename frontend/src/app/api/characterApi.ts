import api from './axiosInstance';

export type CharacterKind = 'npc' | 'monster';

export const ROTATION_DIRECTIONS = [
  'south', 'south-west', 'west', 'north-west',
  'north', 'north-east', 'east', 'south-east',
] as const;
export type RotationDirection = typeof ROTATION_DIRECTIONS[number];

export interface CharacterAssets {
  rawSpriteCandidates: string[];
  snappedSpriteS3Key: string;
  spritesheetS3Key: string;
  spritesheetJsonS3Key: string;
  rotations?: Partial<Record<RotationDirection, string>>;
  targetSizeOverride?: number;
  // Undo/redo cursor into rawSpriteCandidates.
  spriteHistoryIndex?: number;
}

export interface CharacterSpeciesData {
  species_name: string;
  type1: string;
  type2: string;
  base_hp: number;
  base_melee_attack: number;
  base_melee_defense: number;
  base_ranged_attack: number;
  base_ranged_defense: number;
  base_speed: number;
  base_max_ap: number;
  move_tags: string[];
  bestiary_bio: string;
}

export interface CharacterRecord {
  _id: string;
  projectId: string;
  kind: CharacterKind;
  name: string;
  appearance: string;
  lore: string;
  tags: string[];
  portraitUrl: string;
  dialogueTraits: string[];
  speciesData: CharacterSpeciesData;
  // SpriteStyle.id this design generates in; '' until the user picks one.
  spriteStyleId?: string;
  assets: CharacterAssets;
  previewUrl?: string;
  // Presigned 8-direction sprites (get-by-id and sprite-transform responses).
  rotationUrls?: Partial<Record<RotationDirection, string>>;
  // Presigned sprite version history (detail responses only) — powers undo.
  candidateUrls?: string[];
  isOrphan?: boolean;
  // Questlines referencing this character (list endpoint only).
  usedIn?: { questlineId: string; title: string }[];
  // "{gameId}:{entityName}" when materialized from a KB entity; '' otherwise.
  kbRef?: string;
  // KB document id when published from the design studio.
  kbDocId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCharacterInput {
  name: string;
  kind: CharacterKind;
  projectId?: string;
  appearance?: string;
  lore?: string;
  tags?: string[];
  portraitUrl?: string;
  dialogueTraits?: string[];
  spriteStyleId?: string;
  assets?: Partial<CharacterAssets>;
}

export async function listCharacters(params?: {
  projectId?: string;
  kind?: CharacterKind;
}): Promise<CharacterRecord[]> {
  const { data } = await api.get<CharacterRecord[]>('/characters', { params });
  return data;
}

export async function getCharacter(id: string): Promise<CharacterRecord> {
  const { data } = await api.get<CharacterRecord>(`/characters/${id}`);
  return data;
}

export async function createCharacter(input: CreateCharacterInput): Promise<CharacterRecord> {
  const { data } = await api.post<CharacterRecord>('/characters', input);
  return data;
}

export async function updateCharacter(
  id: string,
  patch: Partial<Omit<CreateCharacterInput, 'kind'>>,
): Promise<CharacterRecord> {
  const { data } = await api.put<CharacterRecord>(`/characters/${id}`, patch);
  return data;
}

export async function deleteCharacter(id: string): Promise<void> {
  await api.delete(`/characters/${id}`);
}

export interface CharacterUsage {
  nodeCount: number;
  questlineCount: number;
}

// How many quest nodes (across the user's questlines) reference this character.
export async function getCharacterUsage(id: string): Promise<CharacterUsage> {
  const { data } = await api.get<CharacterUsage>(`/characters/${id}/usage`);
  return data;
}

// --- Design studio ----------------------------------------------------------

/**
 * Make a freshly generated sprite the character's canonical sprite (appends to
 * the version history). Used by the sprite-job pipeline when a generation
 * started from the design studio completes — also on reconnect after reload.
 */
export async function attachSpriteToCharacter(
  characterId: string,
  imageKey: string,
): Promise<CharacterRecord> {
  const { data } = await api.post<CharacterRecord>(`/characters/${characterId}/sprite/attach`, { imageKey });
  return data;
}

/**
 * Move the sprite history cursor to `index` — undo, redo and history-strip
 * clicks all go through here. Nothing is appended, so redo stays available.
 */
export async function selectCharacterSpriteVersion(
  id: string,
  index: number,
): Promise<CharacterRecord> {
  const { data } = await api.post<CharacterRecord>(`/characters/${id}/sprite/version`, { index });
  return data;
}

// Enqueue PixelLab 8-direction rotation generation from the current sprite.
export async function generateRotations(id: string): Promise<{ jobId: string }> {
  const { data } = await api.post<{ jobId: string }>(`/characters/${id}/rotations`);
  return data;
}

export interface RotationSheetExport {
  sheetBase64: string; // horizontal spritesheet PNG
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

// Compose the 8-direction rotations into one spritesheet (PNG + frame JSON).
export async function exportRotationSheet(id: string): Promise<RotationSheetExport> {
  const { data } = await api.post<RotationSheetExport>(`/characters/${id}/rotations/export`);
  return data;
}

// Publish the design into a game's knowledge base (grounds quest generation).
export async function publishCharacterToKb(id: string, gameId: string): Promise<CharacterRecord> {
  const { data } = await api.post<CharacterRecord>(`/characters/${id}/publish-kb`, { gameId });
  return data;
}

export type SpriteTool = 'resize' | 'remove-bg' | 'pixel-snap';

// Run an image tool on the character's current sprite; the result becomes the
// new canonical sprite.
export async function transformCharacterSprite(
  id: string,
  tool: SpriteTool,
  targetSize?: number,
): Promise<CharacterRecord> {
  const { data } = await api.post<CharacterRecord>(`/characters/${id}/sprite/transform`, { tool, targetSize });
  return data;
}
