import React, { useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Plus, Swords, MessageCircle, Scroll, Gem, Trash2 } from 'lucide-react';
import { QuestNodeData, NodeVariant } from '../../../types/quest';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';

const variantConfig: Record<NodeVariant, {
  icon: React.ElementType;
  borderColor: string;
  bgColor: string;
  iconColor: string;
  shadowColor: string;
}> = {
  story: {
    icon: Scroll,
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
    shadowColor: 'shadow-purple-500/50',
  },
  combat: {
    icon: Swords,
    borderColor: 'border-red-500',
    bgColor: 'bg-red-500/10',
    iconColor: 'text-red-400',
    shadowColor: 'shadow-red-500/50',
  },
  dialogue: {
    icon: MessageCircle,
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    shadowColor: 'shadow-blue-500/50',
  },
  treasure: {
    icon: Gem,
    borderColor: 'border-amber-500',
    bgColor: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
    shadowColor: 'shadow-amber-500/50',
  },
};

export function QuestNode({ data, selected }: NodeProps<Node<QuestNodeData>>) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const variant = (data.variant as NodeVariant) || 'story';
  const config = variantConfig[variant];
  const Icon = config.icon;
  const isHorizontal = (data.layoutDirection ?? 'LR') === 'LR';

  return (
    <div
      onClick={() => data.onEdit?.()}
      className={`relative bg-zinc-900 rounded-lg border-2 transition-all min-w-[280px] max-w-[320px] group cursor-pointer ${
        selected
          ? `${config.borderColor} shadow-lg ${config.shadowColor}`
          : 'border-zinc-700 hover:border-zinc-500'
      }`}
    >
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
            className="absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); data.onAddPath?.('right'); }}
            className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); data.onAddPath?.('top'); }}
            className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); data.onAddPath?.('bottom'); }}
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
        </>
      )}

      {/* Card Content — read-only, click to open sidebar */}
      <div className={`p-4 ${config.bgColor}`}>
        <div className="flex items-start gap-2 mb-3">
          <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
          <h3 className="flex-1 text-white font-medium leading-snug">{data.title}</h3>
        </div>
        <p className="text-zinc-400 text-sm line-clamp-3">{data.body}</p>
      </div>

      {/* Variant badge */}
      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full pointer-events-none">
        <span className={`text-xs ${config.iconColor} capitalize`}>{variant}</span>
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
  );
}
