import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Repeat } from 'lucide-react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  fps: number;
  loop: boolean;
  disabled: boolean;
  onTogglePlay: () => void;
  onStep: (direction: -1 | 1) => void;
  onFpsChange: (fps: number) => void;
  onLoopToggle: () => void;
}

export function PlaybackControls({
  isPlaying, fps, loop, disabled, onTogglePlay, onStep, onFpsChange, onLoopToggle,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onStep(-1)}
          disabled={disabled}
          className="w-8 h-8 flex items-center justify-center rounded-md text-steel-400 hover:text-steel-100 hover:bg-steel-800 disabled:opacity-40 transition-colors cursor-pointer"
          title="Previous frame"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={onTogglePlay}
          disabled={disabled}
          className="w-9 h-9 flex items-center justify-center rounded-md bg-volt hover:brightness-95 text-steel-950 disabled:opacity-40 transition-[filter] cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <button
          onClick={() => onStep(1)}
          disabled={disabled}
          className="w-8 h-8 flex items-center justify-center rounded-md text-steel-400 hover:text-steel-100 hover:bg-steel-800 disabled:opacity-40 transition-colors cursor-pointer"
          title="Next frame"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-steel-400 text-[11px] uppercase tracking-wider font-semibold">FPS</span>
        <input
          type="range"
          min={1}
          max={24}
          value={fps}
          disabled={disabled}
          onChange={(e) => onFpsChange(Number(e.target.value))}
          className="w-28 accent-pulse"
        />
        <span className="text-steel-200 text-xs tabular-nums w-6">{fps}</span>
      </div>

      <button
        onClick={onLoopToggle}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer disabled:opacity-40 ${
          loop ? 'bg-steel-800 text-pulse' : 'text-steel-400 hover:text-steel-100 hover:bg-steel-800'
        }`}
        title="Toggle looping"
      >
        <Repeat className="w-3.5 h-3.5" />
        Loop
      </button>
    </div>
  );
}
