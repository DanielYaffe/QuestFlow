import React from 'react';
import { Download } from 'lucide-react';

interface SpriteCardProps {
  name: string;
  prompt: string;
}

export function SpriteCard({ name, prompt }: SpriteCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors group">
      <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 aspect-square flex items-center justify-center">
        <div className="w-16 h-16 bg-zinc-700 rounded-lg" />
      </div>
      <div className="p-4">
        <h4 className="text-white text-sm mb-1">{name}</h4>
        <p className="text-zinc-500 text-xs mb-3 line-clamp-2">{prompt}</p>
        <button className="w-full px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded transition-colors flex items-center justify-center gap-2">
          <Download className="w-3 h-3" />
          Download
        </button>
      </div>
    </div>
  );
}
