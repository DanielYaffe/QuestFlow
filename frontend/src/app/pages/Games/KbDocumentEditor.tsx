import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FilePlus2, FileText, Loader2, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  KbType,
  KB_TYPES,
  FREEFORM_ONLY_TYPES,
  KbDocument,
  getKbDocument,
  ingestKbDocument,
  editKbDocument,
} from '../../api/gameApi';
import { TYPE_LABELS, FORMAT_HELP, ACCEPTED_FORMATS } from './kbContent';

// Full-page knowledge-base document editor.
//   #/games/:gameId/docs/new     — create (drag-drop a file or paste text)
//   #/games/:gameId/docs/:docId  — edit an existing document
// Files are read client-side (no upload endpoint); the right-hand panel shows
// the recommended shape for the selected category with an insertable template.
export function KbDocumentEditor() {
  const { gameId = '', docId } = useParams();
  const navigate = useNavigate();
  const isEdit = docId !== undefined;

  const [loading, setLoading] = useState(isEdit);
  const [doc, setDoc] = useState<KbDocument | null>(null);
  const [type, setType] = useState<KbType>('general');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [sourceFilename, setSourceFilename] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await getKbDocument(gameId, docId);
        if (cancelled) return;
        setDoc(full);
        setType(full.type);
        setTitle(full.title);
        setText(full.originalText ?? '');
        setSourceFilename(full.sourceFilename);
      } catch {
        if (!cancelled) {
          toast.error('Failed to load document');
          navigate(`/games/${gameId}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, gameId, docId, navigate]);

  const handleFile = (file: File) => {
    if (file.size > 1_000_000) {
      toast.error('File too large (max 1 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setSourceFilename(file.name);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.onerror = () => toast.error('Could not read the file');
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const insertTemplate = () => {
    const template = FORMAT_HELP[type].template;
    setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${template}` : template));
    textRef.current?.focus();
  };

  const handleSave = async () => {
    if (!title.trim() || !text.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        const { reEmbedded } = await editKbDocument(gameId, docId, { title: title.trim(), text });
        toast.success(reEmbedded ? 'Document saved — re-indexing in the background' : 'Document saved');
      } else {
        await ingestKbDocument(gameId, { type, title: title.trim(), text, sourceFilename });
        toast.success('Document added — indexing in the background');
      }
      navigate(`/games/${gameId}`);
    } catch {
      toast.error(isEdit ? 'Failed to save document' : 'Failed to add document');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <Loader2 className="w-6 h-6 text-pulse animate-spin" />
      </div>
    );
  }

  const help = FORMAT_HELP[type];
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const isFreeformType = FREEFORM_ONLY_TYPES.includes(type);
  // What the last completed ingest actually did with this document.
  const entityCount = doc?.status === 'ready' && doc.metadata?.structured === true
    ? Number(doc.metadata.entityCount ?? 0)
    : 0;

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <main className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/games/${gameId}`)}
            className="w-8 h-8 flex items-center justify-center bg-steel-850 hover:bg-steel-800 border border-steel-700 text-steel-400 hover:text-steel-100 rounded-md transition-colors shrink-0 cursor-pointer"
            title="Back to game"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-md bg-steel-800 flex items-center justify-center shrink-0">
            {isEdit ? <FileText className="w-5 h-5 text-pulse" /> : <FilePlus2 className="w-5 h-5 text-pulse" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-steel-100 font-semibold text-lg leading-none truncate">
              {isEdit ? 'Edit Document' : 'Add Document'}
            </h1>
            <p className="text-steel-400 text-xs mt-1 truncate">
              {isEdit
                ? 'Changing the content re-indexes the document in the background.'
                : 'Indexing runs in the background — the document is searchable once it turns Ready.'}
              {isEdit && doc?.status === 'ready' && (
                entityCount > 0
                  ? <span className="text-emerald-400"> Last index: {entityCount} entit{entityCount === 1 ? 'y' : 'ies'} recognized.</span>
                  : isFreeformType
                    ? <span> Last index: plain text ({doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}).</span>
                    : <span className="text-amber-400/90"> Last index: no entities recognized — indexed as plain text. Check the accepted formats →</span>
              )}
            </p>
          </div>

          {/* Category picker */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <div className="flex gap-1 bg-steel-850 border border-steel-700 rounded-md p-1">
              {KB_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={isEdit}
                  onClick={() => setType(t)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-60 cursor-pointer ${
                    type === t ? 'bg-volt text-steel-950 font-semibold' : 'text-steel-400 hover:text-steel-100'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={submitting || !title.trim() || !text.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save' : 'Add to knowledge base'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Editor column */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex items-center justify-center gap-3 border border-dashed rounded-md py-6 cursor-pointer transition-colors ${
                dragging
                  ? 'border-pulse bg-steel-800 text-pulse'
                  : 'border-steel-700 bg-steel-850/50 text-steel-400 hover:border-steel-500 hover:text-steel-200'
              }`}
            >
              <Upload className="w-5 h-5" />
              <span className="text-sm">
                {sourceFilename
                  ? <>Loaded <span className="text-steel-200">{sourceFilename}</span> — drop another file to replace</>
                  : <>Drop a .txt / .md / .json file here, or click to pick — or just write below</>}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div>
              <label className="block text-steel-400 text-sm mb-1">Title</label>
              <input
                type="text"
                autoFocus={!isEdit}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bestiary — northern foothills"
                className="w-full bg-steel-850 border border-steel-700 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
              />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <label className="text-steel-400 text-sm">Content</label>
                <span className="text-steel-500 text-xs tabular-nums">{wordCount.toLocaleString()} words</span>
              </div>
              <textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste or write your ${TYPE_LABELS[type].toLowerCase()} content here — it will be indexed for semantic search.`}
                rows={22}
                className="w-full bg-steel-850 border border-steel-700 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm resize-y font-mono leading-relaxed"
              />
            </div>
          </div>

          {/* Format help */}
          <aside className="bg-steel-850 border border-steel-700 rounded-md p-5 flex flex-col gap-4 lg:sticky lg:top-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pulse" />
              <h2 className="text-steel-100 text-sm font-medium">{TYPE_LABELS[type]} — recommended shape</h2>
            </div>
            <p className="text-steel-400 text-xs leading-relaxed">{help.blurb}</p>
            <ul className="flex flex-col gap-1.5">
              {help.tips.map((tip) => (
                <li key={tip} className="text-steel-200 text-xs leading-relaxed flex gap-2">
                  <span className="text-pulse shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
            <pre className="bg-steel-950 border border-steel-700 rounded-md p-3 text-steel-400 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap">
              {help.template}
            </pre>
            <button
              type="button"
              onClick={insertTemplate}
              className="self-start px-3 py-1.5 bg-steel-800 hover:bg-steel-700 text-steel-200 hover:text-steel-100 rounded-md transition-colors text-xs cursor-pointer"
            >
              Insert template into content
            </button>

            {isFreeformType ? (
              <p className="text-steel-500 text-[11px] leading-relaxed">
                {TYPE_LABELS[type]} is always indexed as plain text — no entity parsing. To get
                individually recognized, linkable entities (grounded quest references), put them
                in the Monsters, Characters, Maps, Items or Quests category instead.
              </p>
            ) : (
              <div className="flex flex-col gap-2 border-t border-steel-700 pt-4">
                <h3 className="text-steel-200 text-xs font-medium">Formats that become entities</h3>
                <p className="text-steel-400 text-[11px] leading-relaxed">
                  Documents in this category are parsed into one entry per entity (name via
                  <span className="text-steel-200"> name / title / id</span>, or the map key / heading).
                  Recognized entities are individually searchable and can be linked into quests
                  as grounded references.
                </p>
                <ul className="flex flex-col gap-1.5">
                  {ACCEPTED_FORMATS.map((f) => (
                    <li key={f.label} className="text-[11px] leading-relaxed">
                      <span className="text-steel-200">{f.label}</span>
                      <pre className="text-steel-500 whitespace-pre-wrap font-mono mt-0.5">{f.example}</pre>
                    </li>
                  ))}
                </ul>
                <p className="text-steel-500 text-[11px] leading-relaxed">
                  Anything else is still indexed as plain text — searchable, but not as individual
                  entities. After indexing, the document list shows how many entities were recognized.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
