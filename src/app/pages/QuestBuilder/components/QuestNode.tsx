import React, { useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Plus, Swords, MessageCircle, Scroll, Gem, Trash2, ChevronDown } from 'lucide-react';
import { QuestNodeData, NodeVariant } from '../../../types/quest';
import { ConfirmModal } from '../../../components/shared/ConfirmModal';

const variantConfig = {
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

const variants: { value: NodeVariant; label: string }[] = [
  { value: 'story', label: 'Story' },
  { value: 'combat', label: 'Combat' },
  { value: 'dialogue', label: 'Dialogue' },
  { value: 'treasure', label: 'Treasure' },
];

export function QuestNode({ data, selected }: NodeProps<Node<QuestNodeData>>) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [showVariantMenu, setShowVariantMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [title, setTitle] = useState(data.title);
  const [body, setBody] = useState(data.body);

  const variant = data.variant || 'story';
  const config = variantConfig[variant];
  const Icon = config.icon;
  const isHorizontal = (data.layoutDirection ?? 'LR') === 'LR';

  return (
    <div
      className={`relative bg-zinc-900 rounded-lg border-2 transition-all min-w-[280px] max-w-[320px] group ${
        selected
          ? `${config.borderColor} shadow-lg ${config.shadowColor}`
          : 'border-zinc-700 hover:border-zinc-600'
      }`}
    >
      {/* Target handle — Left in LR mode, Top in TB mode */}
      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        style={{
          width: 14,
          height: 14,
          background: '#22c55e',
          border: '3px solid #ffffff',
          borderRadius: '50%',
          zIndex: 20,
        }}
        className="quest-handle"
      />
      {/* Source handle — Right in LR mode, Bottom in TB mode */}
      <Handle
        type="source"
        position={isHorizontal ? Position.Right : Position.Bottom}
        style={{
          width: 14,
          height: 14,
          background: '#22c55e',
          border: '3px solid #ffffff',
          borderRadius: '50%',
          zIndex: 20,
        }}
        className="quest-handle"
      />

      {/* Add Path Buttons — shown based on layout direction */}
      {isHorizontal ? (
        /* LR: left (incoming) and right (outgoing) */
        <>
          <button
            onClick={(e) => { e.stopPropagation(); data.onAddPath?.('left'); }}
            className="absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); data.onAddPath?.('right'); }}
            className="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
        </>
      ) : (
        /* TB: top (incoming) and bottom (outgoing) */
        <>
          <button
            onClick={(e) => { e.stopPropagation(); data.onAddPath?.('top'); }}
            className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); data.onAddPath?.('bottom'); }}
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-10"
          >
            <Plus className={`w-3 h-3 ${config.iconColor}`} />
          </button>
        </>
      )}

      {/* Card Content */}
      <div className={`p-4 ${config.bgColor}`}>
        <div className="flex items-start gap-2 mb-3">
          <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
          {isEditingTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
              className="flex-1 bg-zinc-800 text-white px-2 py-1 rounded border border-purple-500 focus:outline-none"
              autoFocus
            />
          ) : (
            <h3
              onClick={() => setIsEditingTitle(true)}
              className="flex-1 text-white cursor-text hover:text-purple-400 transition-colors"
            >
              {title}
            </h3>
          )}
        </div>

        {isEditingBody ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => setIsEditingBody(false)}
            className="w-full bg-zinc-800 text-zinc-300 text-sm px-2 py-1 rounded border border-purple-500 focus:outline-none resize-none"
            rows={3}
            autoFocus
          />
        ) : (
          <p
            onClick={() => setIsEditingBody(true)}
            className="text-zinc-400 text-sm cursor-text hover:text-zinc-300 transition-colors"
          >
            {body}
          </p>
        )}
      </div>

      {/* Node Type Badge */}
      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-full">
        <span className={`text-xs ${config.iconColor} capitalize`}>{variant}</span>
      </div>

      {/* Action Buttons */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowVariantMenu(!showVariantMenu); }}
            className="p-1 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-600 rounded transition-colors"
            title="Change node type"
          >
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>
          {showVariantMenu && (
            <div className="absolute top-full right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg overflow-hidden z-50">
              {variants.map((v) => (
                <button
                  key={v.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onChangeVariant?.(v.value);
                    setShowVariantMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-zinc-700 transition-colors ${
                    v.value === variant ? 'text-purple-400' : 'text-zinc-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteModal(true);
          }}
          className="p-1 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded transition-colors"
          title="Delete node"
        >
          <Trash2 className="w-3 h-3 text-red-400" />
        </button>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Node"
        message={`Are you sure you want to delete "${title}"? This will also remove all connected edges.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={() => { setShowDeleteModal(false); data.onDelete?.(); }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
