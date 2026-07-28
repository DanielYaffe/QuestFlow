import { NodeVariant } from '../types/quest';
import api from './axiosInstance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Character = {
  id: string;
  name: string;
  kind?: 'npc' | 'monster';
  appearance: string;
  background: string;
  imageUrl?: string;
  questIds: string[];
  // "{gameId}:{entityName}" when materialized from a KB entity; '' otherwise.
  kbRef?: string;
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
  imageUrl?: string;
  // "{gameId}:{entityName}" when the reward is an existing KB item; '' otherwise.
  kbRef?: string;
  // Linked studio Item design; its sprite backs imageUrl when set. '' = none.
  itemId?: string;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchCharacters(questlineId: string): Promise<Character[]> {
  const { data } = await api.get(`/questlines/${questlineId}/characters`);
  // Map MongoDB _id to id for frontend compatibility
  return data.map((c: Character & { _id?: string }) => ({ ...c, id: c._id ?? c.id }));
}

export async function fetchQuestSummaries(questlineId: string): Promise<QuestSummary[]> {
  const { data } = await api.get(`/questlines/${questlineId}/quests`);
  return data;
}

export async function fetchRewards(questlineId: string): Promise<Reward[]> {
  const { data } = await api.get(`/questlines/${questlineId}/rewards`);
  return data.map((r: Reward & { _id?: string }) => ({ ...r, id: r._id ?? r.id }));
}

// Attach an existing project character/monster to this questline's roster.
export async function attachCharacter(
  questlineId: string,
  characterId: string,
): Promise<Character> {
  const { data } = await api.post<Character & { _id?: string }>(
    `/questlines/${questlineId}/characters`,
    { characterId },
  );
  return { ...data, id: data._id ?? data.id };
}

// Detach a character from this questline (roster + node references). The
// project-scoped design is kept; only this questline's link is removed.
export async function detachCharacter(
  questlineId: string,
  characterId: string,
): Promise<void> {
  await api.delete(`/questlines/${questlineId}/characters/${characterId}`);
}

export async function updateCharacter(
  questlineId: string,
  characterId: string,
  patch: Partial<Omit<Character, 'id' | 'questIds'>>,
): Promise<void> {
  await api.put(`/questlines/${questlineId}/characters/${characterId}`, patch);
}

export async function updateCharacterImage(
  questlineId: string,
  characterId: string,
  imageUrl: string,
): Promise<void> {
  await api.put(`/questlines/${questlineId}/characters/${characterId}`, { imageUrl });
}

export async function createReward(
  questlineId: string,
  input: { title: string; description?: string; rarity?: Reward['rarity']; itemId?: string },
): Promise<Reward> {
  const { data } = await api.post<Reward & { _id?: string }>(`/questlines/${questlineId}/rewards`, input);
  return { ...data, id: data._id ?? data.id };
}

export async function updateReward(
  questlineId: string,
  rewardId: string,
  patch: Partial<Omit<Reward, 'id'>>,
): Promise<void> {
  await api.put(`/questlines/${questlineId}/rewards/${rewardId}`, patch);
}

export async function updateRewardImage(
  questlineId: string,
  rewardId: string,
  imageUrl: string,
): Promise<void> {
  await api.put(`/questlines/${questlineId}/rewards/${rewardId}`, { imageUrl });
}

export async function deleteReward(questlineId: string, rewardId: string): Promise<void> {
  await api.delete(`/questlines/${questlineId}/rewards/${rewardId}`);
}

// How many quest nodes in this questline reference the reward.
export async function getRewardUsage(
  questlineId: string,
  rewardId: string,
): Promise<{ nodeCount: number }> {
  const { data } = await api.get(`/questlines/${questlineId}/rewards/${rewardId}/usage`);
  return data;
}
