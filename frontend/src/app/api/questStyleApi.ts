import api from './axiosInstance';

export interface QuestStyle {
  _id: string;
  name: string;
  engine: string;
  description: string;
  promptSuffix: string;
  tier: 'free' | 'pro' | 'plus';
  imageUrl: string;
}

export async function getQuestStyles(): Promise<QuestStyle[]> {
  const { data } = await api.get<QuestStyle[]>('/quest-styles');
  return data;
}
