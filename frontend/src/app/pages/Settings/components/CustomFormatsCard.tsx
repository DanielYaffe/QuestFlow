import React, { useEffect, useState } from 'react';
import { FileCode, Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { listCustomFormats, deleteCustomFormat, CustomFormat } from '../../../api/customFormatApi';
import { CustomFormatEditor } from '../../QuestCreate/components/CustomFormatEditor';

export function CustomFormatsCard() {
  const [formats, setFormats] = useState<CustomFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    listCustomFormats()
      .then(setFormats)
      .catch(() => setFormats([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCustomFormat(id);
      setFormats((prev) => prev.filter((f) => f.id !== id));
      toast.success('Format deleted');
    } catch {
      toast.error('Delete failed');
    }
    setDeletingId(null);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-zinc-800 p-2 rounded-lg">
          <FileCode className="w-5 h-5 text-zinc-300" />
        </div>
        <div className="flex-1">
          <h2 className="text-white font-semibold">Custom Export Formats</h2>
          <p className="text-zinc-400 text-sm">Templates for your own game engine, usable when exporting any quest</p>
        </div>
        <button
          onClick={() => setEditorOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Import
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : formats.length === 0 ? (
        <p className="text-zinc-600 text-sm text-center py-6">
          No custom formats yet. Import one to target your own engine.
        </p>
      ) : (
        <div className="space-y-2">
          {formats.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg"
            >
              <FileCode className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{f.name}</p>
                <p className="text-xs text-zinc-500 font-mono">{f.fileNamePattern}.{f.extension}</p>
              </div>
              <button
                onClick={() => handleDelete(f.id)}
                disabled={deletingId === f.id}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                title="Delete"
              >
                {deletingId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <CustomFormatEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={(created) => setFormats((prev) => [created, ...prev])}
      />
    </div>
  );
}
