import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Pencil, GitCompare, Check, ArrowLeft, GripVertical, ChevronDown, ChevronUp, Users, Trophy, Skull, Wand2, Loader2, Sparkles } from 'lucide-react';
import { Node, Edge } from '@xyflow/react';
import { toast } from 'sonner';
import { useVariantConfigs } from '../../../hooks/useVariantConfigs';
import { motion, AnimatePresence } from 'motion/react';
import { NodeVariant, QuestExportFields, QuestNodeData } from '../../../types/quest';
import { fetchCharacters, fetchRewards, Character, Reward } from '../../../api/projectSidebarApi';
import { requestAiEdit } from '../../../api/questAiEditApi';
import { TemplateFieldsEditor, getTemplateFieldSchema } from './TemplateFieldsEditor';

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
  /** Id of the node being edited — needed to scope AI suggestions to this step. */
  nodeId?: string | null;
  /** Full graph, sent to the AI endpoint so suggestions stay consistent with the story. */
  nodes?: Node<QuestNodeData>[];
  edges?: Edge[];
  questlineId: string;
  template?: {
    id: string;
    name: string;
    snapshot: unknown;
  } | null;
  onClose: () => void;
  onApply: (updated: NodeSnapshot) => void;
}

type Phase = 'edit' | 'diff';

// Fields that surface an individual before/after diff the user can accept or skip.
// `people` maps to NPCs for non-combat variants and monsters for combat variants.
type FieldKey = 'title' | 'body' | 'variant' | 'people' | 'rewards';

const ALL_ACCEPTED: Record<FieldKey, boolean> = {
  title: true, body: true, variant: true, people: true, rewards: true,
};

const FIELD_LABEL: Record<FieldKey, string> = {
  title: 'Title', body: 'Description', variant: 'Node Type', people: 'Characters', rewards: 'Rewards',
};

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
          ? <span key={i} className="underline decoration-dotted decoration-zinc-400 underline-offset-2">{tok.text}</span>
          : <span key={i}>{tok.text}</span>;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// AcceptToggle — per-field accept/skip control shown in a diff panel header
// ---------------------------------------------------------------------------

interface FieldAccept {
  value: boolean;
  onToggle: () => void;
}

function AcceptToggle({ accepted, onToggle }: { accepted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={accepted ? 'This change will be applied — click to skip it' : 'This change will be skipped — click to apply it'}
      className="flex items-center gap-1.5 text-xs font-medium transition-colors"
    >
      <span className={accepted ? 'text-purple-300' : 'text-zinc-500'}>
        {accepted ? 'Apply' : 'Skip'}
      </span>
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
        accepted ? 'bg-purple-600 border-purple-600' : 'border-zinc-600'
      }`}>
        {accepted && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
    </button>
  );
}

// Whether a diff panel should render at full opacity (changed and not skipped)
function isFieldActive(changed: boolean, accept?: FieldAccept) {
  return changed && (!accept || accept.value);
}

function DiffPanelStatus({ changed, accept }: { changed: boolean; accept?: FieldAccept }) {
  if (changed && accept) return <AcceptToggle accepted={accept.value} onToggle={accept.onToggle} />;
  if (changed) return <span className="text-xs text-purple-400 font-medium">Modified</span>;
  return <span className="text-xs text-zinc-600">Unchanged</span>;
}

// ---------------------------------------------------------------------------
// FieldDiffPanel
// ---------------------------------------------------------------------------

function FieldDiffPanel({ label, oldVal, newVal, changed, variantOld, variantNew, getVariantColor, accept }: {
  label: string;
  oldVal: string;
  newVal: string;
  changed: boolean;
  variantOld?: NodeVariant;
  variantNew?: NodeVariant;
  getVariantColor?: (key: string) => string;
  accept?: FieldAccept;
}) {
  const isVariant = variantOld !== undefined;
  const pairs = isVariant ? [] : buildLinePairs(oldVal, newVal);
  const active = isFieldActive(changed, accept);

  return (
    <div className={`shrink-0 rounded-lg border overflow-hidden transition-opacity ${active ? 'border-zinc-700' : 'border-zinc-800 opacity-50'}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60 border-b border-zinc-700/60">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        <DiffPanelStatus changed={changed} accept={accept} />
      </div>
      <div className="grid grid-cols-2 divide-x divide-zinc-700/60 bg-zinc-900/60">
        <div className="flex flex-col min-h-0 min-w-0">
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
        <div className="flex flex-col min-h-0 min-w-0">
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

function IdListDiff({ label, oldIds, newIds, getName, changed, accept }: {
  label: string;
  oldIds: string[];
  newIds: string[];
  getName: (id: string) => string;
  changed: boolean;
  accept?: FieldAccept;
}) {
  const active = isFieldActive(changed, accept);
  return (
    <div className={`shrink-0 rounded-lg border overflow-hidden transition-opacity ${active ? 'border-zinc-700' : 'border-zinc-800 opacity-50'}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60 border-b border-zinc-700/60">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        <DiffPanelStatus changed={changed} accept={accept} />
      </div>
      <div className="grid grid-cols-2 divide-x divide-zinc-700/60 bg-zinc-900/60">
        {[{ ids: oldIds, side: 'Before' }, { ids: newIds, side: 'After' }].map(({ ids, side }) => (
          <div key={side} className="flex flex-col min-h-0 min-w-0">
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

function exportFieldsEqual(a?: QuestExportFields, b?: QuestExportFields) {
  return JSON.stringify(normalizeExportFields(a)) === JSON.stringify(normalizeExportFields(b));
}

function templateValuesEqual(a?: Record<string, unknown>, b?: Record<string, unknown>) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

export function NodeEditSidebar({ isOpen, node, nodeId, nodes, edges, questlineId, template, onClose, onApply }: NodeEditSidebarProps) {
  const { configs, getConfig } = useVariantConfigs();
  const [phase, setPhase] = useState<Phase>('edit');
  const [accepted, setAccepted] = useState<Record<FieldKey, boolean>>(ALL_ACCEPTED);
  // Ask-AI state: an instruction that asks the model to rewrite this single step.
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Which fields the latest AI suggestion changed — surfaced as a banner + hint.
  const [aiFields, setAiFields] = useState<FieldKey[]>([]);
  const [title,      setTitle]      = useState('');
  const [body,       setBody]       = useState('');
  const [variant,    setVariant]    = useState<NodeVariant>('story');
  const [npcIds,     setNpcIds]     = useState<string[]>([]);
  const [monsterIds, setMonsterIds] = useState<string[]>([]);
  const [rewardIds,  setRewardIds]  = useState<string[]>([]);
  const [exportFields, setExportFields] = useState<QuestExportFields>(DEFAULT_EXPORT_FIELDS);
  const [templateValues, setTemplateValues] = useState<Record<string, unknown>>({});
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
      setExportFields(normalizeExportFields(node.exportFields));
      setTemplateValues(node.templateValues ?? {});
      setPhase('edit');
      setAiInstruction('');
      setAiError(null);
      setAiFields([]);
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
      !arraysEqual([...rewardIds].sort(),  [...(node.rewardIds ?? [])].sort()) ||
      !exportFieldsEqual(exportFields, node.exportFields) ||
      !templateValuesEqual(templateValues, node.templateValues)
    );

  // Per-field change detection — drives the accept/skip toggles in the review phase.
  // `people` follows the picker shown for the current variant (monsters for combat, NPCs otherwise).
  const peopleIds      = isCombatVariant ? monsterIds : npcIds;
  const peopleOriginal = isCombatVariant ? (node?.monsterIds ?? []) : (node?.npcIds ?? []);
  const changedFields: Record<FieldKey, boolean> = {
    title:   node !== null && title.trim() !== node.title,
    body:    node !== null && body.trim()  !== node.body,
    variant: node !== null && variant      !== node.variant,
    people:  node !== null && !arraysEqual([...peopleIds].sort(), [...peopleOriginal].sort()),
    rewards: node !== null && !arraysEqual([...rewardIds].sort(), [...(node?.rewardIds ?? [])].sort()),
  };

  // Export settings + template values aren't shown as toggleable diffs; they ride along with Apply.
  const otherChanges =
    node !== null && (
      !exportFieldsEqual(exportFields, node.exportFields) ||
      !templateValuesEqual(templateValues, node.templateValues)
    );

  const changedKeys = (Object.keys(changedFields) as FieldKey[]).filter((k) => changedFields[k]);
  const selectedCount = changedKeys.filter((k) => accepted[k]).length;
  const canApply = selectedCount > 0 || otherChanges;

  const toggleAccept = (key: FieldKey) =>
    setAccepted((prev) => ({ ...prev, [key]: !prev[key] }));

  const goToReview = () => { setAccepted(ALL_ACCEPTED); setPhase('diff'); };

  // Ask the AI to rewrite THIS step only, then drop its suggestion into the draft
  // fields so it flows through the same per-field Apply/Skip review + Undo.
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
      const { changes } = await requestAiEdit(questlineId, {
        instruction: scoped,
        nodes: nodes ?? [],
        edges: edges ?? [],
      });
      const change = changes.find((c) => c.type === 'updateNode' && c.nodeId === nodeId);
      if (!change || change.type !== 'updateNode') {
        toast('No changes suggested', { description: 'The AI had nothing to change for this step.' });
        return;
      }

      const touched: FieldKey[] = [];
      if (change.after.title !== title)   { setTitle(change.after.title);   touched.push('title'); }
      if (change.after.body  !== body)    { setBody(change.after.body);     touched.push('body'); }
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
    if (!node || !canApply) return;
    // A skipped field keeps the node's original value; accepted fields take the edited value.
    const keep = (key: FieldKey) => changedFields[key] && !accepted[key];
    onApply({
      title:      keep('title')   ? node.title   : title.trim(),
      body:       keep('body')    ? node.body    : body.trim(),
      variant:    keep('variant') ? node.variant : variant,
      npcIds:     keep('people') && !isCombatVariant ? (node.npcIds ?? [])     : npcIds,
      monsterIds: keep('people') &&  isCombatVariant ? (node.monsterIds ?? []) : monsterIds,
      rewardIds:  keep('rewards') ? (node.rewardIds ?? []) : rewardIds,
      exportFields,
      templateValues,
    });
    setPhase('edit');
    onClose();
  };

  const getCharName   = (id: string) => characters.find((c) => c.id === id)?.name   ?? id;
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
                  {phase === 'edit' ? 'Edit Node' : 'Review Changes'}
                </h2>
              </div>
              <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Edit phase ── */}
            {phase === 'edit' && (
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                {/* Ask AI — rewrite this step (suggestion lands in the draft fields below) */}
                {nodeId && (
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-purple-200">AI Assistant</span>
                      <span className="text-xs text-zinc-500">— rewrite this step</span>
                    </div>
                    <textarea
                      value={aiInstruction}
                      onChange={(e) => setAiInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiSuggest(aiInstruction); }}
                      placeholder="e.g. make it darker, add a betrayal, tighten the writing…"
                      rows={2}
                      disabled={aiLoading}
                      className="w-full bg-zinc-800 text-white px-3 py-2.5 rounded-lg border border-zinc-700 focus:border-purple-500 focus:outline-none placeholder:text-zinc-600 resize-none disabled:opacity-50 text-sm leading-relaxed"
                    />
                    <div className="flex flex-wrap gap-2">
                      {['Make it darker', 'Add a twist', 'More vivid description', 'Tighten the writing'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={aiLoading}
                          onClick={() => handleAiSuggest(s)}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-full border border-zinc-700 transition-colors disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => handleAiSuggest(aiInstruction)}
                      disabled={aiLoading}
                      className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      {aiLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                        : <><Sparkles className="w-4 h-4" /> Suggest changes</>}
                    </button>
                    {aiError && <p className="text-red-400 text-xs">{aiError}</p>}
                    {aiFields.length > 0 && (
                      <div className="flex items-start gap-2 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2">
                        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          AI updated {aiFields.map((f) => FIELD_LABEL[f]).join(', ')}. Tweak below if needed, then{' '}
                          <span className="font-medium text-emerald-200">Review Changes</span> to approve.
                        </span>
                      </div>
                    )}
                  </div>
                )}

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
                <div className="border-t border-zinc-800 pt-5 space-y-4">
                  <div>
                    <h3 className="text-white text-sm font-semibold">Quest Export Fields</h3>
                    <p className="text-zinc-500 text-xs mt-1">Each node exports as one quest file.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-zinc-400 text-xs uppercase tracking-wide mb-1 block">Quest ID</label>
                      <input
                        type="number"
                        value={exportFields.questId ?? ''}
                        onChange={(e) => setExportFields((prev) => ({ ...prev, questId: e.target.value ? Number(e.target.value) : undefined }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 text-xs uppercase tracking-wide mb-1 block">Prerequisites</label>
                      <input
                        value={exportFields.preQuest.join(', ')}
                        onChange={(e) => setExportFields((prev) => ({
                          ...prev,
                          preQuest: e.target.value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v)),
                        }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={exportFields.silent}
                        onChange={(e) => setExportFields((prev) => ({ ...prev, silent: e.target.checked }))}
                        className="accent-purple-600"
                      />
                      Silent
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={exportFields.daily}
                        onChange={(e) => setExportFields((prev) => ({ ...prev, daily: e.target.checked }))}
                        className="accent-purple-600"
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
                          <label className="text-zinc-400 text-xs uppercase tracking-wide">{section.label}</label>
                          <button
                            type="button"
                            onClick={() => setExportFields((prev) => ({
                              ...prev,
                              [section.key]: [
                                ...prev[section.key],
                                section.key === 'toCollect' ? { itemId: 0, amount: 1 } : { id: 0, amount: 1 },
                              ],
                            }))}
                            className="text-xs text-purple-300 hover:text-purple-200"
                          >
                            Add row
                          </button>
                        </div>
                        {rows.length === 0 ? (
                          <p className="text-xs text-zinc-600 italic">No rows yet</p>
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
                                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                              />
                              <input
                                type="number"
                                placeholder={section.amountLabel}
                                value={row.amount || ''}
                                onChange={(e) => setExportFields((prev) => ({
                                  ...prev,
                                  [section.key]: prev[section.key].map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(e.target.value) || 0 } : item),
                                }))}
                                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                              />
                              <button
                                type="button"
                                onClick={() => setExportFields((prev) => ({
                                  ...prev,
                                  [section.key]: prev[section.key].filter((_, itemIndex) => itemIndex !== index),
                                }))}
                                className="px-3 py-2 text-zinc-500 hover:text-red-300 hover:bg-red-950/30 rounded-lg"
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
                <div className="pt-2 border-t border-zinc-800 flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={goToReview}
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
                {/* Summary bar: how many proposed changes, with bulk accept/skip */}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-zinc-400 text-sm">
                    {changedKeys.length > 0 ? (
                      <>
                        <span className="text-white font-medium">{selectedCount}</span>
                        <span className="text-zinc-500"> of {changedKeys.length} change{changedKeys.length !== 1 ? 's' : ''} selected</span>
                      </>
                    ) : (
                      'Review your changes before applying.'
                    )}
                  </p>
                  {changedKeys.length > 1 && (
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setAccepted(ALL_ACCEPTED)}
                        className="text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setAccepted({ title: false, body: false, variant: false, people: false, rewards: false })}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Skip all
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-zinc-500 text-xs -mt-2">
                  Toggle <span className="text-purple-300">Apply</span> / <span className="text-zinc-400">Skip</span> on each change — only the ones you keep are applied. You can undo right after.
                </p>

                <FieldDiffPanel
                  label="Title"
                  oldVal={node.title}
                  newVal={title.trim()}
                  changed={changedFields.title}
                  accept={changedFields.title ? { value: accepted.title, onToggle: () => toggleAccept('title') } : undefined}
                />

                <FieldDiffPanel
                  label="Description"
                  oldVal={node.body}
                  newVal={body.trim()}
                  changed={changedFields.body}
                  accept={changedFields.body ? { value: accepted.body, onToggle: () => toggleAccept('body') } : undefined}
                />

                <FieldDiffPanel
                  label="Node Type"
                  oldVal=""
                  newVal=""
                  changed={changedFields.variant}
                  variantOld={node.variant}
                  variantNew={variant}
                  getVariantColor={(key) => getConfig(key).iconColor}
                  accept={changedFields.variant ? { value: accepted.variant, onToggle: () => toggleAccept('variant') } : undefined}
                />

                {!isCombatVariant && (
                  <IdListDiff
                    label="NPCs Involved"
                    oldIds={node.npcIds ?? []}
                    newIds={npcIds}
                    getName={getCharName}
                    changed={changedFields.people}
                    accept={changedFields.people ? { value: accepted.people, onToggle: () => toggleAccept('people') } : undefined}
                  />
                )}

                {isCombatVariant && (
                  <IdListDiff
                    label="Monsters to Defeat"
                    oldIds={node.monsterIds ?? []}
                    newIds={monsterIds}
                    getName={getCharName}
                    changed={changedFields.people}
                    accept={changedFields.people ? { value: accepted.people, onToggle: () => toggleAccept('people') } : undefined}
                  />
                )}

                <IdListDiff
                  label="Rewards"
                  oldIds={node.rewardIds ?? []}
                  newIds={rewardIds}
                  getName={getRewardName}
                  changed={changedFields.rewards}
                  accept={changedFields.rewards ? { value: accepted.rewards, onToggle: () => toggleAccept('rewards') } : undefined}
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
                    disabled={!canApply}
                    className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {selectedCount > 0 ? `Apply ${selectedCount} change${selectedCount !== 1 ? 's' : ''}` : 'Apply changes'}
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
