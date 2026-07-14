import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { KbType, KB_TYPES, KbDocument } from '../../api/gameApi';

const TYPE_LABELS: Record<KbType, string> = {
  lore: 'Lore',
  quests: 'Quests',
  characters: 'Characters',
  dialogue: 'Dialogue',
};

interface KbDocumentDialogProps {
  isOpen: boolean;
  /** Editing an existing document (with originalText loaded); null = create. */
  editingDoc: KbDocument | null;
  onClose: () => void;
  onSubmit: (input: { type: KbType; title: string; text: string; sourceFilename?: string }) => Promise<void>;
}

// Add / edit a knowledge-base document. Text can be pasted or loaded from a
// local .txt/.md/.json file — the file is read in the browser, so no upload
// endpoint is needed.
export function KbDocumentDialog({ isOpen, editingDoc, onClose, onSubmit }: KbDocumentDialogProps) {
  const [type, setType] = useState<KbType>('lore');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [sourceFilename, setSourceFilename] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setType(editingDoc?.type ?? 'lore');
      setTitle(editingDoc?.title ?? '');
      setText(editingDoc?.originalText ?? '');
      setSourceFilename(editingDoc?.sourceFilename);
    }
  }, [isOpen, editingDoc]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ type, title: title.trim(), text, sourceFilename });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="text-white text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" />
            {editingDoc ? 'Edit Document' : 'Add Document'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-zinc-400 text-sm mb-1">Title</label>
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Region guide — the Duskwood"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Type</label>
              <div className="flex gap-1 bg-zinc-800 border border-zinc-700 rounded-lg p-1">
                {KB_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={editingDoc !== null}
                    onClick={() => setType(t)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors disabled:opacity-60 ${
                      type === t ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-zinc-400 text-sm">
                Content
                {sourceFilename && <span className="text-zinc-600 ml-2">from {sourceFilename}</span>}
              </label>
              <div className="flex items-center gap-3">
                <span className="text-zinc-600 text-xs">{wordCount.toLocaleString()} words</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Load file
                </button>
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
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your game content here — lore, quest descriptions, character sheets, dialogue… It will be indexed for semantic search."
              rows={12}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm resize-y font-mono leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-zinc-600 text-xs">
              {editingDoc
                ? 'Changing the content re-indexes the document in the background.'
                : 'Indexing runs in the background — the document is searchable once it turns Ready.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim() || !text.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingDoc ? 'Save' : 'Add to knowledge base'}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
