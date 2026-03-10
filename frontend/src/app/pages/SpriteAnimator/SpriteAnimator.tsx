import React, { useState } from 'react';
import { AnimationsList } from './components/AnimationsList';
import { PlaybackControls } from './components/PlaybackControls';
import { PropertiesPanel } from './components/PropertiesPanel';

const frames = [
  { id: 1, name: 'Frame 1' },
  { id: 2, name: 'Frame 2' },
  { id: 3, name: 'Frame 3' },
  { id: 4, name: 'Frame 4' },
  { id: 5, name: 'Frame 5' },
  { id: 6, name: 'Frame 6' },
];

const animations = [
  { id: 1, name: 'Idle Animation', frames: 4, duration: '0.5s' },
  { id: 2, name: 'Walk Cycle', frames: 8, duration: '1.0s' },
  { id: 3, name: 'Attack', frames: 6, duration: '0.8s' },
];

export function SpriteAnimator() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(12);

  return (
    <div className="h-full flex overflow-hidden">
      <AnimationsList animations={animations} />

      {/* Center */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 bg-zinc-950 flex items-center justify-center p-8">
          <div className="relative">
            <div className="bg-zinc-900 border-2 border-zinc-800 rounded-lg w-[400px] h-[400px] flex items-center justify-center">
              <div className="w-32 h-32 bg-zinc-700 rounded-lg" />
            </div>
            <div className="absolute -bottom-12 left-0 right-0 text-center">
              <p className="text-zinc-500 text-sm">
                Frame {currentFrame + 1} of {frames.length}
              </p>
            </div>
          </div>
        </div>

        <PlaybackControls
          isPlaying={isPlaying}
          fps={fps}
          currentFrame={currentFrame}
          frames={frames}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onFrameSelect={setCurrentFrame}
          onFpsChange={setFps}
        />
      </div>

      <PropertiesPanel />
    </div>
  );
}
