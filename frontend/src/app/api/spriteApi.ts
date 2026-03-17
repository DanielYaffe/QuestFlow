/// <reference types="vite/client" />
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
  imageUrl: string;  // presigned URL — for display only, expires
  imageKey: string;  // S3 key — persist this to DB
  userPrompt: string;
  fullPrompt: string;
  filters: SpriteFilters;
  createdAt: string;
}

export async function generateSprite(
  prompt: string,
  filters: Partial<SpriteFilters>,
): Promise<{ jobId: string }> {
  const { data } = await api.post<{ jobId: string }>('/sprites/generate', { prompt, filters });
  return data;
}

export function watchSpriteJob(
  jobId: string,
  onDone: (result: SpriteRecord) => void,
  onError: (msg: string) => void,
): () => void {
  const token = localStorage.getItem('token') ?? '';
  const es = new EventSource(
    `${import.meta.env.VITE_API_URL}/sprites/jobs/${jobId}/stream?token=${encodeURIComponent(token)}`,
  );

  let settled = false;

  es.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data) as { status: string; result?: SpriteRecord; error?: string };
      if (payload.status === 'done' && payload.result) {
        settled = true;
        es.close();
        onDone(payload.result);
      } else if (payload.status === 'failed') {
        settled = true;
        es.close();
        onError(payload.error ?? 'Generation failed');
      }
    } catch {
      settled = true;
      es.close();
      onError('Unexpected response from server');
    }
  };

  es.onerror = () => {
    if (settled) return;
    if (document.visibilityState === 'hidden' || es.readyState === EventSource.CLOSED) return;
    es.close();
    onError('Connection lost — check your network');
  };

  return () => es.close();
}

export async function getSprites(): Promise<SpriteRecord[]> {
  const { data } = await api.get<SpriteRecord[]>('/sprites');
  return data;
}
