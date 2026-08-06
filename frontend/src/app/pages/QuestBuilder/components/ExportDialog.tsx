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
import { fetchQuestlineById } from '../../../api/questBuilderApi';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  questlineId: string;
  initialSelectedNodeIds?: string[];
}

export function ExportDialog({ isOpen, onClose, questlineId, initialSelectedNodeIds }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>('questflow-yaml');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPushOpen, setIsPushOpen] = useState(false);
  const [creationTemplateId, setCreationTemplateId] = useState('');
  const [creationTemplateName, setCreationTemplateName] = useState('');
  const [isQuestlineLoaded, setIsQuestlineLoaded] = useState(false);
  const [questNodes, setQuestNodes] = useState<{ id: string; title: string }[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTemplateFormat = format.startsWith('template-');
  const formatOptions = FORMAT_OPTIONS.filter((opt) => !opt.id.startsWith('template-') || !!creationTemplateId);

  const loadPreview = useCallback(
    (selectedFormat: Format, selectedTemplateId: string, nodeIds: string[]) => {
      if (!questlineId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setIsLoading(true);
        setError(null);
        try {
          const result = await previewExport(questlineId, selectedFormat, {
            templateId: selectedTemplateId || undefined,
            nodeIds: nodeIds.length > 0 ? nodeIds : undefined,
          });
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

  useEffect(() => {
    if (!isOpen || !questlineId) return;
    setIsQuestlineLoaded(false);
    setCreationTemplateId('');
    setCreationTemplateName('');
    setQuestNodes([]);
    setSelectedNodeIds([]);
    fetchQuestlineById(questlineId)
      .then((data) => {
        const nodes = data.nodes.map((node) => ({ id: node.id, title: node.data.title }));
        setQuestNodes(nodes);
        const validIds = initialSelectedNodeIds?.filter((id) => nodes.some((n) => n.id === id));
        setSelectedNodeIds(validIds?.length ? validIds : nodes.map((node) => node.id));
        if (data.template) {
          setCreationTemplateId(data.template.id);
          setCreationTemplateName(data.template.name);
        } else {
          setFormat((current) => (current.startsWith('template-') ? 'questflow-yaml' : current));
        }
        setIsQuestlineLoaded(true);
      })
      .catch(() => {
        setQuestNodes([]);
        setSelectedNodeIds([]);
        setIsQuestlineLoaded(true);
      });
  }, [isOpen, questlineId, initialSelectedNodeIds]);

  // Load preview on open and when format changes
  useEffect(() => {
    if (!isQuestlineLoaded) return;
    if (isOpen) loadPreview(format, creationTemplateId, selectedNodeIds);
  }, [isOpen, format, creationTemplateId, selectedNodeIds, isQuestlineLoaded, loadPreview]);

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
      await downloadExport(questlineId, format, {
        templateId: creationTemplateId || undefined,
        nodeIds: selectedNodeIds.length > 0 ? selectedNodeIds : undefined,
      });
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
        <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 !max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-steel-100 text-lg">Export Quest</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-stretch">
            {/* Left column: format, template, quest nodes */}
            <div className="flex flex-col gap-4 min-h-0">
              <div className="space-y-1">
                <label className="text-steel-400 text-sm">Format</label>
                <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
                  <SelectTrigger className="bg-steel-800 border-steel-600 text-steel-100 focus:ring-pulse">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-steel-800 border-steel-600">
                    {formatOptions.map((opt) => (
                      <SelectItem
                        key={opt.id}
                        value={opt.id}
                        className="text-steel-100 focus:bg-steel-700 focus:text-steel-100"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isTemplateFormat && (
                <div className="space-y-1">
                  <label className="text-steel-400 text-sm">Template</label>
                  <div className="px-3 py-2 rounded-lg bg-steel-800/60 border border-steel-700 text-steel-300 text-sm">
                    {creationTemplateName}
                  </div>
                  <p className="text-steel-500 text-xs">Locked to the template this quest was generated with.</p>
                </div>
              )}

              <div className="flex flex-col flex-1 min-h-0 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-steel-400 text-sm">Quest Nodes</label>
                  <button
                    type="button"
                    onClick={() => setSelectedNodeIds(selectedNodeIds.length === questNodes.length ? [] : questNodes.map((node) => node.id))}
                    className="text-xs text-pulse hover:text-pulse"
                  >
                    {selectedNodeIds.length === questNodes.length ? 'Select none' : 'Whole questline'}
                  </button>
                </div>
                <div className="flex-1 min-h-[16rem] overflow-auto rounded-lg border border-steel-700 bg-steel-950 p-2 space-y-1">
                  {questNodes.map((node) => (
                    <label key={node.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-steel-850 text-sm text-steel-200">
                      <input
                        type="checkbox"
                        checked={selectedNodeIds.includes(node.id)}
                        onChange={() => setSelectedNodeIds((prev) => prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id])}
                        className="accent-pulse"
                      />
                      <span className="truncate">{node.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column: preview */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-steel-400 text-sm">Preview</label>
                {filename && !isLoading && (
                  <span className="text-steel-400 text-xs font-mono">{filename}</span>
                )}
              </div>

              {isLoading ? (
                <div className="space-y-2 rounded-lg border border-steel-600 bg-steel-950 p-4 flex-1 min-h-[24rem]">
                  <Skeleton className="h-4 w-3/4 bg-steel-800" />
                  <Skeleton className="h-4 w-1/2 bg-steel-800" />
                  <Skeleton className="h-4 w-2/3 bg-steel-800" />
                  <Skeleton className="h-4 w-1/3 bg-steel-800" />
                  <Skeleton className="h-4 w-4/5 bg-steel-800" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 flex-1 min-h-[24rem] flex items-center justify-center">
                  <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
              ) : (
                <div className="relative rounded-lg border border-steel-600 bg-steel-950 flex-1 min-h-[24rem]">
                  <pre className="absolute inset-0 p-4 text-sm font-mono text-steel-200 whitespace-pre-wrap break-words overflow-y-auto">
                    {content}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setIsPushOpen(true)}
              disabled={isLoading || !!error || selectedNodeIds.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-40 disabled:cursor-not-allowed text-steel-200 rounded-lg transition-colors text-sm"
            >
              <Github className="w-4 h-4" />
              Push to GitHub
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                disabled={isLoading || !!error || !content || selectedNodeIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-40 disabled:cursor-not-allowed text-steel-100 rounded-lg transition-colors text-sm"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <button
                onClick={handleDownload}
                disabled={isLoading || isDownloading || !!error || !content || selectedNodeIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed text-steel-950 font-semibold rounded-lg transition-colors text-sm"
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
        templateId={creationTemplateId || undefined}
        nodeIds={selectedNodeIds.length > 0 ? selectedNodeIds : undefined}
      />
    </>
  );
}
