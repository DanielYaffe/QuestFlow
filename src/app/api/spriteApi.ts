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

// Returns immediately with a jobId — generation runs in the background
export async function generateSprite(
  prompt: string,
  filters: Partial<SpriteFilters>,
): Promise<{ jobId: string }> {
  const { data } = await api.post<{ jobId: string }>('/sprites/generate', { prompt, filters });
  return data;
}

// Opens an SSE connection that resolves when the job completes.
// Returns a cleanup function that closes the connection.
export function watchSpriteJob(
  jobId: string,
  onDone: (result: SpriteRecord) => void,
  onError: (msg: string) => void,
): () => void {
  const token = localStorage.getItem('token') ?? '';
  const es = new EventSource(
    `http://localhost:3000/sprites/jobs/${jobId}/stream?token=${encodeURIComponent(token)}`,
  );

  es.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data) as { status: string; result?: SpriteRecord; error?: string };
      if (payload.status === 'done' && payload.result) {
        onDone(payload.result);
        es.close();
      } else if (payload.status === 'failed') {
        onError(payload.error ?? 'Generation failed');
        es.close();
      }
    } catch {
      onError('Unexpected response from server');
      es.close();
    }
  };

  es.onerror = () => {
    onError('Connection lost — check your network');
    es.close();
  };

  return () => es.close();
}

export async function getSprites(): Promise<SpriteRecord[]> {
  const { data } = await api.get<SpriteRecord[]>('/sprites');
  return data;
}
