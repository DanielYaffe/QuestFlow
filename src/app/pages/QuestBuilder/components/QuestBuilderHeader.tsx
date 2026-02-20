import React from 'react';
import { Node } from '@xyflow/react';
import { LayoutGrid, Sparkles } from 'lucide-react';
import { QuestNodeData } from '../../../types/quest';

interface QuestBuilderHeaderProps {
  selectedNode: Node<QuestNodeData> | null;
  onOpenSidebar: () => void;
  onAutoLayout: () => void;
}

export function QuestBuilderHeader({ selectedNode, onOpenSidebar, onAutoLayout }: QuestBuilderHeaderProps) {
  return (
    <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-white text-xl">Quest Builder</h1>
          <p className="text-zinc-400 text-sm">Design your game quest flow</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {selectedNode && (
          <button
            onClick={onOpenSidebar}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            AI Assistant
          </button>
        )}
        <button
          onClick={onAutoLayout}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <LayoutGrid className="w-4 h-4" />
          Auto Layout
        </button>
        <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
          Export Quest
        </button>
      </div>
    </header>
  );
}
