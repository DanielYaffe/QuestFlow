import React from 'react';
import { PlayCircle, Pause, SkipBack, SkipForward, Plus } from 'lucide-react';

interface Frame {
  id: number;
  name: string;
}

interface PlaybackControlsProps {
  isPlaying: boolean;
  fps: number;
  currentFrame: number;
  frames: Frame[];
  onTogglePlay: () => void;
  onFrameSelect: (index: number) => void;
  onFpsChange: (fps: number) => void;
}

export function PlaybackControls({
  isPlaying,
  fps,
  currentFrame,
  frames,
  onTogglePlay,
  onFrameSelect,
  onFpsChange,
}: PlaybackControlsProps) {
  return (
    <>
      {/* Playback Controls */}
      <div className="bg-zinc-900 border-t border-zinc-800 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-4 mb-6">
            <button className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={onTogglePlay}
              className="p-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <PlayCircle className="w-6 h-6" />}
            </button>
            <button className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm">FPS:</span>
            <input
              type="range"
              min="1"
              max="60"
              value={fps}
              onChange={(e) => onFpsChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-white text-sm w-12 text-right">{fps}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-zinc-900 border-t border-zinc-800 p-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {frames.map((frame, index) => (
            <div
              key={frame.id}
              onClick={() => onFrameSelect(index)}
              className={`w-24 h-24 rounded-lg border-2 cursor-pointer transition-all ${
                currentFrame === index
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="w-full h-full flex flex-col items-center justify-center">
                <div className="w-12 h-12 bg-zinc-700 rounded mb-1" />
                <span className="text-zinc-500 text-xs">{frame.name}</span>
              </div>
            </div>
          ))}
          <button className="w-24 h-24 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-600 transition-colors flex items-center justify-center text-zinc-600 hover:text-zinc-500">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>
    </>
  );
}
