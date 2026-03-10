import api from './axiosInstance';

export interface Objective {
  id: string;
  title: string;
  description: string;
}

export interface Reward {
  id: string;
  title: string;
  rarity: 'common' | 'rare' | 'epic';
}

export type CharacterRole = 'npc' | 'villain' | 'ally' | 'monster' | 'neutral';

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

export async function generateObjectives(
  story: string,
  genre: string,
): Promise<GenerateObjectivesResult> {
  const { data } = await api.post('/quests/generate', { story, genre });
  return data;
}

export async function generateCharacters(
  story: string,
  genre: string,
): Promise<{ characters: GeneratedCharacter[] }> {
  const { data } = await api.post('/quests/generate-characters', { story, genre });
  return data;
}

export async function generateQuestline(
  story: string,
  genre: string,
  objectives: Objective[],
  rewards: Reward[],
  characters: GeneratedCharacter[],
  styleId: string,
): Promise<string> {
  const { data } = await api.post('/quests/generate-questline', { story, genre, objectives, rewards, characters, styleId });
  return data.questlineId;
}
