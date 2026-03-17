import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Pencil, GitCompare, Check, ArrowLeft, GripVertical, ChevronDown, ChevronUp, Users, Trophy, Skull } from 'lucide-react';
import { useVariantConfigs } from '../../../hooks/useVariantConfigs';
import { motion, AnimatePresence } from 'motion/react';
import { NodeVariant } from '../../../types/quest';
import { fetchCharacters, fetchRewards, Character, Reward } from '../../../api/projectSidebarApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeSnapshot {
  title: string;
  body: string;
  variant: NodeVariant;
  npcIds: string[];
  monsterIds: string[];
  rewardIds: string[];
}

interface NodeEditSidebarProps {
  isOpen: boolean;
  node: NodeSnapshot | null;
  questlineId: string;
  onClose: () => void;
  onApply: (updated: NodeSnapshot) => void;
}

type Phase = 'edit' | 'diff';

// ---------------------------------------------------------------------------
// Word-level LCS diff
// ---------------------------------------------------------------------------

type WordToken = { text: string; type: 'same' | 'removed' | 'added' };

function wordDiff(oldLine: string, newLine: string): { old: WordToken[]; new: WordToken[] } {
  const oldWords = oldLine.split(/(\s+)/);
  const newWords = newLine.split(/(\s+)/);
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldWords[i] === newWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const oldToks: WordToken[] = [];
  const newToks: WordToken[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldWords[i] === newWords[j]) {
      oldToks.push({ text: oldWords[i], type: 'same' });
      newToks.push({ text: newWords[j], type: 'same' });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      newToks.push({ text: newWords[j], type: 'added' }); j++;
    } else {
      oldToks.push({ text: oldWords[i], type: 'removed' }); i++;
    }
  }
  return { old: oldToks, new: newToks };
}

// ---------------------------------------------------------------------------
// Line-level diff pairs
// ---------------------------------------------------------------------------

interface LinePair {
  type: 'same' | 'changed' | 'removed' | 'added';
  oldLine: string | null;
  newLine: string | null;
}

function buildLinePairs(oldText: string, newText: string): LinePair[] {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');
  const pairs: LinePair[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o !== undefined && n !== undefined)
      pairs.push({ type: o === n ? 'same' : 'changed', oldLine: o, newLine: n });
    else if (o !== undefined)
      pairs.push({ type: 'removed', oldLine: o, newLine: null });
    else
      pairs.push({ type: 'added', oldLine: null, newLine: n! });
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// InlineTokens
// ---------------------------------------------------------------------------

function InlineTokens({ tokens, side }: { tokens: WordToken[]; side: 'old' | 'new' }) {
  return (
    <>
      {tokens.map((tok, i) => {
        const isChanged = (side === 'old' && tok.type === 'removed') || (side === 'new' && tok.type === 'added');
        return isChanged
          ? <span key={i} className="underline decoration-dotted decoration-zinc-400 underline-offset-2">{tok.text}</span>
          : <span key={i}>{tok.text}</span>;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// FieldDiffPanel
// ---------------------------------------------------------------------------

function FieldDiffPanel({ label, oldVal, newVal, changed, variantOld, variantNew, getVariantColor }: {
  label: string;
  oldVal: string;
  newVal: string;
  changed: boolean;
  variantOld?: NodeVariant;
  variantNew?: NodeVariant;
  getVariantColor?: (key: string) => string;
}) {
  const isVariant = variantOld !== undefined;
  const pairs = isVariant ? [] : buildLinePairs(oldVal, newVal);

  return (
    <div className={`rounded-lg border overflow-hidden transition-opacity ${changed ? 'border-zinc-700' : 'border-zinc-800 opacity-50'}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60 border-b border-zinc-700/60">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        {changed
          ? <span className="text-xs text-purple-400 font-medium">Modified</span>
          : <span className="text-xs text-zinc-600">Unchanged</span>}
      </div>
      <div className="grid grid-cols-2 divide-x divide-zinc-700/60 bg-zinc-900/60">
        <div className="flex flex-col min-h-0">
          <div className="px-3 py-1.5 border-b border-zinc-700/40 bg-zinc-800/30">
            <span className="text-xs font-medium text-zinc-400">Before</span>
          </div>
          <div className="p-3 overflow-y-auto text-sm text-zinc-300 leading-relaxed" style={{ maxHeight: 160 }}>
            {isVariant ? (
              <span className={`capitalize font-medium ${getVariantColor?.(variantOld!) ?? 'text-zinc-400'}`}>{variantOld}</span>
            ) : (
              <span className="whitespace-pre-wrap break-words font-mono text-xs">
                {pairs.map((pair, i) => {
                  if (pair.oldLine === null) return <span key={i} className="block opacity-0">·</span>;
                  const tokens = pair.type === 'changed' && pair.newLine !== null
                    ? wordDiff(pair.oldLine, pair.newLine).old : null;
                  return (
                    <span key={i} className="block">
                      {tokens ? <InlineTokens tokens={tokens} side="old" /> : pair.oldLine}
                    </span>
                  );
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col min-h-0">
          <div className="px-3 py-1.5 border-b border-zinc-700/40 bg-zinc-800/30">
            <span className="text-xs font-medium text-zinc-400">After</span>
          </div>
          <div className="p-3 overflow-y-auto text-sm text-zinc-300 leading-relaxed" style={{ maxHeight: 160 }}>
            {isVariant ? (
              <span className={`capitalize font-medium ${getVariantColor?.(variantNew!) ?? 'text-zinc-400'}`}>{variantNew}</span>
            ) : (
              <span className="whitespace-pre-wrap break-words font-mono text-xs">
                {pairs.map((pair, i) => {
                  if (pair.newLine === null) return <span key={i} className="block opacity-0">·</span>;
                  const tokens = pair.type === 'changed' && pair.oldLine !== null
                    ? wordDiff(pair.oldLine, pair.newLine).new : null;
                  return (
                    <span key={i} className="block">
                      {tokens ? <InlineTokens tokens={tokens} side="new" /> : pair.newLine}
                    </span>
                  );
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IdListDiff — before/after chip display for id arrays
// ---------------------------------------------------------------------------

function IdListDiff({ label, oldIds, newIds, getName, changed }: {
  label: string;
  oldIds: string[];
  newIds: string[];
  getName: (id: string) => string;
  changed: boolean;
}) {
  return (
    <div className={`rounded-lg border overflow-hidden transition-opacity ${changed ? 'border-zinc-700' : 'border-zinc-800 opacity-50'}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60 border-b border-zinc-700/60">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        {changed
          ? <span className="text-xs text-purple-400 font-medium">Modified</span>
          : <span className="text-xs text-zinc-600">Unchanged</span>}
      </div>
      <div className="grid grid-cols-2 divide-x divide-zinc-700/60 bg-zinc-900/60">
        {[{ ids: oldIds, side: 'Before' }, { ids: newIds, side: 'After' }].map(({ ids, side }) => (
          <div key={side} className="flex flex-col min-h-0">
            <div className="px-3 py-1.5 border-b border-zinc-700/40 bg-zinc-800/30">
              <span className="text-xs font-medium text-zinc-400">{side}</span>
            </div>
            <div className="p-3 flex flex-wrap gap-1.5 min-h-[40px]">
              {ids.length === 0
                ? <span className="text-xs text-zinc-600 italic">None</span>
                : ids.map((id) => (
                    <span key={id} className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-full">
                      {getName(id)}
                    </span>
                  ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagPicker — multi-select dropdown with chips
// ---------------------------------------------------------------------------

interface TagPickerProps<T> {
  label: string;
  icon: React.ElementType;
  items: T[];
  selectedIds: string[];
  getId: (item: T) => string;
  getName: (item: T) => string;
  onToggle: (id: string) => void;
  loading?: boolean;
}

function TagPicker<T>({ label, icon: Icon, items, selectedIds, getId, getName, onToggle, loading }: TagPickerProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className="text-zinc-400 text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </label>

      {/* Selected chips — only show names once items have loaded */}
      {selectedIds.length > 0 && !loading && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedIds.map((id) => {
            const item = items.find((it) => getId(it) === id);
            const name = item ? getName(item) : null;
            if (!name) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-xs bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full"
              >
                {name}
                <button
                  type="button"
                  onClick={() => onToggle(id)}
                  className="ml-0.5 hover:text-white transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown toggle */}
      <button
        type="button"
        onClick={() => !loading && setOpen((v) => !v)}
        disabled={loading}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
        <span className="text-zinc-500">
          {loading
            ? 'Loading...'
            : selectedIds.length > 0
              ? `${selectedIds.length} selected`
              : `Select ${label.toLowerCase()}...`}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {/* Dropdown list */}
      {open && !loading && (
        <div className="mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl">
          {items.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-500 italic">No items available</div>
          ) : (
            items.map((item) => {
              const id = getId(item);
              const selected = selectedIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zinc-700 transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    selected ? 'bg-purple-600 border-purple-600' : 'border-zinc-600'
                  }`}>
                    {selected && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className={selected ? 'text-white' : 'text-zinc-300'}>{getName(item)}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main sidebar
// ---------------------------------------------------------------------------

const MIN_WIDTH = 420;
const MAX_WIDTH = 960;
const DEFAULT_WIDTH = 560;

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function NodeEditSidebar({ isOpen, node, questlineId, onClose, onApply }: NodeEditSidebarProps) {
  const { configs, getConfig } = useVariantConfigs();
  const [phase, setPhase] = useState<Phase>('edit');
  const [title,      setTitle]      = useState('');
  const [body,       setBody]       = useState('');
  const [variant,    setVariant]    = useState<NodeVariant>('story');
  const [npcIds,     setNpcIds]     = useState<string[]>([]);
  const [monsterIds, setMonsterIds] = useState<string[]>([]);
  const [rewardIds,  setRewardIds]  = useState<string[]>([]);
  const [width,      setWidth]      = useState(DEFAULT_WIDTH);

  const [characters,       setCharacters]       = useState<Character[]>([]);
  const [rewards,          setRewards]          = useState<Reward[]>([]);
  const [charsLoaded,      setCharsLoaded]      = useState(false);
  const [rewardsLoaded,    setRewardsLoaded]    = useState(false);

  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(DEFAULT_WIDTH);

  // Populate fields when node changes
  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setBody(node.body);
      setVariant(node.variant);
      setNpcIds(node.npcIds ?? []);
      setMonsterIds(node.monsterIds ?? []);
      setRewardIds(node.rewardIds ?? []);
      setPhase('edit');
    }
  }, [node]);

  // Fetch characters + rewards when sidebar opens
  useEffect(() => {
    if (!isOpen || !questlineId) return;
    setCharsLoaded(false);
    setRewardsLoaded(false);
    fetchCharacters(questlineId)
      .then((c) => { setCharacters(c); setCharsLoaded(true); })
      .catch(() => { setCharacters([]); setCharsLoaded(true); });
    fetchRewards(questlineId)
      .then((r) => { setRewards(r); setRewardsLoaded(true); })
      .catch(() => { setRewards([]); setRewardsLoaded(true); });
  }, [isOpen, questlineId]);

  // Drag-to-resize
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const toggleNpc     = (id: string) => setNpcIds((prev)     => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleMonster = (id: string) => setMonsterIds((prev)  => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleReward  = (id: string) => setRewardIds((prev)   => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // Combat-like variants show monster picker; all others show NPC picker
  const isCombatVariant = getConfig(variant).iconKey === 'swords' || variant.toLowerCase().includes('combat');

  const hasChanges =
    node !== null && (
      title.trim() !== node.title ||
      body.trim()  !== node.body  ||
      variant      !== node.variant ||
      !arraysEqual([...npcIds].sort(),     [...(node.npcIds ?? [])].sort()) ||
      !arraysEqual([...monsterIds].sort(), [...(node.monsterIds ?? [])].sort()) ||
      !arraysEqual([...rewardIds].sort(),  [...(node.rewardIds ?? [])].sort())
    );

  const handleClose = () => { setPhase('edit'); onClose(); };
  const handleApply = () => {
    onApply({ title: title.trim(), body: body.trim(), variant, npcIds, monsterIds, rewardIds });
    setPhase('edit');
    onClose();
  };

  const getCharName   = (id: string) => characters.find((c) => c.id === id)?.name   ?? id;
  const getRewardName = (id: string) => rewards.find((r)    => r.id === id)?.title  ?? id;

  return (
    <AnimatePresence>
      {isOpen && node && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/30 z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            style={{ width }}
            className="fixed right-0 top-0 h-full bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col"
          >
            {/* Resize handle */}
            <div
              onMouseDown={onMouseDown}
              className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize group hover:bg-purple-500/40 transition-colors z-10 flex items-center justify-center"
              title="Drag to resize"
            >
              <GripVertical className="w-3 h-3 text-zinc-600 group-hover:text-purple-400 transition-colors opacity-0 group-hover:opacity-100" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                {phase === 'edit'
                  ? <Pencil className="w-4 h-4 text-purple-400" />
                  : <GitCompare className="w-4 h-4 text-purple-400" />}
                <h2 className="text-white font-semibold text-base">
                  {phase === 'edit' ? 'Edit Node' : 'Story Modification Preview'}
                </h2>
              </div>
              <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Edit phase ── */}
            {phase === 'edit' && (
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                {/* Title */}
                <div>
                  <label className="text-zinc-400 text-xs uppercase tracking-wide mb-2 block">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-purple-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                {/* Body */}
                <div className="flex flex-col">
                  <label className="text-zinc-400 text-xs uppercase tracking-wide mb-2 block">Description</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={5}
                    className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-purple-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Variant */}
                <div>
                  <label className="text-zinc-400 text-xs uppercase tracking-wide mb-3 block">Node Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {configs.map((opt) => {
                      const Icon = opt.icon;
                      const activeColor = `${opt.iconColor} ${opt.borderColor} ${opt.bgColor}`;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => setVariant(opt.key)}
                          className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                            variant === opt.key
                              ? activeColor
                              : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-zinc-800" />

                {/* NPC Picker — non-combat variants */}
                {!isCombatVariant && (
                  <TagPicker<Character>
                    label="NPCs Involved"
                    icon={Users}
                    items={characters}
                    selectedIds={npcIds}
                    getId={(c) => c.id}
                    getName={(c) => c.name}
                    onToggle={toggleNpc}
                    loading={!charsLoaded}
                  />
                )}

                {/* Monster Picker — combat variants */}
                {isCombatVariant && (
                  <TagPicker<Character>
                    label="Monsters to Defeat"
                    icon={Skull}
                    items={characters}
                    selectedIds={monsterIds}
                    getId={(c) => c.id}
                    getName={(c) => c.name}
                    onToggle={toggleMonster}
                    loading={!charsLoaded}
                  />
                )}

                {/* Rewards Picker — all variants */}
                <TagPicker<Reward>
                  label="Rewards"
                  icon={Trophy}
                  items={rewards}
                  selectedIds={rewardIds}
                  getId={(r) => r.id}
                  getName={(r) => r.title}
                  onToggle={toggleReward}
                  loading={!rewardsLoaded}
                />

                {/* Actions */}
                <div className="pt-2 border-t border-zinc-800 flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setPhase('diff')}
                    disabled={!hasChanges}
                    className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <GitCompare className="w-4 h-4" />
                    Review Changes
                  </button>
                </div>
              </div>
            )}

            {/* ── Diff phase ── */}
            {phase === 'diff' && (
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                <p className="text-zinc-500 text-sm">
                  Compare the original and modified versions of your node below.
                </p>

                <FieldDiffPanel
                  label="Title"
                  oldVal={node.title}
                  newVal={title.trim()}
                  changed={title.trim() !== node.title}
                />

                <FieldDiffPanel
                  label="Description"
                  oldVal={node.body}
                  newVal={body.trim()}
                  changed={body.trim() !== node.body}
                />

                <FieldDiffPanel
                  label="Node Type"
                  oldVal=""
                  newVal=""
                  changed={variant !== node.variant}
                  variantOld={node.variant}
                  variantNew={variant}
                  getVariantColor={(key) => getConfig(key).iconColor}
                />

                {!isCombatVariant && (
                  <IdListDiff
                    label="NPCs Involved"
                    oldIds={node.npcIds ?? []}
                    newIds={npcIds}
                    getName={getCharName}
                    changed={!arraysEqual([...npcIds].sort(), [...(node.npcIds ?? [])].sort())}
                  />
                )}

                {isCombatVariant && (
                  <IdListDiff
                    label="Monsters to Defeat"
                    oldIds={node.monsterIds ?? []}
                    newIds={monsterIds}
                    getName={getCharName}
                    changed={!arraysEqual([...monsterIds].sort(), [...(node.monsterIds ?? [])].sort())}
                  />
                )}

                <IdListDiff
                  label="Rewards"
                  oldIds={node.rewardIds ?? []}
                  newIds={rewardIds}
                  getName={getRewardName}
                  changed={!arraysEqual([...rewardIds].sort(), [...(node.rewardIds ?? [])].sort())}
                />

                <div className="pt-2 border-t border-zinc-800 flex gap-3 mt-auto">
                  <button
                    onClick={() => setPhase('edit')}
                    className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleApply}
                    className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Apply Changes
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
