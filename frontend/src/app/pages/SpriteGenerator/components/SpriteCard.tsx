import React from 'react';
import { Download } from 'lucide-react';

interface SpriteCardProps {
  name: string;
  prompt: string;
}

export function SpriteCard({ name, prompt }: SpriteCardProps) {
  return (
    <div className="bg-steel-850 border border-steel-700 rounded-lg overflow-hidden hover:border-steel-600 transition-colors group">
      <div className="bg-steel-800 aspect-square flex items-center justify-center">
        <div className="w-16 h-16 bg-steel-700 rounded-lg" />
      </div>
      <div className="p-4">
        <h4 className="text-steel-100 text-sm mb-1">{name}</h4>
        <p className="text-steel-400 text-xs mb-3 line-clamp-2">{prompt}</p>
        <button className="w-full px-3 py-1.5 bg-steel-800 hover:bg-steel-700 text-steel-200 text-xs rounded transition-colors flex items-center justify-center gap-2">
          <Download className="w-3 h-3" />
          Download
        </button>
      </div>
    </div>
  );
}
