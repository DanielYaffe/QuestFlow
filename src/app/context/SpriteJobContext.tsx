import React, { createContext, useContext, useRef, useCallback } from 'react';
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
   */
  registerJob: (jobId: string, meta: SpriteJobMeta) => void;
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
// Provider — mounts once at app root, survives route changes
// ---------------------------------------------------------------------------

export function SpriteJobProvider({ children }: { children: React.ReactNode }) {
  // Map of jobId → SSE cleanup fn
  const cleanups = useRef<Map<string, () => void>>(new Map());

  const registerJob = useCallback((jobId: string, meta: SpriteJobMeta) => {
    // Close any previous SSE for this jobId (shouldn't happen, but be safe)
    cleanups.current.get(jobId)?.();

    const cleanup = watchSpriteJob(
      jobId,
      async (result) => {
        cleanups.current.delete(jobId);

        // Let the direct subscriber handle it first (e.g. update the panel)
        meta.onDone?.(result);

        // Always show a toast — even if the user navigated away
        toast.success(`Image ready: ${meta.label}`, {
          description: 'Your generated image is ready.',
          duration: 10_000,
        });
      },
      (msg) => {
        cleanups.current.delete(jobId);
        meta.onError?.(msg);
        toast.error(`Image generation failed: ${meta.label}`, {
          description: msg,
          duration: 8_000,
        });
      },
    );

    cleanups.current.set(jobId, cleanup);
  }, []);

  return (
    <SpriteJobContext.Provider value={{ registerJob }}>
      {children}
    </SpriteJobContext.Provider>
  );
}
