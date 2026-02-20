import React from 'react';
import { Workflow, Clock } from 'lucide-react';

interface ProjectCardProps {
  name: string;
  type: string;
  nodes: number;
  lastEdited: string;
  thumbnail: string;
  onClick: () => void;
}

export function ProjectCard({ name, type, nodes, lastEdited, thumbnail, onClick }: ProjectCardProps) {
  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <div className={`h-32 ${thumbnail}`} />
      <div className="p-6">
        <h3 className="text-white mb-1 group-hover:text-purple-400 transition-colors">{name}</h3>
        <p className="text-zinc-500 text-sm mb-4">{type}</p>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-zinc-400">
            <Workflow className="w-3 h-3" />
            <span>{nodes} nodes</span>
          </div>
          <div className="flex items-center gap-1 text-zinc-400">
            <Clock className="w-3 h-3" />
            <span>{lastEdited}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
