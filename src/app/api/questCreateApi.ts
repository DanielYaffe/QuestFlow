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

export async function generateQuestline(
  story: string,
  genre: string,
  objectives: Objective[],
  rewards: Reward[],
): Promise<string> {
  const { data } = await api.post('/quests/generate-questline', { story, genre, objectives, rewards });
  return data.questlineId;
}
