import { NodeVariant } from '../types/quest';
import api from './axiosInstance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Character = {
  id: string;
  name: string;
  appearance: string;
  background: string;
  imageUrl?: string;
  questIds: string[];
};

export type Chapter = {
  id: string;
  title: string;
  scenes: { id: string; title: string }[];
};

export type QuestSummary = {
  id: string;
  title: string;
  variant: NodeVariant;
};

export type Reward = {
  id: string;
  title: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchCharacters(questlineId: string): Promise<Character[]> {
  const { data } = await api.get(`/questlines/${questlineId}/characters`);
  // Map MongoDB _id to id for frontend compatibility
  return data.map((c: Character & { _id?: string }) => ({ ...c, id: c._id ?? c.id }));
}

export async function fetchChapters(questlineId: string): Promise<Chapter[]> {
  const { data } = await api.get(`/questlines/${questlineId}/chapters`);
  return data.map((ch: Chapter & { _id?: string }) => ({ ...ch, id: ch._id ?? ch.id }));
}

export async function fetchQuestSummaries(questlineId: string): Promise<QuestSummary[]> {
  const { data } = await api.get(`/questlines/${questlineId}/quests`);
  return data;
}

export async function fetchRewards(questlineId: string): Promise<Reward[]> {
  const { data } = await api.get(`/questlines/${questlineId}/rewards`);
  return data.map((r: Reward & { _id?: string }) => ({ ...r, id: r._id ?? r.id }));
}

export async function updateCharacterImage(
  questlineId: string,
  characterId: string,
  imageUrl: string,
): Promise<void> {
  await api.put(`/questlines/${questlineId}/characters/${characterId}`, { imageUrl });
}
