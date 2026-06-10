import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Wand2, Loader2, Check, Pencil, Plus, Trash2, GitBranch,
  Send, CheckCheck, XCircle, RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Node, Edge } from '@xyflow/react';
import { toast } from 'sonner';
import { QuestNodeData } from '../../../types/quest';
import { AIChange, requestAiEdit } from '../../../api/questAiEditApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemStatus = 'pending' | 'approved' | 'rejected';

interface ExchangeItem {
  change: AIChange;
  status: ItemStatus;
}

interface Exchange {
  id: string;
  instruction: string;
  items: ExchangeItem[];
  loading: boolean;
  error: string | null;
}

interface AIEditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  questlineId: string;
  nodes: Node<QuestNodeData>[];
  edges: Edge[];
  onApplyChange: (change: AIChange) => void;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const variantColors: Record<string, string> = {
  story:    'text-purple-400 border-purple-500 bg-purple-500/10',
  dialogue: 'text-blue-400 border-blue-500 bg-blue-500/10',
  combat:   'text-red-400 border-red-500 bg-red-500/10',
  treasure: 'text-amber-400 border-amber-500 bg-amber-500/10',
};

function VariantBadge({ variant }: { variant: string }) {
  const cls = variantColors[variant] ?? 'text-zinc-400 border-zinc-600 bg-zinc-500/10';
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${cls}`}>
      {variant}
    </span>
  );
}

function pendingItems(ex: Exchange): ExchangeItem[] {
  return ex.items.filter((item) => item.status === 'pending');
}

function getNodeTitle(nodes: Node<QuestNodeData>[], id: string): string {
  return nodes.find((n) => n.id === id)?.data?.title ?? id;
}

// ---------------------------------------------------------------------------
// Skeleton card (loading placeholder)
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4 space-y-3 animate-pulse">
      <div className="flex items-start gap-2">
        <div className="w-4 h-4 rounded bg-zinc-700 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-zinc-700 rounded w-4/5" />
          <div className="h-3 bg-zinc-700 rounded w-3/5" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 bg-zinc-700/70 rounded w-1/4" />
        <div className="h-8 bg-zinc-700/50 rounded" />
        <div className="h-8 bg-zinc-700/50 rounded" />
      </div>
      <div className="flex gap-2 pt-1">
        <div className="flex-1 h-9 bg-zinc-700/60 rounded-lg" />
        <div className="flex-1 h-9 bg-zinc-700/60 rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change card detail
// ---------------------------------------------------------------------------

function ChangeDetail({ change, nodes }: { change: AIChange; nodes: Node<QuestNodeData>[] }) {
  if (change.type === 'updateNode') {
    const titleChanged   = change.before.title   !== change.after.title;
    const bodyChanged    = change.before.body    !== change.after.body;
    const variantChanged = change.before.variant !== change.after.variant;
    return (
      <div className="space-y-2 text-xs">
        {titleChanged && (
          <div className="space-y-1">
            <p className="text-zinc-500">Title</p>
            <p className="line-through text-zinc-500 bg-zinc-900 px-2 py-1.5 rounded leading-relaxed">
              {change.before.title}
            </p>
            <p className="text-emerald-300 bg-zinc-900 px-2 py-1.5 rounded leading-relaxed">
              {change.after.title}
            </p>
          </div>
        )}
        {bodyChanged && (
          <div className="space-y-1">
            <p className="text-zinc-500">Description</p>
            <p className="line-through text-zinc-500 bg-zinc-900 px-2 py-1.5 rounded leading-relaxed">
              {change.before.body}
            </p>
            <p className="text-emerald-300 bg-zinc-900 px-2 py-1.5 rounded leading-relaxed">
              {change.after.body}
            </p>
          </div>
        )}
        {variantChanged && (
          <div className="flex items-center gap-2 pt-0.5">
            <VariantBadge variant={change.before.variant} />
            <span className="text-zinc-500 text-xs">→</span>
            <VariantBadge variant={change.after.variant} />
          </div>
        )}
      </div>
    );
  }

  if (change.type === 'addNode') {
    return (
      <div className="space-y-1.5 text-xs">
        <p className="text-white font-medium">{change.node.title}</p>
        <p className="text-zinc-400 leading-relaxed">{change.node.body}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <VariantBadge variant={change.node.variant} />
          {change.connectFrom && (
            <span className="text-zinc-500">
              connects from: <span className="text-zinc-300">{getNodeTitle(nodes, change.connectFrom)}</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  if (change.type === 'deleteNode') {
    return (
      <div className="space-y-1 text-xs">
        <div className="bg-red-950/40 border border-red-800/50 rounded px-2 py-1.5 text-red-300">
          {change.nodeTitle}
        </div>
        <p className="text-zinc-500">This node and all its connections will be removed.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="text-zinc-200">{change.sourceTitle}</span>
      <span className="text-zinc-500">→</span>
      <span className="text-zinc-200">{change.targetTitle}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single change card (pending state)
// ---------------------------------------------------------------------------

function ChangeCard({
  item,
  nodes,
  onApprove,
  onReject,
}: {
  item: ExchangeItem;
  nodes: Node<QuestNodeData>[];
  onApprove: () => void;
  onReject: () => void;
}) {
  const { change } = item;

  const typeIcon = () => {
    switch (change.type) {
      case 'updateNode': return <Pencil className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'addNode':    return <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'deleteNode': return <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      default:           return <GitBranch className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
  };

  const nodeLabel = () => {
    if (change.type === 'updateNode') return getNodeTitle(nodes, change.nodeId);
    if (change.type === 'deleteNode') return change.nodeTitle;
    if (change.type === 'addNode')    return 'New node';
    return `${change.sourceTitle} → ${change.targetTitle}`;
  };

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4 space-y-3">
      {/* Card header */}
      <div className="flex items-start gap-2">
        {typeIcon()}
        <div className="flex-1 min-w-0">
          <p className="text-zinc-400 text-xs mb-0.5">{nodeLabel()}</p>
          <p className="text-zinc-200 text-sm leading-snug">{change.summary}</p>
        </div>
      </div>

      <ChangeDetail change={change} nodes={nodes} />

      <div className="flex gap-2 pt-1">
        <button
          onClick={onReject}
          className="flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-sm transition-colors"
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Approve
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Past exchange (collapsed summary)
// ---------------------------------------------------------------------------

function PastExchange({ exchange }: { exchange: Exchange }) {
  const [expanded, setExpanded] = useState(false);
  const applied  = exchange.items.filter((i) => i.status === 'approved').length;
  const rejected = exchange.items.filter((i) => i.status === 'rejected').length;

  const summary = exchange.error
    ? 'Request failed'
    : exchange.items.length === 0
    ? 'No changes proposed'
    : `${applied} applied${rejected > 0 ? `, ${rejected} rejected` : ''}`;

  return (
    <div className="space-y-1.5">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="bg-purple-600/20 border border-purple-500/30 rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%]">
          <p className="text-white text-sm">{exchange.instruction}</p>
        </div>
      </div>
      {/* AI outcome chip */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
          <Wand2 className="w-2.5 h-2.5 text-purple-400" />
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {exchange.error ? (
            <span className="text-red-400">{summary}</span>
          ) : (
            <span>{summary}</span>
          )}
          {!exchange.error && exchange.items.length > 0 && (
            expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Expandable resolved cards */}
      {expanded && !exchange.error && exchange.items.length > 0 && (
        <div className="ml-7 space-y-1.5">
          {exchange.items.map((item, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                item.status === 'approved'
                  ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400'
                  : 'border-zinc-700 bg-zinc-800/40 text-zinc-500 line-through'
              }`}
            >
              {item.status === 'approved'
                ? <Check className="w-3 h-3 shrink-0 mt-0.5" />
                : <XCircle className="w-3 h-3 shrink-0 mt-0.5 no-underline" />}
              <span className={item.status === 'rejected' ? 'line-through' : ''}>
                {item.change.summary}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active exchange (loading or has pending cards)
// ---------------------------------------------------------------------------

function ActiveExchange({
  exchange,
  nodes,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onRetry,
}: {
  exchange: Exchange;
  nodes: Node<QuestNodeData>[];
  onApprove: (index: number) => void;
  onReject: (index: number) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onRetry: () => void;
}) {
  const pending = pendingItems(exchange);

  return (
    <div className="space-y-2">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="bg-purple-600 rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%]">
          <p className="text-white text-sm">{exchange.instruction}</p>
        </div>
      </div>

      {/* AI response area */}
      <div className="flex gap-2">
        <div className="w-5 h-5 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0 mt-0.5">
          {exchange.loading
            ? <Loader2 className="w-2.5 h-2.5 text-purple-400 animate-spin" />
            : <Wand2 className="w-2.5 h-2.5 text-purple-400" />
          }
        </div>

        <div className="flex-1 space-y-2">
          {/* Loading skeletons */}
          {exchange.loading && (
            <>
              <p className="text-zinc-500 text-xs mb-2">Analysing your questline...</p>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {/* Error */}
          {exchange.error && (
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 space-y-3">
              <p className="text-red-400 text-sm">{exchange.error}</p>
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Try again
              </button>
            </div>
          )}

          {/* Proposals header + bulk actions */}
          {!exchange.loading && !exchange.error && exchange.items.length > 0 && pending.length > 0 && (
            <div className="flex items-center justify-between mb-1">
              <p className="text-zinc-500 text-xs">
                {pending.length} proposal{pending.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onRejectAll}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <XCircle className="w-3 h-3" />
                  Reject all
                </button>
                <button
                  onClick={onApproveAll}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <CheckCheck className="w-3 h-3" />
                  Apply all
                </button>
              </div>
            </div>
          )}

          {/* Pending change cards */}
          {!exchange.loading && !exchange.error &&
            exchange.items.map((item, i) =>
              item.status === 'pending' ? (
                <ChangeCard
                  key={i}
                  item={item}
                  nodes={nodes}
                  onApprove={() => onApprove(i)}
                  onReject={() => onReject(i)}
                />
              ) : null,
            )}

          {/* No changes proposed */}
          {!exchange.loading && !exchange.error && exchange.items.length === 0 && (
            <p className="text-zinc-500 text-xs px-1">
              The AI had no changes to propose for this instruction.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function AIEditPanel({
  isOpen,
  onClose,
  questlineId,
  nodes,
  edges,
  onApplyChange,
}: AIEditPanelProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [instruction, setInstruction] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = exchanges.length > 0 && exchanges[exchanges.length - 1].loading;

  const activeExchange: Exchange | null = (() => {
    if (exchanges.length === 0) return null;
    const last = exchanges[exchanges.length - 1];
    if (last.loading) return last;
    if (last.error) return last;
    if (pendingItems(last).length > 0) return last;
    return null;
  })();

  const pastExchanges = activeExchange
    ? exchanges.slice(0, -1)
    : exchanges;

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [exchanges]);

  const updateExchange = useCallback((id: string, updater: (ex: Exchange) => Exchange) => {
    setExchanges((prev) => prev.map((ex) => (ex.id === id ? updater(ex) : ex)));
  }, []);

  const submitInstruction = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const id = Date.now().toString();
    const newExchange: Exchange = {
      id,
      instruction: text.trim(),
      items: [],
      loading: true,
      error: null,
    };
    setExchanges((prev) => [...prev, newExchange]);
    setInstruction('');

    try {
      const result = await requestAiEdit(questlineId, { instruction: text.trim(), nodes, edges });
      updateExchange(id, (ex) => ({
        ...ex,
        loading: false,
        items: result.changes.map((change) => ({ change, status: 'pending' })),
      }));
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error
          ? String((err as { response: { data: { error: string } } }).response.data.error)
          : 'Something went wrong — please try again';
      updateExchange(id, (ex) => ({ ...ex, loading: false, error: msg }));
    }
  }, [isLoading, questlineId, nodes, edges, updateExchange]);

  const handleSubmit = () => submitInstruction(instruction);

  const handleApprove = useCallback((exchangeId: string, itemIndex: number) => {
    const approvedChange = exchanges.find((ex) => ex.id === exchangeId)?.items[itemIndex]?.change;
    updateExchange(exchangeId, (ex) => ({
      ...ex,
      items: ex.items.map((item, i) =>
        i === itemIndex ? { ...item, status: 'approved' } : item,
      ),
    }));
    if (approvedChange) {
      onApplyChange(approvedChange);
      toast.success(approvedChange.summary, { duration: 3000 });
    }
  }, [exchanges, updateExchange, onApplyChange]);

  const handleReject = useCallback((exchangeId: string, itemIndex: number) => {
    updateExchange(exchangeId, (ex) => ({
      ...ex,
      items: ex.items.map((item, i) =>
        i === itemIndex ? { ...item, status: 'rejected' } : item,
      ),
    }));
  }, [updateExchange]);

  const handleApproveAll = useCallback((exchangeId: string) => {
    const exchange = exchanges.find((ex) => ex.id === exchangeId);
    const pendingChanges = (exchange?.items ?? []).filter((i) => i.status === 'pending');
    updateExchange(exchangeId, (ex) => ({
      ...ex,
      items: ex.items.map((item) =>
        item.status === 'pending' ? { ...item, status: 'approved' } : item,
      ),
    }));
    pendingChanges.forEach((item) => onApplyChange(item.change));
    if (pendingChanges.length > 0) {
      toast.success(`${pendingChanges.length} change${pendingChanges.length !== 1 ? 's' : ''} applied`);
    }
  }, [exchanges, updateExchange, onApplyChange]);

  const handleRejectAll = useCallback((exchangeId: string) => {
    updateExchange(exchangeId, (ex) => ({
      ...ex,
      items: ex.items.map((item) =>
        item.status === 'pending' ? { ...item, status: 'rejected' } : item,
      ),
    }));
  }, [updateExchange]);

  const handleRetry = useCallback((instruction: string) => {
    submitInstruction(instruction);
  }, [submitInstruction]);

  const handleClearHistory = () => {
    setExchanges([]);
    setInstruction('');
  };

  const quickSuggestions = [
    'Add a branching choice before the final mission',
    'Make the ending more dramatic',
    'Add a twist: a trusted ally betrays the hero',
    'Connect any disconnected nodes',
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 h-full w-[440px] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-purple-400" />
              <h2 className="text-white text-base font-medium">AI Quest Editor</h2>
              {exchanges.length > 0 && (
                <span className="text-xs text-zinc-600 ml-1">{exchanges.length} exchange{exchanges.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {exchanges.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title="Clear history"
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors px-1.5 py-1 rounded hover:bg-zinc-800"
                >
                  Clear
                </button>
              )}
              <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Conversation area */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Empty state */}
            {exchanges.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 pb-8">
                <div className="w-12 h-12 rounded-full bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-zinc-300 text-sm font-medium">AI Quest Editor</p>
                  <p className="text-zinc-500 text-xs max-w-[260px] leading-relaxed">
                    Describe any change you want — add missions, rework the ending, restructure the path. Each proposal needs your approval before it's applied.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full max-w-[300px] mt-2">
                  {quickSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInstruction(s)}
                      className="text-left px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs rounded-lg border border-zinc-700 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Past exchanges */}
            {pastExchanges.map((ex) => (
              <PastExchange key={ex.id} exchange={ex} />
            ))}

            {/* Active exchange */}
            {activeExchange && (
              <ActiveExchange
                exchange={activeExchange}
                nodes={nodes}
                onApprove={(i) => handleApprove(activeExchange.id, i)}
                onReject={(i) => handleReject(activeExchange.id, i)}
                onApproveAll={() => handleApproveAll(activeExchange.id)}
                onRejectAll={() => handleRejectAll(activeExchange.id)}
                onRetry={() => handleRetry(activeExchange.instruction)}
              />
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="px-5 py-4 border-t border-zinc-800 shrink-0 space-y-2.5">
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                }}
                placeholder="Describe a change to the questline…"
                rows={2}
                disabled={isLoading}
                className="flex-1 bg-zinc-800 text-white px-3 py-2.5 rounded-lg border border-zinc-700 focus:border-purple-500 focus:outline-none placeholder:text-zinc-600 resize-none disabled:opacity-50 text-sm leading-relaxed"
              />
              <button
                onClick={handleSubmit}
                disabled={!instruction.trim() || isLoading}
                title="Send (⌘Enter)"
                className="px-3 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center justify-center shrink-0"
              >
                {isLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-zinc-600 text-xs">⌘↵ to send · each change needs approval</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
