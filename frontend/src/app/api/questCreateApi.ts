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
}

export type CharacterRole = 'npc' | 'monster';

export interface GeneratedCharacter {
  id: string;
  name: string;
  role: CharacterRole;
  appearance: string;
  background: string;
}

export interface GenerateObjectivesResult {
  objectives: Objective[];
  rewards: Reward[];
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
): Promise<GenerateObjectivesResult> {
  try {
    const { data } = await api.post('/quests/generate', { story, genre, templateId });
    return data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Failed to generate objectives'));
  }
}

export async function generateCharacters(
  story: string,
  genre: string,
): Promise<{ characters: GeneratedCharacter[] }> {
  try {
    const { data } = await api.post('/quests/generate-characters', { story, genre });
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
    });
    return data.questlineId;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Failed to generate questline'));
  }
}
