import api from './axiosInstance';

export interface SpriteFilters {
  artStyle: string;
  perspective: string;
  aspectRatio: string;
  background: string;
  colorPalette: string;
  detailLevel: string;
  category: string;
}

export interface SpriteRecord {
  _id: string;
  imageUrl: string;
  userPrompt: string;
  fullPrompt: string;
  filters: SpriteFilters;
  createdAt: string;
}

export async function generateSprite(
  prompt: string,
  filters: Partial<SpriteFilters>,
): Promise<SpriteRecord> {
  const { data } = await api.post<SpriteRecord>('/sprites/generate', { prompt, filters });
  return data;
}

export async function getSprites(): Promise<SpriteRecord[]> {
  const { data } = await api.get<SpriteRecord[]>('/sprites');
  return data;
}
