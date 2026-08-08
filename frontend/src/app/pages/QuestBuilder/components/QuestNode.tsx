/// <reference types="vite/client" />
import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, Trash2, Users, Swords, Trophy } from 'lucide-react';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../../components/ui/context-menu';
import { QuestNodeData } from '@/types/quest';
import { useVariantConfigs } from '../../../hooks/useVariantConfigs';

export function QuestNode({ data, selected }: { data: QuestNodeData; selected?: boolean }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { getConfig } = useVariantConfigs();

  const variantKey = (data.variant as string) || 'story';
  const config = getConfig(variantKey);
  const Icon = config.icon;
  const isHorizontal = (data.layoutDirection ?? 'LR') === 'LR';

  const characterNames = (data.characterNames as Record<string, string>) ?? {};
  const rewardNames    = (data.rewardNames    as Record<string, string>) ?? {};
  const npcIds         = (data.npcIds     as string[]) ?? [];
  const monsterIds     = (data.monsterIds as string[]) ?? [];
  const rewardIds      = (data.rewardIds  as string[]) ?? [];

  const npcChips     = npcIds.map((id)     => characterNames[id] ?? id);
  const monsterChips = monsterIds.map((id) => characterNames[id] ?? id);
  const rewardChips  = rewardIds.map((id)  => rewardNames[id]    ?? id);
  const hasChips = npcChips.length > 0 || monsterChips.length > 0 || rewardChips.length > 0;

  const highlight = data.aiHighlight as 'updated' | 'added' | undefined;

  const borderClass = highlight === 'added'
    ? 'border-emerald-500 shadow-lg shadow-emerald-500/30'
    : highlight === 'updated'
    ? 'border-blue-500 shadow-lg shadow-blue-500/30'
    : selected
    ? `${config.borderColor} shadow-lg ${config.shadowColor}`
    : 'border-steel-600 hover:border-steel-400';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={(e) => { if (!e.ctrlKey && !e.metaKey) data.onEdit?.(); }}
          className={`relative bg-steel-850 rounded-lg border-2 transition-all min-w-[280px] max-w-[320px] group cursor-pointer ${borderClass}`}
        >
          {/* AI change highlight ring */}
          {highlight && (
            <span className={`absolute -inset-[4px] rounded-md border-2 pointer-events-none animate-pulse ${
              highlight === 'added' ? 'border-emerald-400/50' : 'border-blue-400/50'
            }`} />
          )}
          {/* AI change badge */}
          {highlight && (
            <div className={`absolute -top-3 left-3 px-1.5 py-0.5 rounded-full text-xs font-medium pointer-events-none z-10 flex items-center gap-1 ${
              highlight === 'added' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
            }`}>
              {highlight === 'added' ? '+ New' : '✎ Updated'}
            </div>
          )}
          {/* Target handle */}
          <Handle
            type="target"
            position={isHorizontal ? Position.Left : Position.Top}
            style={{ width: 14, height: 14, background: '#22c55e', border: '3px solid #ffffff', borderRadius: '50%', zIndex: 20 }}
            className="quest-handle"
          />
          {/* Source handle */}
          <Handle
            type="source"
            position={isHorizontal ? Position.Right : Position.Bottom}
            style={{ width: 14, height: 14, background: '#22c55e', border: '3px solid #ffffff', borderRadius: '50%', zIndex: 20 }}
            className="quest-handle"
          />

          {/* Add Path Buttons */}
          {isHorizontal ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); data.onAddPath?.('left'); }}
                className="absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 bg-steel-800 border border-steel-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              >
                <Plus className={`w-3 h-3 ${config.iconColor}`} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); data.onAddPath?.('right'); }}
                className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 bg-steel-800 border border-steel-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              >
                <Plus className={`w-3 h-3 ${config.iconColor}`} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); data.onAddPath?.('top'); }}
                className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 bg-steel-800 border border-steel-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              >
                <Plus className={`w-3 h-3 ${config.iconColor}`} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); data.onAddPath?.('bottom'); }}
                className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-5 h-5 bg-steel-800 border border-steel-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              >
                <Plus className={`w-3 h-3 ${config.iconColor}`} />
              </button>
            </>
          )}

          {/* Card Content */}
          <div className={`p-4 ${config.bgColor}`}>
            <div className="flex items-start gap-2 mb-3">
              <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
              <h3 className="flex-1 text-steel-100 font-medium leading-snug">{data.title}</h3>
            </div>
            <p className="text-steel-400 text-sm line-clamp-3">{data.body}</p>

            {hasChips && (
              <div className="mt-3 flex flex-col gap-1.5">
                {npcChips.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Users className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    {npcChips.map((name) => (
                      <span key={name} className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-full">{name}</span>
                    ))}
                  </div>
                )}
                {monsterChips.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Swords className="w-3 h-3 text-red-400 flex-shrink-0" />
                    {monsterChips.map((name) => (
                      <span key={name} className="text-xs bg-red-500/10 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded-full">{name}</span>
                    ))}
                  </div>
                )}
                {rewardChips.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    {rewardChips.map((name) => (
                      <span key={name} className="text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full">{name}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Variant badge */}
          <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-steel-800 border border-steel-600 rounded-full pointer-events-none">
            <span className={`text-xs ${config.iconColor} capitalize`}>{config.label}</span>
          </div>

          {/* Delete button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); }}
            className="absolute top-2 right-2 p-1 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Delete node"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>

          <ConfirmModal
            isOpen={showDeleteModal}
            title="Delete Node"
            message={`Are you sure you want to delete "${data.title}"? This will also remove all connected edges.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            danger
            onConfirm={() => { setShowDeleteModal(false); data.onDelete?.(); }}
            onCancel={() => setShowDeleteModal(false)}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-steel-800 border-steel-600 text-steel-100">
        <ContextMenuItem
          onSelect={() => data.onExportNode?.()}
          className="text-steel-100 focus:bg-steel-700 focus:text-steel-100"
        >
          Export Node
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
