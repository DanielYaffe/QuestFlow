import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getEditData,
  renderPreview,
  saveEditData,
  EditQuestData as EditQuestDataType,
  EditNode,
  EditCharacter,
  EditReward,
  EditObjective,
} from '../../api/editQuestDataApi';
import { FORMAT_OPTIONS, Format, ExportFile } from '../../api/questExportApi';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors';
const textareaCls = `${inputCls} resize-none`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-zinc-500 text-xs mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
        <span className="text-zinc-200 text-sm font-medium">{title}</span>
        {count !== undefined && (
          <span className="text-zinc-500 text-xs ml-auto">{count}</span>
        )}
      </button>
      {open && <div className="p-4 space-y-4 bg-zinc-950">{children}</div>}
    </div>
  );
}

// ── Per-entity editors ────────────────────────────────────────────────────────

function NodeEditor({
  node,
  index,
  onChange,
}: {
  node: EditNode;
  index: number;
  onChange: (ref: string, key: keyof EditNode, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />}
        <span className="text-zinc-300 text-sm truncate">{node.title || `Node ${index + 1}`}</span>
      </button>
      {open && (
        <div className="p-3 space-y-3 bg-zinc-950/60">
          <Field label="Title">
            <input className={inputCls} value={node.title}
              onChange={(e) => onChange(node._ref, 'title', e.target.value)} />
          </Field>
          <Field label="Body">
            <textarea className={textareaCls} rows={5} value={node.body}
              onChange={(e) => onChange(node._ref, 'body', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Variant">
              <input className={inputCls} value={node.variant}
                onChange={(e) => onChange(node._ref, 'variant', e.target.value)} />
            </Field>
            <Field label="ID (in exported files)">
              <input className={inputCls} value={node.exportKey} placeholder={`quest_${node.nodeId}`}
                onChange={(e) => onChange(node._ref, 'exportKey', e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterEditor({
  character,
  onChange,
}: {
  character: EditCharacter;
  onChange: (ref: string, key: keyof EditCharacter, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />}
        <span className="text-zinc-300 text-sm truncate">{character.name || 'Unnamed character'}</span>
      </button>
      {open && (
        <div className="p-3 space-y-3 bg-zinc-950/60">
          <Field label="Name">
            <input className={inputCls} value={character.name}
              onChange={(e) => onChange(character._ref, 'name', e.target.value)} />
          </Field>
          <Field label="Appearance">
            <textarea className={textareaCls} rows={3} value={character.appearance}
              onChange={(e) => onChange(character._ref, 'appearance', e.target.value)} />
          </Field>
          <Field label="Background">
            <textarea className={textareaCls} rows={3} value={character.background}
              onChange={(e) => onChange(character._ref, 'background', e.target.value)} />
          </Field>
          <Field label="ID (in exported files)">
            <input className={inputCls} value={character.exportKey}
              placeholder={`npc_${character.name.toLowerCase().replace(/\s+/g, '-') || 'character'}`}
              onChange={(e) => onChange(character._ref, 'exportKey', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

function RewardEditor({
  reward,
  onChange,
}: {
  reward: EditReward;
  onChange: (ref: string, key: keyof EditReward, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />}
        <span className="text-zinc-300 text-sm truncate">{reward.title || 'Unnamed reward'}</span>
      </button>
      {open && (
        <div className="p-3 space-y-3 bg-zinc-950/60">
          <Field label="Title">
            <input className={inputCls} value={reward.title}
              onChange={(e) => onChange(reward._ref, 'title', e.target.value)} />
          </Field>
          <Field label="Description">
            <textarea className={textareaCls} rows={3} value={reward.description}
              onChange={(e) => onChange(reward._ref, 'description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rarity">
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-purple-500"
                value={reward.rarity}
                onChange={(e) => onChange(reward._ref, 'rarity', e.target.value)}
              >
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
              </select>
            </Field>
            <Field label="ID (in exported files)">
              <input className={inputCls} value={reward.exportKey}
                placeholder={`reward_${reward.title.toLowerCase().replace(/\s+/g, '-') || 'reward'}`}
                onChange={(e) => onChange(reward._ref, 'exportKey', e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function ObjectiveEditor({
  objective,
  onChange,
}: {
  objective: EditObjective;
  onChange: (ref: string, key: keyof EditObjective, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-700/60 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-zinc-500 flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />}
        <span className="text-zinc-300 text-sm truncate">{objective.title || 'Unnamed objective'}</span>
      </button>
      {open && (
        <div className="p-3 space-y-3 bg-zinc-950/60">
          <Field label="Title">
            <input className={inputCls} value={objective.title}
              onChange={(e) => onChange(objective._ref, 'title', e.target.value)} />
          </Field>
          <Field label="Description">
            <textarea className={textareaCls} rows={3} value={objective.description}
              onChange={(e) => onChange(objective._ref, 'description', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EditQuestData() {
  const { questlineId = '' } = useParams<{ questlineId: string }>();
  const navigate = useNavigate();

  const [data, setData]                         = useState<EditQuestDataType | null>(null);
  const [format, setFormat]                     = useState<Format>('questflow-json');
  const [previewFiles, setPreviewFiles]         = useState<ExportFile[]>([]);
  const [selectedPath, setSelectedPath]         = useState<string | null>(null);
  const [isLoading, setIsLoading]               = useState(true);
  const [isSaving, setIsSaving]                 = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [loadError, setLoadError]               = useState<string | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!questlineId) return;
    setIsLoading(true);
    getEditData(questlineId)
      .then((d) => { setData(d); setIsLoading(false); })
      .catch((e: any) => { setLoadError(e?.response?.data?.error ?? 'Failed to load'); setIsLoading(false); });
  }, [questlineId]);

  useEffect(() => {
    if (!data || !questlineId) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const res = await renderPreview(questlineId, format, data);
        setPreviewFiles(res.files);
        setSelectedPath((prev) =>
          prev && res.files.some((f) => f.path === prev) ? prev : (res.files[0]?.path ?? null),
        );
      } catch {}
      setIsPreviewLoading(false);
    }, 600);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [data, format, questlineId]);

  const setMeta = (key: keyof EditQuestDataType['meta'], value: string) =>
    setData((d) => d ? { ...d, meta: { ...d.meta, [key]: value } } : d);

  const setNode = (ref: string, key: keyof EditNode, value: string) =>
    setData((d) => d ? { ...d, nodes: d.nodes.map((n) => n._ref === ref ? { ...n, [key]: value } : n) } : d);

  const setCharacter = (ref: string, key: keyof EditCharacter, value: string) =>
    setData((d) => d ? { ...d, characters: d.characters.map((c) => c._ref === ref ? { ...c, [key]: value } : c) } : d);

  const setReward = (ref: string, key: keyof EditReward, value: string) =>
    setData((d) => d ? { ...d, rewards: d.rewards.map((r) => r._ref === ref ? { ...r, [key]: value } : r) } : d);

  const setObjective = (ref: string, key: keyof EditObjective, value: string) =>
    setData((d) => d ? { ...d, objectives: d.objectives.map((o) => o._ref === ref ? { ...o, [key]: value } : o) } : d);

  const handleSave = async () => {
    if (!data || !questlineId) return;
    setIsSaving(true);
    try {
      await saveEditData(questlineId, data);
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Save failed');
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 text-red-400">
        {loadError ?? 'No data'}
      </div>
    );
  }

  const selectedFile = previewFiles.find((f) => f.path === selectedPath);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/quest-builder/${questlineId}`)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-white text-lg font-semibold">Edit Quest Data</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Editor (left, scrollable) ───────────────────────────────────── */}
        <div className="w-96 flex-shrink-0 overflow-y-auto border-r border-zinc-800 p-4 space-y-2">

          <Section title="Quest Line" defaultOpen>
            <Field label="Title">
              <input className={inputCls} value={data.meta.title}
                onChange={(e) => setMeta('title', e.target.value)} />
            </Field>
            <Field label="Genre">
              <input className={inputCls} value={data.meta.genre}
                onChange={(e) => setMeta('genre', e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea className={textareaCls} rows={3} value={data.meta.description}
                onChange={(e) => setMeta('description', e.target.value)} />
            </Field>
          </Section>

          {data.nodes.length > 0 && (
            <Section title="Quest Nodes" count={data.nodes.length}>
              <div className="space-y-2">
                {data.nodes.map((node, i) => (
                  <NodeEditor key={node._ref} node={node} index={i} onChange={setNode} />
                ))}
              </div>
            </Section>
          )}

          {data.characters.length > 0 && (
            <Section title="Characters" count={data.characters.length}>
              <div className="space-y-2">
                {data.characters.map((char) => (
                  <CharacterEditor key={char._ref} character={char} onChange={setCharacter} />
                ))}
              </div>
            </Section>
          )}

          {data.rewards.length > 0 && (
            <Section title="Rewards" count={data.rewards.length}>
              <div className="space-y-2">
                {data.rewards.map((reward) => (
                  <RewardEditor key={reward._ref} reward={reward} onChange={setReward} />
                ))}
              </div>
            </Section>
          )}

          {data.objectives.length > 0 && (
            <Section title="Objectives" count={data.objectives.length}>
              <div className="space-y-2">
                {data.objectives.map((obj) => (
                  <ObjectiveEditor key={obj._ref} objective={obj} onChange={setObjective} />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* ── Preview (right, flex-1) ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Format bar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
            <span className="text-zinc-400 text-sm">Preview as:</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-purple-500"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            {isPreviewLoading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
          </div>

          {/* File tree + content — same layout as ExportDialog */}
          <div className="flex flex-1 overflow-hidden">

            {/* File tree */}
            <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900 py-2">
              {previewFiles.length === 0 && !isPreviewLoading && (
                <p className="px-3 py-2 text-xs text-zinc-600">No preview yet</p>
              )}
              {previewFiles.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setSelectedPath(f.path)}
                  className={`w-full text-left px-3 py-1.5 text-xs font-mono truncate transition-colors ${
                    f.path === selectedPath
                      ? 'bg-purple-600/20 text-purple-300'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                  title={f.path}
                >
                  {f.path}
                </button>
              ))}
            </div>

            {/* File content */}
            <div className="flex-1 relative overflow-hidden bg-zinc-950">
              {selectedFile ? (
                <pre className="absolute inset-0 overflow-auto p-4 text-xs font-mono text-zinc-300 leading-relaxed">
                  {selectedFile.content}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                  {isPreviewLoading
                    ? 'Generating preview…'
                    : previewFiles.length > 0
                    ? 'Select a file'
                    : 'Edit something to see the preview'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
