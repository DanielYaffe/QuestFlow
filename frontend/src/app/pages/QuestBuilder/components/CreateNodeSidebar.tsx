import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NodeVariant } from '../../../types/quest';

interface NewNodeData {
  title: string;
  body: string;
  variant: NodeVariant;
}

interface CreateNodeSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNode?: (data: NewNodeData) => void;
}

const variantOptions: { value: NodeVariant; label: string; color: string }[] = [
  { value: 'story', label: 'Story', color: 'text-pulse border-pulse bg-steel-800' },
  { value: 'dialogue', label: 'Dialogue', color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
  { value: 'combat', label: 'Combat', color: 'text-red-400 border-red-500 bg-red-500/10' },
  { value: 'treasure', label: 'Treasure', color: 'text-amber-400 border-amber-500 bg-amber-500/10' },
];

export function CreateNodeSidebar({ isOpen, onClose, onCreateNode }: CreateNodeSidebarProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newVariant, setNewVariant] = useState<NodeVariant>('story');

  const handleCreateNode = () => {
    if (!newTitle.trim()) return;
    onCreateNode?.({ title: newTitle.trim(), body: newBody.trim() || 'Click to edit this quest node...', variant: newVariant });
    setNewTitle('');
    setNewBody('');
    setNewVariant('story');
    onClose();
  };

  const handleClose = () => {
    setNewTitle('');
    setNewBody('');
    setNewVariant('story');
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
            className="fixed right-0 top-0 h-full w-[420px] bg-steel-850 border-l border-steel-700 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-steel-700">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-pulse" />
                <h2 className="text-steel-100 text-lg">New Quest Node</h2>
              </div>
              <button onClick={handleClose} className="text-steel-400 hover:text-steel-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Node form */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
              <p className="text-steel-400 text-sm">Fill in the details for the new node. It will be connected to the source node automatically.</p>

              {/* Title */}
              <div>
                <label className="text-steel-400 text-sm mb-2 block">Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. The Dark Forest"
                  className="w-full bg-steel-800 text-steel-100 px-4 py-3 rounded-lg border border-steel-600 focus:border-pulse focus:outline-none placeholder:text-steel-400"
                  autoFocus
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-steel-400 text-sm mb-2 block">Description</label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Describe what happens in this part of the quest..."
                  rows={4}
                  className="w-full bg-steel-800 text-steel-100 px-4 py-3 rounded-lg border border-steel-600 focus:border-pulse focus:outline-none placeholder:text-steel-400 resize-none"
                />
              </div>

              {/* Variant picker */}
              <div>
                <label className="text-steel-400 text-sm mb-3 block">Node Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {variantOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setNewVariant(opt.value)}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        newVariant === opt.value
                          ? opt.color
                          : 'border-steel-600 text-steel-400 hover:border-steel-500 hover:text-steel-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-steel-700 flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNode}
                  disabled={!newTitle.trim()}
                  className="flex-1 px-4 py-3 bg-volt hover:brightness-95 disabled:bg-steel-700 disabled:text-steel-400 text-steel-950 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
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
