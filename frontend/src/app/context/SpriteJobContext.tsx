import React, { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SpriteRecord, watchSpriteJob } from '../api/spriteApi';
import { watchAnimationJob } from '../api/animationApi';
import { updateCharacterImage, updateRewardImage } from '../api/projectSidebarApi';
import { attachSpriteToCharacter } from '../api/characterApi';
import { attachSpriteToItem } from '../api/itemApi';

export type SpriteJobAction =
  | { type: 'character'; questlineId: string; entityId: string }
  | { type: 'reward';    questlineId: string; entityId: string }
  // Design studio: attach the finished sprite to a unified Character.
  | { type: 'studio-sprite'; characterId: string }
  // Design studio: attach the finished sprite to an Item design.
  | { type: 'studio-item-sprite'; itemId: string };

export interface SpriteJobMeta {
  label: string;
  action?: SpriteJobAction;
  onDone?: (result: SpriteRecord) => void;
  onError?: (msg: string) => void;
}

export interface ActiveSpriteJob {
  jobId: string;
  label: string;
  startedAt: number;
}

// Animation jobs (PixelLab) ride the same persistence/timeout/toast machinery;
// they stream over the generic /jobs SSE endpoint instead of the sprite one.
export interface AnimationJobMeta {
  label: string;
  /** Hash link for the toast's "View" action, e.g. `/sprite-animator?animationId=…` */
  link?: string;
  onDone?: () => void;
  onError?: (msg: string) => void;
}

interface SpriteJobContextValue {
  registerJob: (jobId: string, meta: SpriteJobMeta) => void;
  registerAnimationJob: (jobId: string, meta: AnimationJobMeta) => void;
  activeJobs: ActiveSpriteJob[];
}

const STORAGE_KEY = 'spriteActiveJobs';
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

interface PersistedJob {
  jobId: string;
  label: string;
  startedAt: number;
  action?: SpriteJobAction;
  queue?: 'sprite' | 'animation';
  link?: string;
}

function loadPersistedJobs(): PersistedJob[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persistJob(
  jobId: string,
  label: string,
  action?: SpriteJobAction,
  queue: 'sprite' | 'animation' = 'sprite',
  link?: string,
) {
  const jobs = loadPersistedJobs().filter((j) => j.jobId !== jobId);
  jobs.push({
    jobId,
    label,
    startedAt: Date.now(),
    queue,
    ...(action ? { action } : {}),
    ...(link ? { link } : {}),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function clearPersistedJob(jobId: string) {
  const jobs = loadPersistedJobs().filter((j) => j.jobId !== jobId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

const SpriteJobContext = createContext<SpriteJobContextValue>({
  registerJob: () => {},
  registerAnimationJob: () => {},
  activeJobs: [],
});

export function useSpriteJobs() {
  return useContext(SpriteJobContext);
}

export function SpriteJobProvider({ children }: { children: React.ReactNode }) {
  const cleanups = useRef<Map<string, () => void>>(new Map());
  const [activeJobs, setActiveJobs] = useState<ActiveSpriteJob[]>(() => loadPersistedJobs());

  const syncActiveJobs = useCallback(() => {
    setActiveJobs(loadPersistedJobs());
  }, []);

  const connectJob = useCallback((
    jobId: string,
    label: string,
    action?: SpriteJobAction,
    meta?: Omit<SpriteJobMeta, 'label' | 'action'>,
    startedAt: number = Date.now(),
  ) => {
    cleanups.current.get(jobId)?.();

    const remaining = JOB_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining <= 0) {
      clearPersistedJob(jobId);
      syncActiveJobs();
      toast.error(`Image generation timed out: ${label}`, { duration: 8_000 });
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanups.current.delete(jobId);
      clearPersistedJob(jobId);
      syncActiveJobs();
      meta?.onError?.('Generation timed out');
      toast.error(`Image generation timed out: ${label}`, { duration: 8_000 });
    }, remaining);

    const cleanup = watchSpriteJob(
      jobId,
      async (result) => {
        clearTimeout(timeoutId);
        cleanups.current.delete(jobId);
        clearPersistedJob(jobId);
        syncActiveJobs();
        if (action?.type === 'character' && result.imageKey) {
          await updateCharacterImage(action.questlineId, action.entityId, result.imageKey).catch(() => {});
        } else if (action?.type === 'reward' && result.imageKey) {
          await updateRewardImage(action.questlineId, action.entityId, result.imageKey).catch(() => {});
        } else if (action?.type === 'studio-sprite' && result.imageKey) {
          await attachSpriteToCharacter(action.characterId, result.imageKey).catch(() => {});
        } else if (action?.type === 'studio-item-sprite' && result.imageKey) {
          await attachSpriteToItem(action.itemId, result.imageKey).catch(() => {});
        }
        meta?.onDone?.(result);
        toast.success(`Image ready: ${label}`, {
          description: 'Your generated image is ready.',
          duration: 10_000,
          action: {
            label: 'View image',
            onClick: () => { window.location.hash = `/sprite-generator?spriteId=${result._id}`; },
          },
        });
      },
      (msg) => {
        clearTimeout(timeoutId);
        cleanups.current.delete(jobId);
        clearPersistedJob(jobId);
        syncActiveJobs();
        meta?.onError?.(msg);
        toast.error(`Image generation failed: ${label}`, { description: msg, duration: 8_000 });
      },
    );

    cleanups.current.set(jobId, () => { clearTimeout(timeoutId); cleanup(); });
  }, [syncActiveJobs]);

  const connectAnimationJob = useCallback((
    jobId: string,
    label: string,
    link?: string,
    meta?: Omit<AnimationJobMeta, 'label' | 'link'>,
    startedAt: number = Date.now(),
  ) => {
    cleanups.current.get(jobId)?.();

    const remaining = JOB_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining <= 0) {
      clearPersistedJob(jobId);
      syncActiveJobs();
      toast.error(`Animation timed out: ${label}`, { duration: 8_000 });
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanups.current.delete(jobId);
      clearPersistedJob(jobId);
      syncActiveJobs();
      meta?.onError?.('Generation timed out');
      toast.error(`Animation timed out: ${label}`, { duration: 8_000 });
    }, remaining);

    const cleanup = watchAnimationJob(
      jobId,
      () => {
        clearTimeout(timeoutId);
        cleanups.current.delete(jobId);
        clearPersistedJob(jobId);
        syncActiveJobs();
        meta?.onDone?.();
        toast.success(`Animation ready: ${label}`, {
          duration: 10_000,
          ...(link
            ? { action: { label: 'View', onClick: () => { window.location.hash = link; } } }
            : {}),
        });
      },
      (msg) => {
        clearTimeout(timeoutId);
        cleanups.current.delete(jobId);
        clearPersistedJob(jobId);
        syncActiveJobs();
        meta?.onError?.(msg);
        toast.error(`Animation failed: ${label}`, { description: msg, duration: 8_000 });
      },
    );

    cleanups.current.set(jobId, () => { clearTimeout(timeoutId); cleanup(); });
  }, [syncActiveJobs]);

  useEffect(() => {
    const pending = loadPersistedJobs();
    for (const { jobId, label, action, startedAt, queue, link } of pending) {
      if (queue === 'animation') {
        connectAnimationJob(jobId, label, link, undefined, startedAt);
      } else {
        connectJob(jobId, label, action, undefined, startedAt);
      }
    }
    return () => {
      cleanups.current.forEach((cleanup) => cleanup());
      cleanups.current.clear();
    };
  }, [connectJob, connectAnimationJob]);

  const registerJob = useCallback((jobId: string, meta: SpriteJobMeta) => {
    persistJob(jobId, meta.label, meta.action);
    syncActiveJobs();
    connectJob(jobId, meta.label, meta.action, meta);
  }, [connectJob, syncActiveJobs]);

  const registerAnimationJob = useCallback((jobId: string, meta: AnimationJobMeta) => {
    persistJob(jobId, meta.label, undefined, 'animation', meta.link);
    syncActiveJobs();
    connectAnimationJob(jobId, meta.label, meta.link, meta);
  }, [connectAnimationJob, syncActiveJobs]);

  return (
    <SpriteJobContext.Provider value={{ registerJob, registerAnimationJob, activeJobs }}>
      {children}
    </SpriteJobContext.Provider>
  );
}
