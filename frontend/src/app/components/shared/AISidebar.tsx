import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NodeVariant } from '../../types/quest';

interface NewNodeData {
  title: string;
  body: string;
  variant: NodeVariant;
}

interface AISidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNode?: (data: NewNodeData) => void;
}

const variantOptions: { value: NodeVariant; label: string; color: string }[] = [
  { value: 'story', label: 'Story', color: 'text-purple-400 border-purple-500 bg-purple-500/10' },
  { value: 'dialogue', label: 'Dialogue', color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
  { value: 'combat', label: 'Combat', color: 'text-red-400 border-red-500 bg-red-500/10' },
  { value: 'treasure', label: 'Treasure', color: 'text-amber-400 border-amber-500 bg-amber-500/10' },
];

/**
 * Sidebar form for creating a new quest node (opened by a node's "+" add-path button).
 * Editing an existing step — including AI-assisted rewrites — lives in NodeEditSidebar.
 */
export function AISidebar({ isOpen, onClose, onCreateNode }: AISidebarProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newVariant, setNewVariant] = useState<NodeVariant>('story');

  const reset = () => {
    setNewTitle('');
    setNewBody('');
    setNewVariant('story');
  };

  const handleCreateNode = () => {
    if (!newTitle.trim()) return;
    onCreateNode?.({ title: newTitle.trim(), body: newBody.trim() || 'Click to edit this quest node...', variant: newVariant });
    reset();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-[420px] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-400" />
                <h2 className="text-white text-lg">New Quest Node</h2>
              </div>
              <button onClick={handleClose} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Node form */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
              <p className="text-zinc-400 text-sm">Fill in the details for the new node. It will be connected to the source node automatically.</p>

              {/* Title */}
              <div>
                <label className="text-zinc-400 text-sm mb-2 block">Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. The Dark Forest"
                  className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-purple-500 focus:outline-none placeholder:text-zinc-500"
                  autoFocus
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-zinc-400 text-sm mb-2 block">Description</label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Describe what happens in this part of the quest..."
                  rows={4}
                  className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-purple-500 focus:outline-none placeholder:text-zinc-500 resize-none"
                />
              </div>

              {/* Variant picker */}
              <div>
                <label className="text-zinc-400 text-sm mb-3 block">Node Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {variantOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setNewVariant(opt.value)}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        newVariant === opt.value
                          ? opt.color
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-zinc-800 flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNode}
                  disabled={!newTitle.trim()}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Node
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
