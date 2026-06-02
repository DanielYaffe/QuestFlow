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
  checked,
  onSelect,
  onToggle,
  onToggleFolder,
}: {
  files: ExportFile[];
  selected: string;
  checked: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onToggleFolder: (folder: string, paths: string[]) => void;
}) {
  const entries = files.map((f) => {
    const slash = f.path.indexOf('/');
    return { folder: slash >= 0 ? f.path.slice(0, slash) : null, file: f };
  });

  const folders = Array.from(new Set(entries.filter((e) => e.folder).map((e) => e.folder as string)));
  const rootFiles = entries.filter((e) => !e.folder).map((e) => e.file);

  return (
    <div className="text-xs font-mono space-y-0.5 select-none">
      {rootFiles.map((f) => (
        <div
          key={f.path}
          className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
            selected === f.path ? 'bg-purple-600/30' : 'hover:bg-zinc-800'
          }`}
        >
          <input
            type="checkbox"
            checked={checked.has(f.path)}
            onChange={() => onToggle(f.path)}
            className="accent-purple-500 shrink-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => onSelect(f.path)}
            className={`flex items-center gap-1.5 flex-1 min-w-0 text-left ${
              selected === f.path ? 'text-purple-300' : checked.has(f.path) ? 'text-zinc-300' : 'text-zinc-500'
            }`}
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">{f.path}</span>
          </button>
        </div>
      ))}

      {folders.map((folder) => {
        const folderFiles = entries.filter((e) => e.folder === folder).map((e) => e.file);
        const allChecked = folderFiles.every((f) => checked.has(f.path));
        const someChecked = folderFiles.some((f) => checked.has(f.path));

        return (
          <div key={folder}>
            <div className="flex items-center gap-1.5 px-2 py-1 text-zinc-500">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                onChange={() => onToggleFolder(folder, folderFiles.map((f) => f.path))}
                className="accent-purple-500 shrink-0 cursor-pointer"
              />
              <FolderOpen className="w-3 h-3 shrink-0" />
              <span>{folder}/</span>
            </div>
            {folderFiles.map((f) => (
              <div
                key={f.path}
                className={`flex items-center gap-1.5 pl-6 pr-2 py-1 rounded transition-colors ${
                  selected === f.path ? 'bg-purple-600/30' : 'hover:bg-zinc-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked.has(f.path)}
                  onChange={() => onToggle(f.path)}
                  className="accent-purple-500 shrink-0 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={() => onSelect(f.path)}
                  className={`flex items-center gap-1.5 flex-1 min-w-0 text-left ${
                    selected === f.path ? 'text-purple-300' : checked.has(f.path) ? 'text-zinc-300' : 'text-zinc-500'
                  }`}
                >
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate">{f.path.slice(folder.length + 1)}</span>
                </button>
              </div>
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
  const [checkedPaths, setCheckedPaths]   = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading]         = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [isPushOpen, setIsPushOpen]       = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedFile = files.find((f) => f.path === selectedPath) ?? null;
  const allChecked   = files.length > 0 && files.every((f) => checkedPaths.has(f.path));
  const someChecked  = files.some((f) => checkedPaths.has(f.path));
  const checkedCount = checkedPaths.size;

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
          setCheckedPaths(new Set(result.files.map((f) => f.path)));
        } catch {
          setError('Failed to generate preview. Please try again.');
          setFiles([]);
          setCheckedPaths(new Set());
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

  const togglePath = (path: string) => {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const toggleFolder = (folder: string, paths: string[]) => {
    const allIn = paths.every((p) => checkedPaths.has(p));
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      paths.forEach((p) => allIn ? next.delete(p) : next.add(p));
      return next;
    });
  };

  const toggleAll = () => {
    setCheckedPaths(allChecked ? new Set() : new Set(files.map((f) => f.path)));
  };

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
      await downloadExport(questlineId, format, Array.from(checkedPaths));
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
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
            <div className="w-56 shrink-0 flex flex-col rounded-lg border border-zinc-700 bg-zinc-950">
              {/* Select all */}
              {!isLoading && !error && files.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleAll}
                    className="accent-purple-500 cursor-pointer"
                  />
                  <span className="text-zinc-400 text-xs">
                    {checkedCount} / {files.length} selected
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                  <div className="space-y-1 p-1">
                    {[...Array(6)].map((_, i) => (
                      <Skeleton key={i} className="h-5 bg-zinc-800" style={{ width: `${55 + (i % 3) * 15}%` }} />
                    ))}
                  </div>
                ) : error ? (
                  <p className="text-red-400 text-xs p-2">{error}</p>
                ) : (
                  <FileTree
                    files={files}
                    selected={selectedPath}
                    checked={checkedPaths}
                    onSelect={setSelectedPath}
                    onToggle={togglePath}
                    onToggleFolder={toggleFolder}
                  />
                )}
              </div>
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
                    <div className="absolute top-0 left-0 right-0 px-3 py-1.5 border-b border-zinc-700 text-zinc-500 text-xs font-mono bg-zinc-900/80 flex items-center gap-2">
                      <span>{selectedFile.path}</span>
                      {!checkedPaths.has(selectedFile.path) && (
                        <span className="text-zinc-600 italic">(excluded)</span>
                      )}
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
              disabled={isLoading || !!error || checkedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors text-sm"
            >
              <Github className="w-4 h-4" />
              Push to GitHub
              {checkedCount > 0 && !isLoading && (
                <span className="text-zinc-500 text-xs">({checkedCount})</span>
              )}
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
                disabled={isLoading || isDownloading || !!error || checkedCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
              >
                {isDownloading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />
                }
                Download ZIP
                {checkedCount > 0 && !isLoading && (
                  <span className="text-purple-300 text-xs">({checkedCount})</span>
                )}
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
        paths={Array.from(checkedPaths)}
      />
    </>
  );
}
