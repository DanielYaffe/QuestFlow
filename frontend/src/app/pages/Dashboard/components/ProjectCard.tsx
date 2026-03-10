import React from 'react';
import { Clock } from 'lucide-react';

interface ProjectCardProps {
  id: string;
  name: string;
  lastEdited: string;
  thumbnail: string;
  onClick: () => void;
}

export function ProjectCard({ name, lastEdited, thumbnail, onClick }: ProjectCardProps) {
  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className={`h-28 ${thumbnail}`} />
      <div className="p-4">
        <h3 className="text-white text-sm font-medium mb-2 group-hover:text-purple-400 transition-colors truncate">{name}</h3>
        <div className="flex items-center gap-1 text-zinc-500 text-xs">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>{lastEdited}</span>
        </div>
      </div>
    </div>
  );
}
