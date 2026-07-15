import api from './axiosInstance';

export type CharacterKind = 'npc' | 'monster';

export interface CharacterAssets {
  rawSpriteCandidates: string[];
  snappedSpriteS3Key: string;
  spritesheetS3Key: string;
  spritesheetJsonS3Key: string;
  targetSizeOverride?: number;
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
  assets: CharacterAssets;
  previewUrl?: string;
  isOrphan?: boolean;
  // Questlines referencing this character (list endpoint only).
  usedIn?: { questlineId: string; title: string }[];
  // "{gameId}:{entityName}" when materialized from a KB entity; '' otherwise.
  kbRef?: string;
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
