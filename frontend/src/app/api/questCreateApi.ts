import api from './axiosInstance';
import axios from 'axios';

export interface Objective {
  id: string;
  title: string;
  description: string;
}

export interface Reward {
  id: string;
  title: string;
  // Set when the reward is an existing item from the game's knowledge base.
  kbRef?: string;
}

export type CharacterRole = 'npc' | 'monster';

export interface GeneratedCharacter {
  id: string;
  name: string;
  role: CharacterRole;
  appearance: string;
  background: string;
  // Set when the character is an existing knowledge-base entity — the backend
  // links the existing Character doc instead of creating a duplicate.
  kbRef?: string;
  // Set when the character reuses an existing project Character (its _id) —
  // linked directly instead of inserting a duplicate.
  existingId?: string;
}

export interface GenerateObjectivesResult {
  objectives: Objective[];
  rewards: Reward[];
}

export type GameStage = 'early' | 'mid' | 'late';

// Optional KB grounding for a generation call. No gameId = free generation.
export interface KbOptions {
  gameId?: string;
  progression?: GameStage;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export async function generateObjectives(
  story: string,
  genre: string,
  templateId?: string,
  kb?: KbOptions,
): Promise<GenerateObjectivesResult> {
  try {
    const { data } = await api.post('/quests/generate', { story, genre, templateId, ...kb });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Failed to generate objectives'));
  }
}

export async function generateCharacters(
  story: string,
  genre: string,
  kb?: KbOptions,
): Promise<{ characters: GeneratedCharacter[] }> {
  try {
    const { data } = await api.post('/quests/generate-characters', { story, genre, ...kb });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Failed to generate characters'));
  }
}

export async function generateQuestline(
  story: string,
  genre: string,
  objectives: Objective[],
  rewards: Reward[],
  characters: GeneratedCharacter[],
  styleId: string,
  templateId?: string,
  kb?: KbOptions,
): Promise<string> {
  try {
    const { data } = await api.post('/quests/generate-questline', {
      story,
      genre,
      objectives,
      rewards,
      characters,
      styleId,
      templateId,
      ...kb,
    });
    return data.questlineId;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Failed to generate questline'));
  }
}
