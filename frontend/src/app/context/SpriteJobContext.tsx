import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { SpriteRecord, watchSpriteJob } from '../api/spriteApi';
import { updateCharacterImage, updateRewardImage } from '../api/projectSidebarApi';

export type SpriteJobAction =
  | { type: 'character'; questlineId: string; entityId: string }
  | { type: 'reward';    questlineId: string; entityId: string };

export interface SpriteJobMeta {
  label: string;
  action?: SpriteJobAction;
  onDone?: (result: SpriteRecord) => void;
  onError?: (msg: string) => void;
}

interface SpriteJobContextValue {
  registerJob: (jobId: string, meta: SpriteJobMeta) => void;
}

const STORAGE_KEY = 'spriteActiveJobs';
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

interface PersistedJob {
  jobId: string;
  label: string;
  startedAt: number;
  action?: SpriteJobAction;
}

function loadPersistedJobs(): PersistedJob[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persistJob(jobId: string, label: string, action?: SpriteJobAction) {
  const jobs = loadPersistedJobs().filter((j) => j.jobId !== jobId);
  jobs.push({ jobId, label, startedAt: Date.now(), ...(action ? { action } : {}) });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function clearPersistedJob(jobId: string) {
  const jobs = loadPersistedJobs().filter((j) => j.jobId !== jobId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

const SpriteJobContext = createContext<SpriteJobContextValue>({
  registerJob: () => {},
});

export function useSpriteJobs() {
  return useContext(SpriteJobContext);
}

export function SpriteJobProvider({ children }: { children: React.ReactNode }) {
  const cleanups = useRef<Map<string, () => void>>(new Map());

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
      toast.error(`Image generation timed out: ${label}`, { duration: 8_000 });
      return;
    }

    const timeoutId = setTimeout(() => {
      cleanups.current.delete(jobId);
      clearPersistedJob(jobId);
      meta?.onError?.('Generation timed out');
      toast.error(`Image generation timed out: ${label}`, { duration: 8_000 });
    }, remaining);

    const cleanup = watchSpriteJob(
      jobId,
      async (result) => {
        clearTimeout(timeoutId);
        cleanups.current.delete(jobId);
        clearPersistedJob(jobId);
        if (action?.type === 'character') {
          await updateCharacterImage(action.questlineId, action.entityId, result.imageKey).catch(() => {});
        } else if (action?.type === 'reward') {
          await updateRewardImage(action.questlineId, action.entityId, result.imageKey).catch(() => {});
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
        meta?.onError?.(msg);
        toast.error(`Image generation failed: ${label}`, { description: msg, duration: 8_000 });
      },
    );

    cleanups.current.set(jobId, () => { clearTimeout(timeoutId); cleanup(); });
  }, []);

  useEffect(() => {
    const pending = loadPersistedJobs();
    for (const { jobId, label, action, startedAt } of pending) {
      connectJob(jobId, label, action, undefined, startedAt);
    }
    return () => {
      cleanups.current.forEach((cleanup) => cleanup());
      cleanups.current.clear();
    };
  }, [connectJob]);

  const registerJob = useCallback((jobId: string, meta: SpriteJobMeta) => {
    persistJob(jobId, meta.label, meta.action);
    connectJob(jobId, meta.label, meta.action, meta);
  }, [connectJob]);

  return (
    <SpriteJobContext.Provider value={{ registerJob }}>
      {children}
    </SpriteJobContext.Provider>
  );
}
