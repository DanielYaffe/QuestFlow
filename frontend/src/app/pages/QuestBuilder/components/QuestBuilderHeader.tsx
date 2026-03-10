import { Node } from '@xyflow/react';
import { AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Sparkles, PanelLeft } from 'lucide-react';
import { QuestNodeData } from '../../../types/quest';

interface QuestBuilderHeaderProps {
  selectedNode: Node<QuestNodeData> | null;
  onOpenSidebar: () => void;
  onAutoLayout: (direction: 'TB' | 'LR') => void;
  layoutDirection: 'TB' | 'LR';
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function QuestBuilderHeader({ selectedNode, onOpenSidebar, onAutoLayout, layoutDirection, isSidebarOpen, onToggleSidebar }: QuestBuilderHeaderProps) {
  return (
    <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          className={`p-2 rounded-lg border transition-colors ${
            isSidebarOpen
              ? 'bg-purple-500/10 border-purple-500/50 text-purple-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
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

        {/* Layout direction toggle */}
        <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
          <button
            onClick={() => onAutoLayout('LR')}
            title="Horizontal layout"
            className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
              layoutDirection === 'LR'
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            <AlignHorizontalDistributeCenter className="w-4 h-4" />
            Horizontal
          </button>
          <div className="w-px h-6 bg-zinc-700" />
          <button
            onClick={() => onAutoLayout('TB')}
            title="Vertical layout"
            className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
              layoutDirection === 'TB'
                ? 'bg-purple-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            <AlignVerticalDistributeCenter className="w-4 h-4" />
            Vertical
          </button>
        </div>

        <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
          Export Quest
        </button>
      </div>
    </header>
  );
}
