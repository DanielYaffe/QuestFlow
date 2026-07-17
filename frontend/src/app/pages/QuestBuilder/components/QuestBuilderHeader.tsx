import { Node } from '@xyflow/react';
import { AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Sparkles, PanelBottom, Loader2, Check, Wand2 } from 'lucide-react';
import { QuestNodeData } from '../../../types/quest';

interface QuestBuilderHeaderProps {
  selectedNode: Node<QuestNodeData> | null;
  onOpenSidebar: () => void;
  onAutoLayout: (direction: 'TB' | 'LR') => void;
  layoutDirection: 'TB' | 'LR';
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onExport: () => void;
  isAiEditOpen: boolean;
  onOpenAiEdit: () => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
}

export function QuestBuilderHeader({ selectedNode, onOpenSidebar, onAutoLayout, layoutDirection, isSidebarOpen, onToggleSidebar, onExport, isAiEditOpen, onOpenAiEdit, isSaving, hasUnsavedChanges }: QuestBuilderHeaderProps) {
  return (
    <header className="bg-steel-850 border-b border-steel-700 px-6 py-4 flex items-center justify-between z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Hide dock' : 'Show dock'}
          className={`p-2 rounded-md border transition-colors cursor-pointer ${
            isSidebarOpen
              ? 'bg-steel-800 border-volt text-volt'
              : 'bg-steel-800 border-steel-600 text-steel-400 hover:text-steel-200 hover:bg-steel-700'
          }`}
        >
          <PanelBottom className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-steel-100 text-xl">Quest Builder</h1>
          <p className="text-steel-400 text-sm">Design your game quest flow</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {selectedNode && (
          <button
            onClick={onOpenSidebar}
            className="px-4 py-2 bg-volt hover:brightness-95 text-steel-950 font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            AI Assistant
          </button>
        )}

        {/* Layout direction toggle */}
        <div className="flex items-center bg-steel-800 border border-steel-600 rounded-lg overflow-hidden">
          <button
            onClick={() => onAutoLayout('LR')}
            title="Horizontal layout"
            className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
              layoutDirection === 'LR'
                ? 'bg-volt text-steel-950 font-semibold'
                : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700'
            }`}
          >
            <AlignHorizontalDistributeCenter className="w-4 h-4" />
            Horizontal
          </button>
          <div className="w-px h-6 bg-steel-700" />
          <button
            onClick={() => onAutoLayout('TB')}
            title="Vertical layout"
            className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
              layoutDirection === 'TB'
                ? 'bg-volt text-steel-950 font-semibold'
                : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700'
            }`}
          >
            <AlignVerticalDistributeCenter className="w-4 h-4" />
            Vertical
          </button>
        </div>

        {isSaving ? (
          <span className="flex items-center gap-1.5 text-steel-400 text-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Saving...
          </span>
        ) : !hasUnsavedChanges ? (
          <span className="flex items-center gap-1.5 text-steel-400 text-sm">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        ) : null}

        <button
          onClick={onOpenAiEdit}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${
            isAiEditOpen
              ? 'bg-steel-800 border border-pulse text-pulse'
              : 'bg-volt hover:brightness-95 text-steel-950 font-semibold'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          AI Edit
        </button>

        <button
          onClick={onExport}
          className="px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-100 rounded-lg transition-colors"
        >
          Export Quest
        </button>
      </div>
    </header>
  );
}
