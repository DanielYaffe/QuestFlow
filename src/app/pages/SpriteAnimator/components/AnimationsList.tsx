import React from 'react';

interface Animation {
  id: number;
  name: string;
  frames: number;
  duration: string;
}

interface AnimationsListProps {
  animations: Animation[];
}

export function AnimationsList({ animations }: AnimationsListProps) {
  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 overflow-auto">
      <div className="p-4">
        <h3 className="text-white mb-4">My Animations</h3>
        <div className="space-y-2">
          {animations.map((animation) => (
            <div
              key={animation.id}
              className="bg-zinc-800 hover:bg-zinc-750 rounded-lg p-3 cursor-pointer transition-colors"
            >
              <h4 className="text-white text-sm mb-1">{animation.name}</h4>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{animation.frames} frames</span>
                <span>{animation.duration}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="w-full mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
          New Animation
        </button>
      </div>
    </div>
  );
}
