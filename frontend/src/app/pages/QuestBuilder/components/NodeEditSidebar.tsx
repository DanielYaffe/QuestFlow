import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Pencil, GitCompare, Check, ArrowLeft, GripVertical, ChevronDown, ChevronUp, Users, Trophy, Skull, Sparkles, Loader2, Send } from 'lucide-react';
import { Node, Edge } from '@xyflow/react';
import { toast } from 'sonner';
import { useVariantConfigs } from '../../../hooks/useVariantConfigs';
import { motion, AnimatePresence } from 'motion/react';
import { NodeVariant, QuestExportFields, QuestNodeData } from '../../../types/quest';
import { Reward } from '../../../api/projectSidebarApi';
import { listCharacters, CharacterRecord } from '../../../api/characterApi';
import { listItems } from '../../../api/itemApi';
import { requestAiEdit } from '../../../api/questAiEditApi';
import { CharacterPicker } from './CharacterPicker';
import { TemplateFieldsEditor, getTemplateFieldSchema } from './TemplateFieldsEditor';

type AiFieldKey = 'title' | 'body' | 'variant';
const AI_FIELD_LABEL: Record<AiFieldKey, string> = { title: 'title', body: 'description', variant: 'node type' };

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
  exportFields?: QuestExportFields;
  templateValues?: Record<string, unknown>;
}

interface NodeEditSidebarProps {
  isOpen: boolean;
  node: NodeSnapshot | null;
  questlineId: string;
  projectId: string;
  nodeId: string;
  nodes: Node<QuestNodeData>[];
  edges: Edge[];
  autoAttachId?: string | null;
  template?: {
    id: string;
    name: string;
    snapshot: unknown;
  } | null;
  onClose: () => void;
  onApply: (updated: NodeSnapshot) => void;
}

type Phase = 'edit' | 'diff';

const DEFAULT_EXPORT_FIELDS: QuestExportFields = {
  silent: true,
  preQuest: [-1],
  daily: false,
  toKill: [],
  toCollect: [],
  rewardItems: [],
};

function normalizeExportFields(fields?: QuestExportFields): QuestExportFields {
  return {
    ...DEFAULT_EXPORT_FIELDS,
    ...fields,
    preQuest: fields?.preQuest?.length ? fields.preQuest : [-1],
    toKill: fields?.toKill ?? [],
    toCollect: fields?.toCollect ?? [],
    rewardItems: fields?.rewardItems ?? [],
  };
}

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
          ? <span key={i} className="underline decoration-dotted decoration-steel-400 underline-offset-2">{tok.text}</span>
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
    <div className={`rounded-lg border overflow-hidden transition-opacity ${changed ? 'border-steel-600' : 'border-steel-700 opacity-50'}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-steel-800/60 border-b border-steel-600/60">
        <span className="text-xs font-semibold text-steel-200 uppercase tracking-wider">{label}</span>
        {changed
          ? <span className="text-xs text-pulse font-medium">Modified</span>
          : <span className="text-xs text-steel-500">Unchanged</span>}
      </div>
      <div className="grid grid-cols-2 divide-x divide-steel-700/60 bg-steel-850/60">
        <div className="flex flex-col min-h-0">
          <div className="px-3 py-1.5 border-b border-steel-600/40 bg-steel-800/30">
            <span className="text-xs font-medium text-steel-400">Before</span>
          </div>
          <div className="p-3 overflow-y-auto text-sm text-steel-200 leading-relaxed" style={{ maxHeight: 160 }}>
            {isVariant ? (
              <span className={`capitalize font-medium ${getVariantColor?.(variantOld!) ?? 'text-steel-400'}`}>{variantOld}</span>
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
          <div className="px-3 py-1.5 border-b border-steel-600/40 bg-steel-800/30">
            <span className="text-xs font-medium text-steel-400">After</span>
          </div>
          <div className="p-3 overflow-y-auto text-sm text-steel-200 leading-relaxed" style={{ maxHeight: 160 }}>
            {isVariant ? (
              <span className={`capitalize font-medium ${getVariantColor?.(variantNew!) ?? 'text-steel-400'}`}>{variantNew}</span>
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
    <div className={`rounded-lg border overflow-hidden transition-opacity ${changed ? 'border-steel-600' : 'border-steel-700 opacity-50'}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-steel-800/60 border-b border-steel-600/60">
        <span className="text-xs font-semibold text-steel-200 uppercase tracking-wider">{label}</span>
        {changed
          ? <span className="text-xs text-pulse font-medium">Modified</span>
          : <span className="text-xs text-steel-500">Unchanged</span>}
      </div>
      <div className="grid grid-cols-2 divide-x divide-steel-700/60 bg-steel-850/60">
        {[{ ids: oldIds, side: 'Before' }, { ids: newIds, side: 'After' }].map(({ ids, side }) => (
          <div key={side} className="flex flex-col min-h-0">
            <div className="px-3 py-1.5 border-b border-steel-600/40 bg-steel-800/30">
              <span className="text-xs font-medium text-steel-400">{side}</span>
            </div>
            <div className="p-3 flex flex-wrap gap-1.5 min-h-[40px]">
              {ids.length === 0
                ? <span className="text-xs text-steel-500 italic">None</span>
                : ids.map((id) => (
                    <span key={id} className="text-xs bg-steel-800 text-steel-200 border border-steel-600 px-2 py-0.5 rounded-full">
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
      <label className="text-steel-400 text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5">
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
                className="inline-flex items-center gap-1 text-xs bg-steel-800 text-pulse border border-steel-600 px-2 py-0.5 rounded-full"
              >
                {name}
                <button
                  type="button"
                  onClick={() => onToggle(id)}
                  className="ml-0.5 hover:text-steel-100 transition-colors"
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
        className="w-full flex items-center justify-between px-3 py-2.5 bg-steel-800 border border-steel-600 rounded-lg text-sm text-steel-200 hover:border-steel-500 transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
        <span className="text-steel-400">
          {loading
            ? 'Loading...'
            : selectedIds.length > 0
              ? `${selectedIds.length} selected`
              : `Select ${label.toLowerCase()}...`}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-steel-400" /> : <ChevronDown className="w-4 h-4 text-steel-400" />}
      </button>

      {/* Dropdown list */}
      {open && !loading && (
        <div className="mt-1 bg-steel-800 border border-steel-600 rounded-lg overflow-hidden shadow-xl">
          {items.length === 0 ? (
            <div className="px-3 py-3 text-xs text-steel-400 italic">No items available</div>
          ) : (
            items.map((item) => {
              const id = getId(item);
              const selected = selectedIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-steel-700 transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    selected ? 'bg-volt border-pulse' : 'border-steel-500'
                  }`}>
                    {selected && <Check className="w-2.5 h-2.5 text-steel-100" />}
                  </div>
                  <span className={selected ? 'text-steel-100' : 'text-steel-200'}>{getName(item)}</span>
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

function exportFieldsEqual(a?: QuestExportFields, b?: QuestExportFields) {
  return JSON.stringify(normalizeExportFields(a)) === JSON.stringify(normalizeExportFields(b));
}

function templateValuesEqual(a?: Record<string, unknown>, b?: Record<string, unknown>) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

export function NodeEditSidebar({ isOpen, node, questlineId, projectId, nodeId, nodes, edges, autoAttachId, template, onClose, onApply }: NodeEditSidebarProps) {
  const { configs, getConfig } = useVariantConfigs();
  const [phase, setPhase] = useState<Phase>('edit');
  const [title,      setTitle]      = useState('');
  const [body,       setBody]       = useState('');
  const [variant,    setVariant]    = useState<NodeVariant>('story');
  const [npcIds,     setNpcIds]     = useState<string[]>([]);
  const [monsterIds, setMonsterIds] = useState<string[]>([]);
  const [rewardIds,  setRewardIds]  = useState<string[]>([]);
  const [exportFields, setExportFields] = useState<QuestExportFields>(DEFAULT_EXPORT_FIELDS);
  const [templateValues, setTemplateValues] = useState<Record<string, unknown>>({});
  const [width,      setWidth]      = useState(DEFAULT_WIDTH);

  // Node-scoped "Ask AI" — rewrites this step only; the suggestion lands in the draft
  // fields below and flows through the same Review Changes → diff → Apply path.
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiError,       setAiError]       = useState<string | null>(null);
  const [aiFields,      setAiFields]      = useState<AiFieldKey[]>([]);

  const [characters,       setCharacters]       = useState<CharacterRecord[]>([]);
  const [rewards,          setRewards]          = useState<Reward[]>([]);
  const [charsLoaded,      setCharsLoaded]      = useState(false);
  const [rewardsLoaded,    setRewardsLoaded]    = useState(false);

  const npcChars     = characters.filter((c) => c.kind === 'npc');
  const monsterChars = characters.filter((c) => c.kind === 'monster');

  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(DEFAULT_WIDTH);
  const attachedRef = useRef<string | null>(null);

  // Populate fields when node changes
  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setBody(node.body);
      setVariant(node.variant);
      setNpcIds(node.npcIds ?? []);
      setMonsterIds(node.monsterIds ?? []);
      setRewardIds(node.rewardIds ?? []);
      setExportFields(normalizeExportFields(node.exportFields));
      setTemplateValues(node.templateValues ?? {});
      setPhase('edit');
      setAiInstruction('');
      setAiError(null);
      setAiFields([]);
    }
  }, [node]);

  // Fetch project characters + project items when sidebar opens. Both pickers pull
  // from the project (the design source of truth), not just this questline — picking
  // one attaches it to the node, and the graph save reconciles it into the roster.
  useEffect(() => {
    if (!isOpen) return;
    setCharsLoaded(false);
    if (projectId) {
      listCharacters({ projectId })
        .then((c) => { setCharacters(c); setCharsLoaded(true); })
        .catch(() => { setCharacters([]); setCharsLoaded(true); });
    } else {
      setCharacters([]); setCharsLoaded(true);
    }
    setRewardsLoaded(false);
    if (projectId) {
      listItems({ projectId })
        .then((items) => {
          setRewards(items.map((i) => ({
            id: i._id,
            title: i.name,
            description: i.description,
            rarity: i.rarity,
            imageUrl: i.previewUrl,
            kbRef: i.kbRef,
            itemId: i._id,
          })));
          setRewardsLoaded(true);
        })
        .catch(() => { setRewards([]); setRewardsLoaded(true); });
    } else {
      setRewards([]); setRewardsLoaded(true);
    }
  }, [isOpen, projectId, questlineId]);

  // Auto-attach a character created via the "+ Create new" returnTo round-trip
  useEffect(() => {
    if (!autoAttachId || !charsLoaded) return;
    if (attachedRef.current === autoAttachId) return;
    const c = characters.find((x) => x._id === autoAttachId);
    if (!c) return;
    attachedRef.current = autoAttachId;
    if (c.kind === 'monster') {
      setMonsterIds((prev) => (prev.includes(c._id) ? prev : [...prev, c._id]));
    } else {
      setNpcIds((prev) => (prev.includes(c._id) ? prev : [...prev, c._id]));
    }
  }, [autoAttachId, charsLoaded, characters]);

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
      !arraysEqual([...rewardIds].sort(),  [...(node.rewardIds ?? [])].sort()) ||
      !exportFieldsEqual(exportFields, node.exportFields) ||
      !templateValuesEqual(templateValues, node.templateValues)
    );

  // Ask the AI to rewrite THIS step only, then drop its suggestion into the draft
  // fields so it flows through the same Review Changes → diff → Apply → Undo path.
  const handleAiSuggest = useCallback(async (rawText: string) => {
    if (!node || !nodeId || aiLoading) return;
    const userText = rawText.trim() || 'Improve the writing — make it clearer, more vivid and dramatic.';
    setAiLoading(true);
    setAiError(null);
    setAiFields([]);

    // Constrain the shared /ai-edit endpoint to a single-node rewrite.
    const scoped =
      `Focus ONLY on the quest node with id "${nodeId}" (currently titled "${node.title}"). ` +
      `Return exactly one updateNode change for node id "${nodeId}" and do NOT add, delete, ` +
      `connect or modify any other node. Instruction: ${userText}`;

    try {
      const { changes } = await requestAiEdit(questlineId, { instruction: scoped, nodes, edges });
      const change = changes.find((c) => c.type === 'updateNode' && c.nodeId === nodeId);
      if (!change || change.type !== 'updateNode') {
        toast('No changes suggested', { description: 'The AI had nothing to change for this step.' });
        return;
      }

      const touched: AiFieldKey[] = [];
      if (change.after.title !== title) { setTitle(change.after.title); touched.push('title'); }
      if (change.after.body !== body)   { setBody(change.after.body);   touched.push('body'); }
      if (change.after.variant && change.after.variant !== variant) {
        setVariant(change.after.variant as NodeVariant);
        touched.push('variant');
      }

      if (touched.length === 0) {
        toast('No changes suggested', { description: 'The AI returned the same content for this step.' });
        return;
      }
      setAiFields(touched);
      setAiInstruction('');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error
          ? String((err as { response: { data: { error: string } } }).response.data.error)
          : 'Something went wrong — please try again';
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  }, [node, nodeId, aiLoading, questlineId, nodes, edges, title, body, variant]);

  const handleClose = () => { setPhase('edit'); onClose(); };
  const handleApply = () => {
    onApply({ title: title.trim(), body: body.trim(), variant, npcIds, monsterIds, rewardIds, exportFields, templateValues });
    setPhase('edit');
    onClose();
  };

  const getCharName   = (id: string) => characters.find((c) => c._id === id)?.name  ?? id;
  const getRewardName = (id: string) => rewards.find((r)    => r.id === id)?.title  ?? id;
  const templateFieldSchema = getTemplateFieldSchema(template);

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
            className="fixed right-0 top-0 h-full bg-steel-850 border-l border-steel-700 z-50 flex flex-col"
          >
            {/* Resize handle */}
            <div
              onMouseDown={onMouseDown}
              className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize group hover:brightness-95/40 transition-colors z-10 flex items-center justify-center"
              title="Drag to resize"
            >
              <GripVertical className="w-3 h-3 text-steel-500 group-hover:text-pulse transition-colors opacity-0 group-hover:opacity-100" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-steel-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                {phase === 'edit'
                  ? <Pencil className="w-4 h-4 text-pulse" />
                  : <GitCompare className="w-4 h-4 text-pulse" />}
                <h2 className="text-steel-100 font-semibold text-base">
                  {phase === 'edit' ? 'Edit Node' : 'Story Modification Preview'}
                </h2>
              </div>
              <button onClick={handleClose} className="text-steel-400 hover:text-steel-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Edit phase ── */}
            {phase === 'edit' && (
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                {/* Ask AI — rewrite this step; the suggestion lands in the draft fields below */}
                <div className="rounded-lg border border-steel-600 bg-steel-800/40 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pulse" />
                    <span className="text-steel-200 text-xs font-semibold uppercase tracking-wide">Ask AI</span>
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      value={aiInstruction}
                      onChange={(e) => setAiInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiSuggest(aiInstruction); }}
                      placeholder="e.g. make it darker and more tense…"
                      rows={2}
                      disabled={aiLoading}
                      className="flex-1 bg-steel-800 text-steel-100 px-3 py-2 rounded-lg border border-steel-600 focus:border-pulse focus:outline-none placeholder:text-steel-500 resize-none disabled:opacity-50 text-sm leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={() => handleAiSuggest(aiInstruction)}
                      disabled={aiLoading}
                      title="Ask AI (⌘/Ctrl+Enter)"
                      className="px-3 bg-volt hover:brightness-95 disabled:bg-steel-700 disabled:text-steel-400 text-steel-950 font-semibold rounded-lg transition-colors flex items-center justify-center shrink-0"
                    >
                      {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['Make it more dramatic', 'Simplify the wording', 'Add a twist'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleAiSuggest(s)}
                        disabled={aiLoading}
                        className="text-xs px-2 py-1 bg-steel-800 hover:bg-steel-700 text-steel-400 hover:text-steel-200 border border-steel-600 rounded-full transition-colors disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {aiError && <p className="text-red-400 text-xs">{aiError}</p>}
                  {aiFields.length > 0 && (
                    <p className="text-pulse text-xs">
                      AI updated {aiFields.map((f) => AI_FIELD_LABEL[f]).join(', ')}. Tweak below if needed, then Review Changes.
                    </p>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="text-steel-400 text-xs uppercase tracking-wide mb-2 block">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-steel-800 text-steel-100 px-4 py-3 rounded-lg border border-steel-600 focus:border-pulse focus:outline-none"
                    autoFocus
                  />
                </div>

                {/* Body */}
                <div className="flex flex-col">
                  <label className="text-steel-400 text-xs uppercase tracking-wide mb-2 block">Description</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={5}
                    className="w-full bg-steel-800 text-steel-100 px-4 py-3 rounded-lg border border-steel-600 focus:border-pulse focus:outline-none resize-none"
                  />
                </div>

                {/* Variant */}
                <div>
                  <label className="text-steel-400 text-xs uppercase tracking-wide mb-3 block">Node Type</label>
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
                              : 'border-steel-600 text-steel-400 hover:border-steel-500 hover:text-steel-200'
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
                <div className="border-t border-steel-700" />

                {/* NPC Picker — non-combat variants */}
                {!isCombatVariant && (
                  <CharacterPicker
                    label="NPCs Involved"
                    icon={Users}
                    kind="npc"
                    characters={npcChars}
                    selectedIds={npcIds}
                    onToggle={toggleNpc}
                    loading={!charsLoaded}
                    projectId={projectId}
                    questId={questlineId}
                    nodeId={nodeId}
                  />
                )}

                {/* Monster Picker — combat variants */}
                {isCombatVariant && (
                  <CharacterPicker
                    label="Monsters to Defeat"
                    icon={Skull}
                    kind="monster"
                    characters={monsterChars}
                    selectedIds={monsterIds}
                    onToggle={toggleMonster}
                    loading={!charsLoaded}
                    projectId={projectId}
                    questId={questlineId}
                    nodeId={nodeId}
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

                {templateFieldSchema.length > 0 && (
                  <TemplateFieldsEditor
                    template={template ?? null}
                    fields={templateFieldSchema}
                    title={title}
                    exportFields={exportFields}
                    templateValues={templateValues}
                    onExportFieldsChange={setExportFields}
                    onTemplateValuesChange={setTemplateValues}
                  />
                )}

                {templateFieldSchema.length === 0 && (
                <div className="border-t border-steel-700 pt-5 space-y-4">
                  <div>
                    <h3 className="text-steel-100 text-sm font-semibold">Quest Export Fields</h3>
                    <p className="text-steel-400 text-xs mt-1">Each node exports as one quest file.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-steel-400 text-xs uppercase tracking-wide mb-1 block">Quest ID</label>
                      <input
                        type="number"
                        value={exportFields.questId ?? ''}
                        onChange={(e) => setExportFields((prev) => ({ ...prev, questId: e.target.value ? Number(e.target.value) : undefined }))}
                        className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                      />
                    </div>
                    <div>
                      <label className="text-steel-400 text-xs uppercase tracking-wide mb-1 block">Prerequisites</label>
                      <input
                        value={exportFields.preQuest.join(', ')}
                        onChange={(e) => setExportFields((prev) => ({
                          ...prev,
                          preQuest: e.target.value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v)),
                        }))}
                        className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-steel-200">
                      <input
                        type="checkbox"
                        checked={exportFields.silent}
                        onChange={(e) => setExportFields((prev) => ({ ...prev, silent: e.target.checked }))}
                        className="accent-pulse"
                      />
                      Silent
                    </label>
                    <label className="flex items-center gap-2 text-sm text-steel-200">
                      <input
                        type="checkbox"
                        checked={exportFields.daily}
                        onChange={(e) => setExportFields((prev) => ({ ...prev, daily: e.target.checked }))}
                        className="accent-pulse"
                      />
                      Daily
                    </label>
                  </div>

                  {[
                    { key: 'toKill' as const, label: 'Combat Objectives', idLabel: 'Mob ID', amountLabel: 'Amount' },
                    { key: 'toCollect' as const, label: 'Collection Objectives', idLabel: 'Item ID', amountLabel: 'Amount' },
                    { key: 'rewardItems' as const, label: 'Item Rewards', idLabel: 'Item ID', amountLabel: 'Amount' },
                  ].map((section) => {
                    const rows = exportFields[section.key];
                    return (
                      <div key={section.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-steel-400 text-xs uppercase tracking-wide">{section.label}</label>
                          <button
                            type="button"
                            onClick={() => setExportFields((prev) => ({
                              ...prev,
                              [section.key]: [
                                ...prev[section.key],
                                section.key === 'toCollect' ? { itemId: 0, amount: 1 } : { id: 0, amount: 1 },
                              ],
                            }))}
                            className="text-xs text-pulse hover:text-pulse"
                          >
                            Add row
                          </button>
                        </div>
                        {rows.length === 0 ? (
                          <p className="text-xs text-steel-500 italic">No rows yet</p>
                        ) : rows.map((row, index) => {
                          const currentId = 'itemId' in row ? row.itemId : row.id;
                          return (
                            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <input
                                type="number"
                                placeholder={section.idLabel}
                                value={currentId || ''}
                                onChange={(e) => setExportFields((prev) => ({
                                  ...prev,
                                  [section.key]: prev[section.key].map((item, itemIndex) => {
                                    if (itemIndex !== index) return item;
                                    return 'itemId' in item
                                      ? { ...item, itemId: Number(e.target.value) || 0 }
                                      : { ...item, id: Number(e.target.value) || 0 };
                                  }),
                                }))}
                                className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                              />
                              <input
                                type="number"
                                placeholder={section.amountLabel}
                                value={row.amount || ''}
                                onChange={(e) => setExportFields((prev) => ({
                                  ...prev,
                                  [section.key]: prev[section.key].map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(e.target.value) || 0 } : item),
                                }))}
                                className="bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                              />
                              <button
                                type="button"
                                onClick={() => setExportFields((prev) => ({
                                  ...prev,
                                  [section.key]: prev[section.key].filter((_, itemIndex) => itemIndex !== index),
                                }))}
                                className="px-3 py-2 text-steel-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                )}

                {/* Actions */}
                <div className="pt-2 border-t border-steel-700 flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-3 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setPhase('diff')}
                    disabled={!hasChanges}
                    className="flex-1 px-4 py-3 bg-volt hover:brightness-95 disabled:bg-steel-700 disabled:text-steel-400 text-steel-950 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
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
                <p className="text-steel-400 text-sm">
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

                <div className="pt-2 border-t border-steel-700 flex gap-3 mt-auto">
                  <button
                    onClick={() => setPhase('edit')}
                    className="flex-1 px-4 py-3 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleApply}
                    className="flex-1 px-4 py-3 bg-volt hover:brightness-95 text-steel-950 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
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
