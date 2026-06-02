import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Copy, Loader2, FileText, FolderOpen, Github } from 'lucide-react';
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
  ExportFile,
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

function FileTree({
  files,
  selected,
  onSelect,
}: {
  files: ExportFile[];
  selected: string;
  onSelect: (path: string) => void;
}) {
  // Group files by top-level folder
  const entries: { folder: string | null; file: ExportFile }[] = files.map((f) => {
    const slash = f.path.indexOf('/');
    return { folder: slash >= 0 ? f.path.slice(0, slash) : null, file: f };
  });

  const folders = Array.from(new Set(entries.filter((e) => e.folder).map((e) => e.folder as string)));
  const rootFiles = entries.filter((e) => !e.folder).map((e) => e.file);

  return (
    <div className="text-xs font-mono space-y-0.5 select-none">
      {/* Root files */}
      {rootFiles.map((f) => (
        <button
          key={f.path}
          onClick={() => onSelect(f.path)}
          className={`w-full text-left flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
            selected === f.path
              ? 'bg-purple-600/30 text-purple-300'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <FileText className="w-3 h-3 shrink-0" />
          <span className="truncate">{f.path}</span>
        </button>
      ))}

      {/* Folders */}
      {folders.map((folder) => {
        const folderFiles = entries.filter((e) => e.folder === folder).map((e) => e.file);
        return (
          <div key={folder}>
            <div className="flex items-center gap-1.5 px-2 py-1 text-zinc-500">
              <FolderOpen className="w-3 h-3 shrink-0" />
              <span>{folder}/</span>
            </div>
            {folderFiles.map((f) => (
              <button
                key={f.path}
                onClick={() => onSelect(f.path)}
                className={`w-full text-left flex items-center gap-1.5 pl-6 pr-2 py-1 rounded transition-colors ${
                  selected === f.path
                    ? 'bg-purple-600/30 text-purple-300'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{f.path.slice(folder.length + 1)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function ExportDialog({ isOpen, onClose, questlineId }: ExportDialogProps) {
  const [format, setFormat]               = useState<Format>('questflow-yaml');
  const [filename, setFilename]           = useState('');
  const [files, setFiles]                 = useState<ExportFile[]>([]);
  const [selectedPath, setSelectedPath]   = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [isPushOpen, setIsPushOpen]       = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedFile = files.find((f) => f.path === selectedPath) ?? null;

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
          setFiles(result.files);
          setSelectedPath(result.files[0]?.path ?? '');
        } catch {
          setError('Failed to generate preview. Please try again.');
          setFiles([]);
        } finally {
          setIsLoading(false);
        }
      }, 200);
    },
    [questlineId],
  );

  useEffect(() => {
    if (isOpen) loadPreview(format);
  }, [isOpen, format, loadPreview]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleCopy = async () => {
    if (!selectedFile) return;
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      toast.success(`Copied ${selectedFile.path}`);
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
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white !max-w-6xl w-full">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Export Quest</DialogTitle>
          </DialogHeader>

          {/* Format selector + zip filename */}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
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
            {filename && !isLoading && (
              <span className="text-zinc-500 text-xs font-mono pb-2">{filename}</span>
            )}
          </div>

          {/* File tree + preview */}
          <div className="flex gap-3 h-96">
            {/* File tree */}
            <div className="w-56 shrink-0 rounded-lg border border-zinc-700 bg-zinc-950 overflow-y-auto p-2">
              {isLoading ? (
                <div className="space-y-1 p-1">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-5 bg-zinc-800" style={{ width: `${55 + (i % 3) * 15}%` }} />
                  ))}
                </div>
              ) : error ? (
                <p className="text-red-400 text-xs p-2">{error}</p>
              ) : (
                <FileTree files={files} selected={selectedPath} onSelect={setSelectedPath} />
              )}
            </div>

            {/* Preview pane */}
            <div className="flex-1 relative rounded-lg border border-zinc-700 bg-zinc-950">
              {isLoading ? (
                <div className="absolute inset-0 p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4 bg-zinc-800" />
                  <Skeleton className="h-4 w-1/2 bg-zinc-800" />
                  <Skeleton className="h-4 w-2/3 bg-zinc-800" />
                  <Skeleton className="h-4 w-4/5 bg-zinc-800" />
                  <Skeleton className="h-4 w-1/3 bg-zinc-800" />
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-red-400 text-sm text-center px-4">{error}</p>
                </div>
              ) : (
                <>
                  {selectedFile && (
                    <div className="absolute top-0 left-0 right-0 px-3 py-1.5 border-b border-zinc-700 text-zinc-500 text-xs font-mono bg-zinc-900/80">
                      {selectedFile.path}
                    </div>
                  )}
                  <pre className="absolute inset-0 p-4 pt-8 text-xs font-mono text-zinc-300 whitespace-pre overflow-auto">
                    {selectedFile?.content ?? ''}
                  </pre>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setIsPushOpen(true)}
              disabled={isLoading || !!error || files.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors text-sm"
            >
              <Github className="w-4 h-4" />
              Push to GitHub
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                disabled={isLoading || !!error || !selectedFile}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                <Copy className="w-4 h-4" />
                Copy file
              </button>
              <button
                onClick={handleDownload}
                disabled={isLoading || isDownloading || !!error || files.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                {isDownloading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />
                }
                Download ZIP
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
