import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { SpriteRecord, watchSpriteJob } from '../api/spriteApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpriteJobMeta {
  /** Human-readable label shown in the toast, e.g. "Aldric the Brave" */
  label: string;
  /** Called when the job completes successfully */
  onDone?: (result: SpriteRecord) => void;
  /** Called when the job fails */
  onError?: (msg: string) => void;
}

interface SpriteJobContextValue {
  /**
   * Register a background sprite job.
   * Opens a persistent SSE connection at app level so navigation doesn't kill it.
   * Job ID and label are persisted to localStorage so a refresh reconnects automatically.
   */
  registerJob: (jobId: string, meta: SpriteJobMeta) => void;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'spriteActiveJobs';

interface PersistedJob {
  jobId: string;
  label: string;
}

function loadPersistedJobs(): PersistedJob[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persistJob(jobId: string, label: string) {
  const jobs = loadPersistedJobs().filter((j) => j.jobId !== jobId);
  jobs.push({ jobId, label });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function clearPersistedJob(jobId: string) {
  const jobs = loadPersistedJobs().filter((j) => j.jobId !== jobId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SpriteJobContext = createContext<SpriteJobContextValue>({
  registerJob: () => {},
});

export function useSpriteJobs() {
  return useContext(SpriteJobContext);
}

// ---------------------------------------------------------------------------
// Provider — mounts once at app root, survives route changes and page refreshes
// ---------------------------------------------------------------------------

export function SpriteJobProvider({ children }: { children: React.ReactNode }) {
  // Map of jobId → SSE cleanup fn
  const cleanups = useRef<Map<string, () => void>>(new Map());

  const connectJob = useCallback((jobId: string, label: string, meta?: Omit<SpriteJobMeta, 'label'>) => {
    cleanups.current.get(jobId)?.();

    const cleanup = watchSpriteJob(
      jobId,
      (result) => {
        cleanups.current.delete(jobId);
        clearPersistedJob(jobId);
        meta?.onDone?.(result);
        toast.success(`Image ready: ${label}`, {
          description: 'Your generated image is ready.',
          duration: 10_000,
        });
      },
      (msg) => {
        cleanups.current.delete(jobId);
        clearPersistedJob(jobId);
        meta?.onError?.(msg);
        toast.error(`Image generation failed: ${label}`, {
          description: msg,
          duration: 8_000,
        });
      },
    );

    cleanups.current.set(jobId, cleanup);
  }, []);

  // On mount: reconnect any jobs that were in-progress when the page was refreshed
  useEffect(() => {
    const pending = loadPersistedJobs();
    for (const { jobId, label } of pending) {
      // No onDone/onError callbacks — the original caller is gone after refresh.
      // Toast notifications will still fire.
      connectJob(jobId, label);
    }

    return () => {
      cleanups.current.forEach((cleanup) => cleanup());
      cleanups.current.clear();
    };
  }, [connectJob]);

  const registerJob = useCallback((jobId: string, meta: SpriteJobMeta) => {
    persistJob(jobId, meta.label);
    connectJob(jobId, meta.label, meta);
  }, [connectJob]);

  return (
    <SpriteJobContext.Provider value={{ registerJob }}>
      {children}
    </SpriteJobContext.Provider>
  );
}
