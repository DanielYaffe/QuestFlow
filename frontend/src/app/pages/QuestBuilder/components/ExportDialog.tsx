import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Copy, Loader2, Github } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import {
  Format,
  FORMAT_OPTIONS,
  previewExport,
  downloadExport,
} from '../../../api/questExportApi';
import { PushToGithubDialog } from './PushToGithubDialog';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  questlineId: string;
}

export function ExportDialog({ isOpen, onClose, questlineId }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>('questflow-yaml');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPushOpen, setIsPushOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPreview = useCallback(
    (selectedFormat: Format) => {
      if (!questlineId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setIsLoading(true);
        setError(null);
        try {
          const result = await previewExport(questlineId, selectedFormat);
          setFilename(result.filename);
          setContent(result.content);
        } catch {
          setError('Failed to generate preview. Please try again.');
        } finally {
          setIsLoading(false);
        }
      }, 200);
    },
    [questlineId],
  );

  // Load preview on open and when format changes
  useEffect(() => {
    if (isOpen) loadPreview(format);
  }, [isOpen, format, loadPreview]);

  // Clean up debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadExport(questlineId, format);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      // AbortError means the user dismissed the "Save As" picker — not an error.
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Export Quest</DialogTitle>
          </DialogHeader>

          {/* Format selector */}
          <div className="space-y-1">
            <label className="text-zinc-400 text-sm">Format</label>
            <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white focus:ring-purple-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {FORMAT_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.id}
                    value={opt.id}
                    className="text-white focus:bg-zinc-700 focus:text-white"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-zinc-400 text-sm">Preview</label>
              {filename && !isLoading && (
                <span className="text-zinc-500 text-xs font-mono">{filename}</span>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950 p-4 h-64">
                <Skeleton className="h-4 w-3/4 bg-zinc-800" />
                <Skeleton className="h-4 w-1/2 bg-zinc-800" />
                <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                <Skeleton className="h-4 w-1/3 bg-zinc-800" />
                <Skeleton className="h-4 w-4/5 bg-zinc-800" />
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 h-64 flex items-center justify-center">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            ) : (
              <div className="relative rounded-lg border border-zinc-700 bg-zinc-950 h-64">
                <pre className="absolute inset-0 p-4 text-xs font-mono text-zinc-300 whitespace-pre overflow-auto">
                  {content}
                </pre>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setIsPushOpen(true)}
              disabled={isLoading || !!error}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors text-sm"
            >
              <Github className="w-4 h-4" />
              Push to GitHub
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                disabled={isLoading || !!error || !content}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={handleDownload}
                disabled={isLoading || isDownloading || !!error || !content}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                {isDownloading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />
                }
                Download
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PushToGithubDialog
        isOpen={isPushOpen}
        onClose={() => setIsPushOpen(false)}
        questlineId={questlineId}
        format={format}
      />
    </>
  );
}
