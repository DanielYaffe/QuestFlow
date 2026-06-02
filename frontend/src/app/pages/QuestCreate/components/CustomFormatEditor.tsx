import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  createCustomFormat,
  previewSample,
  CustomFormat,
  BindingRule,
  QUEST_FIELDS,
  ARRAY_FIELDS,
  OBJECTIVE_ITEM_FIELDS,
} from '../../../api/customFormatApi';

interface CustomFormatEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (format: CustomFormat) => void;
}

type Bindings = Record<string, BindingRule>;

const selectCls =
  'bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-purple-500';
const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500';

// ── Recursive binding rows ──────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function Rows({
  value,
  path,
  insideRepeat,
  repeatOver,
  bindings,
  setRule,
}: {
  value: unknown;
  path: string;
  insideRepeat: boolean;
  repeatOver?: string;
  bindings: Bindings;
  setRule: (path: string, rule: BindingRule | null) => void;
}) {
  // Object: recurse over keys (no row for the object itself)
  if (isObj(value)) {
    return (
      <>
        {Object.keys(value).map((k) => (
          <Rows
            key={path ? `${path}.${k}` : k}
            value={value[k]}
            path={path ? `${path}.${k}` : k}
            insideRepeat={insideRepeat}
            repeatOver={repeatOver}
            bindings={bindings}
            setRule={setRule}
          />
        ))}
      </>
    );
  }

  // Array: mode selector (constant / bind whole / repeat)
  if (Array.isArray(value)) {
    const rule = bindings[path];
    const mode = rule?.type === 'repeat' ? 'repeat' : rule?.type === 'field' ? 'whole' : 'const';
    const elem = value.length ? value[0] : null;

    return (
      <>
        <div className="flex items-center gap-2 py-1.5 border-b border-zinc-800/60">
          <code className="text-purple-300 text-xs flex-1 truncate" title={path}>{path}</code>
          <span className="text-zinc-600 text-[10px]">array</span>
          <select
            className={selectCls}
            value={mode}
            onChange={(e) => {
              const m = e.target.value;
              if (m === 'const') setRule(path, null);
              else if (m === 'whole') setRule(path, { type: 'field', field: ARRAY_FIELDS[0].value });
              else setRule(path, { type: 'repeat', over: ARRAY_FIELDS[0].value });
            }}
          >
            <option value="const">Keep as-is</option>
            <option value="whole">Bind whole array</option>
            <option value="repeat">Repeat per…</option>
          </select>
          {(mode === 'whole' || mode === 'repeat') && (
            <select
              className={selectCls}
              value={mode === 'whole' ? rule?.field : rule?.over}
              onChange={(e) =>
                setRule(
                  path,
                  mode === 'whole'
                    ? { type: 'field', field: e.target.value }
                    : { type: 'repeat', over: e.target.value },
                )
              }
            >
              {ARRAY_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          )}
        </div>
        {mode === 'repeat' && elem !== null && (
          <div className="pl-4 border-l border-zinc-800 ml-1">
            <Rows
              value={elem}
              path={`${path}[]`}
              insideRepeat
              repeatOver={rule?.over}
              bindings={bindings}
              setRule={setRule}
            />
          </div>
        )}
      </>
    );
  }

  // Scalar leaf
  const rule = bindings[path];
  const isObjectRepeat = repeatOver === 'objectives';
  const current =
    rule?.type === 'item-field' ? `item-field:${rule.field}`
      : rule?.type === 'field' ? `field:${rule.field}`
      : rule?.type === 'item' ? 'item'
      : 'const';

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-800/60">
      <code className="text-zinc-300 text-xs flex-1 truncate" title={path}>{path}</code>
      <span className="text-zinc-600 text-[10px] truncate max-w-[80px]">{JSON.stringify(value)}</span>
      <select
        className={selectCls}
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'const') setRule(path, null);
          else if (v === 'item') setRule(path, { type: 'item' });
          else if (v.startsWith('item-field:')) setRule(path, { type: 'item-field', field: v.slice('item-field:'.length) });
          else setRule(path, { type: 'field', field: v.slice('field:'.length) });
        }}
      >
        <option value="const">Constant</option>
        {insideRepeat && !isObjectRepeat && <option value="item">Current item</option>}
        {insideRepeat && isObjectRepeat && OBJECTIVE_ITEM_FIELDS.map((f) => (
          <option key={f.value} value={`item-field:${f.value}`}>{f.label}</option>
        ))}
        {QUEST_FIELDS.map((f) => (
          <option key={f.value} value={`field:${f.value}`}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function CustomFormatEditor({ isOpen, onClose, onSaved }: CustomFormatEditorProps) {
  const [name, setName]                 = useState('');
  const [extension, setExtension]       = useState('json');
  const [fileNamePattern, setFileName]  = useState('{{id}}');
  const [pasted, setPasted]             = useState('');
  const [parsed, setParsed]             = useState<unknown>(null);
  const [parseError, setParseError]     = useState<string | null>(null);
  const [bindings, setBindings]         = useState<Bindings>({});
  const [preview, setPreview]           = useState<{ fileName: string; content: string } | null>(null);
  const [isSaving, setIsSaving]         = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setRule = (path: string, rule: BindingRule | null) =>
    setBindings((prev) => {
      const next = { ...prev };
      if (rule === null) delete next[path];
      else next[path] = rule;
      return next;
    });

  const handleParse = () => {
    try {
      const obj = JSON.parse(pasted);
      setParsed(obj);
      setBindings({});
      setParseError(null);
    } catch (e: any) {
      setParseError(e?.message ?? 'Invalid JSON');
      setParsed(null);
    }
  };

  // Debounced live preview
  useEffect(() => {
    if (parsed === null) { setPreview(null); return; }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await previewSample({ name, extension, fileNamePattern, example: parsed, bindings });
        setPreview(res);
      } catch {
        setPreview(null);
      }
    }, 400);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [parsed, bindings, name, extension, fileNamePattern]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Give the format a name'); return; }
    if (parsed === null) { toast.error('Paste and parse a JSON example first'); return; }
    setIsSaving(true);
    try {
      const created = await createCustomFormat({ name: name.trim(), extension, fileNamePattern, example: parsed, bindings });
      toast.success(`Saved "${created.name}"`);
      onSaved(created);
      handleReset();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Save failed');
    }
    setIsSaving(false);
  };

  const handleReset = () => {
    setName(''); setExtension('json'); setFileName('{{id}}');
    setPasted(''); setParsed(null); setParseError(null); setBindings({}); setPreview(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white !max-w-5xl w-full">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">Import custom format</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 h-[70vh]">
          {/* Left: definition */}
          <div className="w-1/2 flex flex-col gap-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <label className="block text-zinc-500 text-xs mb-1">Format name</label>
                <input className={inputCls} value={name} placeholder="Bootcamp" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-zinc-500 text-xs mb-1">Filename pattern</label>
                <input className={inputCls} value={fileNamePattern} placeholder="{{id}}" onChange={(e) => setFileName(e.target.value)} />
              </div>
              <div>
                <label className="block text-zinc-500 text-xs mb-1">Extension</label>
                <input className={inputCls} value={extension} placeholder="json" onChange={(e) => setExtension(e.target.value)} />
              </div>
            </div>

            {parsed === null ? (
              <div className="flex-1 flex flex-col">
                <label className="block text-zinc-500 text-xs mb-1">Paste a JSON example of one quest</label>
                <textarea
                  className={`${inputCls} flex-1 font-mono text-xs resize-none`}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={'{\n  "name": "Free Tier 3",\n  "quest_id": 2,\n  "to_kill": [{ "id": 100134, "amount": 200 }]\n}'}
                />
                {parseError && (
                  <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {parseError}
                  </p>
                )}
                <button
                  onClick={handleParse}
                  disabled={!pasted.trim()}
                  className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg text-sm transition-colors"
                >
                  Parse &amp; map
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-500 text-xs">Map each value</label>
                  <button onClick={() => { setParsed(null); setBindings({}); }} className="text-zinc-500 hover:text-zinc-300 text-xs underline">
                    re-paste
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1">
                  <Rows value={parsed} path="" insideRepeat={false} bindings={bindings} setRule={setRule} />
                </div>
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="w-1/2 flex flex-col">
            <label className="block text-zinc-500 text-xs mb-1">
              Live preview {preview && <span className="text-zinc-600 font-mono">— {preview.fileName}</span>}
            </label>
            <div className="flex-1 relative rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
              {preview ? (
                <pre className="absolute inset-0 overflow-auto p-3 text-xs font-mono text-zinc-300">{preview.content}</pre>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-600 text-sm text-center px-4">
                  {parsed === null ? 'Paste & parse a JSON example to preview' : 'Generating…'}
                </div>
              )}
            </div>
            <p className="text-zinc-600 text-[11px] mt-2">Preview uses a sample quest. Real quest data is used at export time.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || parsed === null || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg text-sm transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save format
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
