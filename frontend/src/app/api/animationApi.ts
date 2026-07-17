/// <reference types="vite/client" />
import api from './axiosInstance';

// ---------------------------------------------------------------------------
// Sprite animations (PixelLab-backed). Generation/edit are async jobs streamed
// over the generic /jobs/animation-generation/:jobId/stream SSE endpoint —
// payload shape { state, progress?, result?, error? } (unlike the
// sprite-specific stream's { status, result }).
// ---------------------------------------------------------------------------

export type AnimationStatus = 'generating' | 'ready' | 'failed';

export interface AnimationSummary {
  _id: string;
  name: string;
  action: string;
  status: AnimationStatus;
  statusError: string;
  fps: number;
  loop: boolean;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  spriteId: string;
  characterId: string;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnimationDetail extends AnimationSummary {
  frameKeys: string[];
  frameUrls: string[];
  sourceImageKey: string;
  sourceImageUrl: string;
}

export interface PixelLabBalance {
  usd: number;
  generationsLeft: number | null;
  generationsTotal: number | null;
  plan: string | null;
}

export interface AnimationExportResult {
  spritesheetUrl?: string;
  spritesheetJsonUrl?: string;
  gifUrl?: string;
}

export async function listAnimations(params?: {
  characterId?: string;
  spriteId?: string;
  all?: boolean;
}): Promise<AnimationSummary[]> {
  const { data } = await api.get<AnimationSummary[]>('/animations', {
    params: {
      characterId: params?.characterId || undefined,
      spriteId: params?.spriteId || undefined,
      all: params?.all ? '1' : undefined,
    },
  });
  return data;
}

export async function getAnimation(id: string): Promise<AnimationDetail> {
  const { data } = await api.get<AnimationDetail>(`/animations/${id}`);
  return data;
}

export async function generateAnimation(input: {
  name: string;
  action: string;
  frameCount?: number;
  spriteId?: string;
  sourceImageKey?: string;
  characterId?: string;
}): Promise<{ animationId: string; jobId: string }> {
  const { data } = await api.post<{ animationId: string; jobId: string }>('/animations/generate', input);
  return data;
}

export async function regenerateAnimation(
  id: string,
  input: { action: string; frameCount?: number },
): Promise<{ jobId: string }> {
  const { data } = await api.post<{ jobId: string }>(`/animations/${id}/regenerate`, input);
  return data;
}

export async function editAnimation(id: string, instruction: string): Promise<{ jobId: string }> {
  const { data } = await api.post<{ jobId: string }>(`/animations/${id}/edit`, { instruction });
  return data;
}

export async function updateAnimation(
  id: string,
  patch: { name?: string; fps?: number; loop?: boolean; frameKeys?: string[]; characterId?: string },
): Promise<AnimationDetail> {
  const { data } = await api.put<AnimationDetail>(`/animations/${id}`, patch);
  return data;
}

export async function deleteAnimation(id: string): Promise<void> {
  await api.delete(`/animations/${id}`);
}

export async function exportAnimation(
  id: string,
  formats: ('spritesheet' | 'gif')[],
): Promise<AnimationExportResult> {
  const { data } = await api.post<AnimationExportResult>(`/animations/${id}/export`, { formats });
  return data;
}

export async function getPixelLabBalance(): Promise<PixelLabBalance> {
  const { data } = await api.get<PixelLabBalance>('/pixellab/balance');
  return data;
}

/**
 * Watch an animation job over the generic jobs SSE stream. Returns a cleanup
 * function. onDone fires with the BullMQ return value when the job completes.
 */
export function watchAnimationJob(
  jobId: string,
  onDone: () => void,
  onError: (msg: string) => void,
): () => void {
  const token = localStorage.getItem('token') ?? '';
  const es = new EventSource(
    `${import.meta.env.VITE_API_URL}/jobs/animation-generation/${jobId}/stream?token=${encodeURIComponent(token)}`,
  );

  let settled = false;

  es.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data) as { state?: string; error?: string };
      if (payload.state === 'completed') {
        settled = true;
        es.close();
        onDone();
      } else if (payload.state === 'failed') {
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
