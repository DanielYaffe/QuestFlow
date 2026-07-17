import React, { useState } from 'react';
import { X, Send, Sparkles, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NodeVariant } from '../../types/quest';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
}

interface NewNodeData {
  title: string;
  body: string;
  variant: NodeVariant;
}

// Mode: 'edit' = AI chat for existing node, 'create' = form to create a new node
type SidebarMode = 'edit' | 'create';

interface AISidebarProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: SidebarMode;
  selectedNodeTitle?: string;
  onCreateNode?: (data: NewNodeData) => void;
}

const variantOptions: { value: NodeVariant; label: string; color: string }[] = [
  { value: 'story', label: 'Story', color: 'text-pulse border-pulse bg-steel-800' },
  { value: 'dialogue', label: 'Dialogue', color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
  { value: 'combat', label: 'Combat', color: 'text-red-400 border-red-500 bg-red-500/10' },
  { value: 'treasure', label: 'Treasure', color: 'text-amber-400 border-amber-500 bg-amber-500/10' },
];

export function AISidebar({ isOpen, onClose, mode = 'edit', selectedNodeTitle, onCreateNode }: AISidebarProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: `I'm ready to help you build the story for "${selectedNodeTitle || 'your quest'}". What happens next?`,
    },
  ]);

  // Create mode state
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newVariant, setNewVariant] = useState<NodeVariant>('story');

  const handleSend = () => {
    if (!input.trim()) return;
    const userMessage: Message = { id: Date.now().toString(), type: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: `Great idea! Based on your input, here are some suggestions:\n\n• The hero encounters a mysterious stranger\n• A hidden path reveals itself in the moonlight\n• An ancient artifact begins to glow`,
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
    setInput('');
  };

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
                {mode === 'create' ? (
                  <Plus className="w-5 h-5 text-pulse" />
                ) : (
                  <Sparkles className="w-5 h-5 text-pulse" />
                )}
                <h2 className="text-steel-100 text-lg">
                  {mode === 'create' ? 'New Quest Node' : 'AI Story Assistant'}
                </h2>
              </div>
              <button onClick={handleClose} className="text-steel-400 hover:text-steel-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create mode: node form */}
            {mode === 'create' ? (
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
            ) : (
              /* Edit mode: AI chat */
              <>
                {selectedNodeTitle && (
                  <div className="px-6 py-3 bg-steel-800/50 border-b border-steel-700">
                    <p className="text-sm text-steel-400">Editing:</p>
                    <p className="text-steel-100">{selectedNodeTitle}</p>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className={message.type === 'user' ? 'flex justify-end' : ''}>
                      <div
                        className={`rounded-lg p-4 max-w-[85%] ${
                          message.type === 'user' ? 'bg-volt text-steel-950 font-semibold' : 'bg-steel-800 text-steel-200'
                        }`}
                      >
                        {message.type === 'ai' && (
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-4 h-4 text-pulse" />
                            <span className="text-xs text-pulse">AI Assistant</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-line">{message.content}</p>
                      </div>
                    </div>
                  ))}

                  <div className="pt-4">
                    <p className="text-xs text-steel-400 mb-2">Quick suggestions:</p>
                    <div className="flex flex-wrap gap-2">
                      {['Add a twist', 'Create dialogue', 'Add a challenge', 'Introduce character'].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setInput(suggestion)}
                          className="px-3 py-1.5 bg-steel-800 hover:bg-steel-700 text-steel-200 text-xs rounded-full border border-steel-600 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-steel-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Write to AI to generate story..."
                      className="flex-1 bg-steel-800 text-steel-100 px-4 py-3 rounded-lg border border-steel-600 focus:border-pulse focus:outline-none placeholder:text-steel-400"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="bg-volt hover:brightness-95 disabled:bg-steel-700 disabled:text-steel-400 text-steel-950 font-semibold px-4 py-3 rounded-lg transition-colors"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
