import {
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  PanelBottom,
  Loader2,
  Check,
  Wand2,
  Undo2,
  Redo2,
  Trash2,
  Workflow,
} from 'lucide-react';

type QuestlineOption = {
  _id: string;
  title: string;
};

interface QuestBuilderHeaderProps {
  questlines: QuestlineOption[];
  currentQuestlineId: string;
  currentQuestlineTitle: string;
  isQuestlineListLoading: boolean;
  isDeletingQuestline: boolean;
  onSelectQuestline: (questlineId: string) => void;
  onDeleteQuestline: () => void;
  onAutoLayout: (direction: 'TB' | 'LR') => void;
  layoutDirection: 'TB' | 'LR';
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onExport: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isAiEditOpen: boolean;
  onOpenAiEdit: () => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
}

export function QuestBuilderHeader({
  questlines,
  currentQuestlineId,
  currentQuestlineTitle,
  isQuestlineListLoading,
  isDeletingQuestline,
  onSelectQuestline,
  onDeleteQuestline,
  onAutoLayout,
  layoutDirection,
  isSidebarOpen,
  onToggleSidebar,
  onExport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isAiEditOpen,
  onOpenAiEdit,
  isSaving,
  hasUnsavedChanges,
}: QuestBuilderHeaderProps) {
  return (
    <header className="bg-steel-850 border-b border-steel-700 px-6 py-4 flex items-center justify-between gap-4 z-10">
      <div className="flex items-center gap-3 min-w-0">
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

        <div className="ml-4 flex items-center gap-2 min-w-0">
          <Workflow className="w-4 h-4 text-pulse shrink-0" />
          <select
            value={currentQuestlineId}
            onChange={(event) => onSelectQuestline(event.target.value)}
            disabled={isQuestlineListLoading || isDeletingQuestline}
            title="Switch questflow"
            className="w-64 max-w-[28vw] bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-sm text-steel-100 outline-none focus:border-pulse disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {!questlines.some((q) => q._id === currentQuestlineId) && (
              <option value={currentQuestlineId}>
                {currentQuestlineTitle || 'Current questflow'}
              </option>
            )}
            {questlines.map((questline) => (
              <option key={questline._id} value={questline._id}>
                {questline.title || 'Untitled questflow'}
              </option>
            ))}
          </select>
          <button
            onClick={onDeleteQuestline}
            disabled={isDeletingQuestline || !currentQuestlineId}
            title="Delete current questflow"
            className="p-2 rounded-md border border-red-900/70 bg-red-950/30 text-red-300 hover:bg-red-900/40 hover:text-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeletingQuestline ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {/* Undo / redo history */}
        <div className="flex items-center bg-steel-800 border border-steel-600 rounded-lg overflow-hidden">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last change"
            className="px-3 py-2 flex items-center text-steel-300 hover:text-steel-100 hover:bg-steel-700 transition-colors disabled:text-steel-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-steel-700" />
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            className="px-3 py-2 flex items-center text-steel-300 hover:text-steel-100 hover:bg-steel-700 transition-colors disabled:text-steel-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

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
          AI Questline Edit
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
