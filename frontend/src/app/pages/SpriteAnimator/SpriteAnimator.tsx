import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Coins, Film, Loader2 } from 'lucide-react';
import { AnimationsList } from './components/AnimationsList';
import { PlaybackControls } from './components/PlaybackControls';
import { PropertiesPanel } from './components/PropertiesPanel';
import { FrameTimeline } from './components/FrameTimeline';
import { NewAnimationModal, NewAnimationInput } from './components/NewAnimationModal';
import { ConfirmModal } from '../../components/shared/ConfirmModal';
import {
  AnimationDetail,
  AnimationSummary,
  deleteAnimation,
  editAnimation,
  exportAnimation,
  generateAnimation,
  getAnimation,
  getPixelLabBalance,
  listAnimations,
  PixelLabBalance,
  regenerateAnimation,
  updateAnimation,
} from '../../api/animationApi';
import { useSpriteJobs } from '../../context/SpriteJobContext';
import { useProject } from '../../context/ProjectContext';
import { createFramePlayer, loadImages, FramePlayer } from '../../utils/frameAnimator';
import { CHECKER_STYLE } from '../../utils/spriteStyles';
import { downloadUrl } from '../../utils/download';

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

interface DeepLink {
  spriteId?: string;
  animationId?: string;
  characterId?: string;
  sourceKey?: string;
}

function consumeDeepLink(): DeepLink {
  const query = window.location.hash.split('?')[1];
  if (!query) return {};
  const params = new URLSearchParams(query);
  const link: DeepLink = {
    spriteId: params.get('spriteId') ?? undefined,
    animationId: params.get('animationId') ?? undefined,
    characterId: params.get('characterId') ?? undefined,
    sourceKey: params.get('sourceKey') ?? undefined,
  };
  if (link.spriteId || link.animationId || link.characterId) {
    window.location.hash = '/sprite-animator';
  }
  return link;
}

export function SpriteAnimator() {
  const { activeProjectId } = useProject();
  const { registerAnimationJob } = useSpriteJobs();

  const [animations, setAnimations] = useState<AnimationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<AnimationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [balance, setBalance] = useState<PixelLabBalance | null>(null);
  const [modal, setModal] = useState<{ open: boolean; spriteId?: string; characterId?: string; sourceKey?: string }>({ open: false });
  const [pendingDelete, setPendingDelete] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<FramePlayer | null>(null);
  const deepLinkRef = useRef(false);
  const fpsSaveTimer = useRef<number>(0);

  const busy = selected?.status === 'generating';

  const refreshBalance = useCallback(() => {
    getPixelLabBalance().then(setBalance).catch(() => {});
  }, []);

  const refreshList = useCallback(async (): Promise<AnimationSummary[]> => {
    try {
      const list = await listAnimations();
      setAnimations(list);
      return list;
    } catch {
      toast.error('Failed to load animations');
      return [];
    } finally {
      setLoadingList(false);
    }
  }, []);

  const selectAnimation = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setIsPlaying(false);
    try {
      setSelected(await getAnimation(id));
      setCurrentFrame(0);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load animation'));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Initial load + deep links (consumed once).
  useEffect(() => {
    setLoadingList(true);
    void refreshList().then((list) => {
      if (deepLinkRef.current) return;
      deepLinkRef.current = true;
      const link = consumeDeepLink();
      if (link.animationId) {
        void selectAnimation(link.animationId);
      } else if (link.spriteId) {
        setModal({ open: true, spriteId: link.spriteId });
      } else if (link.characterId && link.sourceKey) {
        setModal({ open: true, characterId: link.characterId, sourceKey: link.sourceKey });
      } else if (list.length > 0) {
        void selectAnimation(list[0]._id);
      }
    });
    refreshBalance();
  }, [activeProjectId, refreshList, selectAnimation, refreshBalance]);

  // Build the canvas player whenever the selected frames change.
  useEffect(() => {
    playerRef.current?.destroy();
    playerRef.current = null;
    setIsPlaying(false);
    setCurrentFrame(0);

    const canvas = canvasRef.current;
    if (!canvas || !selected || selected.frameUrls.length === 0) {
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let cancelled = false;
    loadImages(selected.frameUrls)
      .then((images) => {
        if (cancelled || !canvasRef.current) return;
        playerRef.current = createFramePlayer({
          canvas: canvasRef.current,
          images,
          fps: selected.fps,
          loop: selected.loop,
          onFrame: setCurrentFrame,
          onEnded: () => setIsPlaying(false),
        });
      })
      .catch(() => toast.error('Failed to load animation frames'));

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // frameUrls identity changes with every fetch of the same doc — key on content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?._id, selected?.frameUrls.join('|')]);

  // Poll while the selected animation is generating (covers page reloads
  // mid-job, where the SSE registration lives in the job context instead).
  useEffect(() => {
    if (!selected || selected.status !== 'generating') return;
    const interval = window.setInterval(async () => {
      try {
        const fresh = await getAnimation(selected._id);
        if (fresh.status !== 'generating') {
          setSelected(fresh);
          void refreshList();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [selected, refreshList]);

  const registerJob = useCallback((jobId: string, animationId: string, label: string) => {
    registerAnimationJob(jobId, {
      label,
      link: `/sprite-animator?animationId=${animationId}`,
      onDone: () => {
        void refreshList();
        setSelected((current) => {
          if (current?._id === animationId) {
            void getAnimation(animationId).then(setSelected).catch(() => {});
          }
          return current;
        });
        refreshBalance();
      },
    });
  }, [registerAnimationJob, refreshList, refreshBalance]);

  const handleCreate = async (input: NewAnimationInput) => {
    try {
      const { animationId, jobId } = await generateAnimation(input);
      registerJob(jobId, animationId, input.name);
      await refreshList();
      await selectAnimation(animationId);
      toast.success('Generating animation — this takes 30–180 seconds');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to start generation'));
      throw err;
    }
  };

  const handleRegenerate = async (action: string, frameCount: number) => {
    if (!selected || !action) return;
    try {
      const { jobId } = await regenerateAnimation(selected._id, { action, frameCount });
      registerJob(jobId, selected._id, selected.name);
      setSelected({ ...selected, status: 'generating', statusError: '' });
      void refreshList();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to start regeneration'));
    }
  };

  const handleEditWithText = async (instruction: string) => {
    if (!selected || !instruction) return;
    try {
      const { jobId } = await editAnimation(selected._id, instruction);
      registerJob(jobId, selected._id, selected.name);
      setSelected({ ...selected, status: 'generating', statusError: '' });
      void refreshList();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to start edit'));
    }
  };

  const saveDetailPatch = async (patch: Parameters<typeof updateAnimation>[1]) => {
    if (!selected) return;
    try {
      const fresh = await updateAnimation(selected._id, patch);
      setSelected(fresh);
      void refreshList();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save'));
    }
  };

  const handleFpsChange = (fps: number) => {
    if (!selected) return;
    playerRef.current?.setFps(fps);
    setSelected({ ...selected, fps });
    // Persist once the slider settles.
    const animationId = selected._id;
    window.clearTimeout(fpsSaveTimer.current);
    fpsSaveTimer.current = window.setTimeout(() => {
      updateAnimation(animationId, { fps }).catch(() => {});
    }, 600);
  };

  const handleLoopToggle = () => {
    if (!selected) return;
    const loop = !selected.loop;
    playerRef.current?.setLoop(loop);
    void saveDetailPatch({ loop });
  };

  const handleTogglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleStep = (direction: -1 | 1) => {
    if (!playerRef.current || !selected) return;
    playerRef.current.pause();
    setIsPlaying(false);
    const next = (currentFrame + direction + selected.frameUrls.length) % selected.frameUrls.length;
    playerRef.current.seek(next);
  };

  const handleFrameMove = (index: number, direction: -1 | 1) => {
    if (!selected) return;
    const keys = [...selected.frameKeys];
    const target = index + direction;
    if (target < 0 || target >= keys.length) return;
    [keys[index], keys[target]] = [keys[target], keys[index]];
    void saveDetailPatch({ frameKeys: keys });
  };

  const handleFrameDelete = (index: number) => {
    if (!selected || selected.frameKeys.length <= 1) return;
    const keys = selected.frameKeys.filter((_, i) => i !== index);
    void saveDetailPatch({ frameKeys: keys });
  };

  const handleExport = async (formats: ('spritesheet' | 'gif')[]) => {
    if (!selected) return;
    try {
      const result = await exportAnimation(selected._id, formats);
      const base = selected.name.replace(/[^\w-]+/g, '_').toLowerCase() || 'animation';
      if (result.spritesheetUrl) await downloadUrl(result.spritesheetUrl, `${base}-sheet.png`);
      if (result.spritesheetJsonUrl) await downloadUrl(result.spritesheetJsonUrl, `${base}-sheet.json`);
      if (result.gifUrl) await downloadUrl(result.gifUrl, `${base}.gif`);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setPendingDelete(false);
    try {
      await deleteAnimation(selected._id);
      toast.success('Animation deleted');
      setSelected(null);
      const list = await refreshList();
      if (list.length > 0) void selectAnimation(list[0]._id);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete'));
    }
  };

  return (
    <div className="h-full flex overflow-hidden bg-steel-950">
      <NewAnimationModal
        isOpen={modal.open}
        initialSpriteId={modal.spriteId}
        characterId={modal.characterId}
        characterSourceKey={modal.sourceKey}
        onClose={() => setModal({ open: false })}
        onSubmit={handleCreate}
      />
      <ConfirmModal
        isOpen={pendingDelete}
        title="Delete animation?"
        message={`"${selected?.name}" and all its frames will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(false)}
      />

      <AnimationsList
        animations={animations}
        selectedId={selected?._id ?? null}
        loading={loadingList}
        onSelect={(id) => void selectAnimation(id)}
        onNew={() => setModal({ open: true })}
      />

      {/* Center: player */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header strip */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-steel-700 bg-steel-900">
          <h1 className="text-steel-100 text-sm font-semibold truncate">
            {selected ? selected.name : 'Sprite Animator'}
          </h1>
          {selected && selected.frameUrls.length > 0 && (
            <span className="text-steel-500 text-xs tabular-nums">
              frame {currentFrame + 1}/{selected.frameUrls.length}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-steel-400 bg-steel-850 border border-steel-700 rounded-md px-2.5 py-1.5" title="PixelLab balance">
            <Coins className="w-3.5 h-3.5 text-volt" />
            {balance ? (
              <span className="tabular-nums">
                {balance.generationsLeft != null ? `${balance.generationsLeft}/${balance.generationsTotal ?? '—'} gen` : ''}
                {balance.generationsLeft != null ? ' · ' : ''}${balance.usd.toFixed(2)}
              </span>
            ) : (
              <span>PixelLab</span>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden relative">
          {loadingDetail ? (
            <Loader2 className="w-6 h-6 text-pulse animate-spin" />
          ) : !selected ? (
            <div className="text-center">
              <Film className="w-10 h-10 mx-auto mb-3 text-steel-600" />
              <p className="text-steel-400 text-sm mb-1">No animation selected</p>
              <p className="text-steel-500 text-xs">Create one from a sprite to get started.</p>
            </div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={384}
                height={384}
                className="rounded-md border border-steel-700"
                style={CHECKER_STYLE}
              />
              {busy && (
                <div className="absolute inset-0 rounded-md bg-steel-950/70 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 text-pulse animate-spin" />
                  <p className="text-steel-200 text-xs">Generating frames…</p>
                </div>
              )}
              {selected.status === 'failed' && (
                <div className="absolute inset-x-0 -bottom-9 text-center">
                  <p className="text-[#e5484d] text-xs truncate" title={selected.statusError}>
                    {selected.statusError || 'Generation failed'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls + timeline */}
        {selected && (
          <>
            <div className="flex items-center justify-center px-4 py-2.5 border-t border-steel-700 bg-steel-900">
              <PlaybackControls
                isPlaying={isPlaying}
                fps={selected.fps}
                loop={selected.loop}
                disabled={busy || selected.frameUrls.length === 0}
                onTogglePlay={handleTogglePlay}
                onStep={handleStep}
                onFpsChange={handleFpsChange}
                onLoopToggle={handleLoopToggle}
              />
              {/* Persist fps after the slider settles */}
            </div>
            <FrameTimeline
              frameUrls={selected.frameUrls}
              currentIndex={currentFrame}
              disabled={busy}
              onSelect={(i) => { playerRef.current?.pause(); setIsPlaying(false); playerRef.current?.seek(i); }}
              onMove={handleFrameMove}
              onDelete={handleFrameDelete}
            />
          </>
        )}
      </div>

      {/* Right: properties */}
      {selected && (
        <PropertiesPanel
          animation={selected}
          busy={Boolean(busy)}
          onRename={(name) => void saveDetailPatch({ name })}
          onRegenerate={(action, frameCount) => void handleRegenerate(action, frameCount)}
          onEditWithText={(instruction) => void handleEditWithText(instruction)}
          onExport={handleExport}
          onDelete={() => setPendingDelete(true)}
        />
      )}
    </div>
  );
}
