import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Compass, Download, FileJson, Image, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  ROTATION_DIRECTIONS,
  RotationDirection,
  exportRotationSheet,
  getCharacter,
} from '../../api/characterApi';
import { getItem } from '../../api/itemApi';
import { CHECKER_SM, CHECKER_STYLE } from '../../utils/spriteStyles';
import { base64ToBlob, downloadBlob, downloadUrl, fileSlug } from '../../utils/download';

// ---------------------------------------------------------------------------
// Full-page viewer for a design's images (current sprite + 8-direction
// rotations), mirroring the animator layout: list rail on the left, enlarged
// pixel-perfect view in the center, download actions on the right.
// Serves both character designs (/studio/:characterId/sprites) and item
// designs (/studio/items/:itemId/sprites — sprite only, no rotations).
// ---------------------------------------------------------------------------

const ZOOM_LEVELS = [1, 2, 4, 8, 16] as const;
type Zoom = 'fit' | typeof ZOOM_LEVELS[number];

type EntryId = 'sprite' | RotationDirection;

interface ViewerEntry {
  id: EntryId;
  label: string;
  url: string;
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return fallback;
}

function isEntryId(value: string | null): value is EntryId {
  return value === 'sprite' || (ROTATION_DIRECTIONS as readonly string[]).includes(value ?? '');
}

interface ViewerSubject {
  id: string;
  name: string;
  previewUrl?: string;
  rotationUrls?: Partial<Record<RotationDirection, string>>;
}

export function SpriteViewer() {
  const { characterId = '', itemId = '' } = useParams();
  const isItem = itemId !== '';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subject, setSubject] = useState<ViewerSubject | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<EntryId>(() => {
    const sel = searchParams.get('sel');
    return isEntryId(sel) ? sel : 'sprite';
  });
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);

  useEffect(() => {
    setLoading(true);
    const load: Promise<ViewerSubject> = isItem
      ? getItem(itemId).then((i) => ({ id: i._id, name: i.name, previewUrl: i.previewUrl }))
      : getCharacter(characterId).then((c) => ({
        id: c._id, name: c.name, previewUrl: c.previewUrl, rotationUrls: c.rotationUrls,
      }));
    load
      .then(setSubject)
      .catch(() => {
        toast.error('Failed to load design');
        navigate('/studio');
      })
      .finally(() => setLoading(false));
  }, [characterId, itemId, isItem, navigate]);

  const entries = useMemo<ViewerEntry[]>(() => {
    if (!subject) return [];
    const list: ViewerEntry[] = [];
    if (subject.previewUrl) list.push({ id: 'sprite', label: 'Sprite', url: subject.previewUrl });
    for (const dir of ROTATION_DIRECTIONS) {
      const url = subject.rotationUrls?.[dir];
      if (url) list.push({ id: dir, label: dir.replace('-', ' '), url });
    }
    return list;
  }, [subject]);

  const selected = entries.find((e) => e.id === selectedId) ?? entries[0] ?? null;
  const hasRotations = entries.some((e) => e.id !== 'sprite');
  const slug = fileSlug(subject?.name ?? '');

  const select = useCallback((id: EntryId) => {
    setSelectedId(id);
    setNatural(null);
  }, []);

  const handleDownload = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const filename = selected.id === 'sprite' ? `${slug}.png` : `${slug}-${selected.id}.png`;
      await downloadUrl(selected.url, filename);
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleSheetExport = async () => {
    if (!subject || isItem) return;
    setExportingSheet(true);
    try {
      const { sheetBase64, metadata } = await exportRotationSheet(subject.id);
      downloadBlob(base64ToBlob(sheetBase64, 'image/png'), `${slug}-rotations.png`);
      downloadBlob(
        new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }),
        `${slug}-rotations.json`,
      );
      toast.success('Rotation sheet downloaded');
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    } finally {
      setExportingSheet(false);
    }
  };

  if (loading || !subject) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <Loader2 className="w-6 h-6 text-pulse animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-steel-950">
      {/* Left: image list */}
      <div className="w-56 shrink-0 flex flex-col border-r border-steel-700 bg-steel-900">
        <div className="px-3 py-2.5 border-b border-steel-700">
          <p className="text-steel-100 text-sm font-semibold truncate">{subject.name}</p>
          <p className="text-steel-500 text-[11px]">Sprite viewer</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {entries.length === 0 ? (
            <p className="text-steel-400 text-xs p-2">
              No images yet — attach a sprite on the design sheet first.
            </p>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => select(entry.id)}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                  selected?.id === entry.id
                    ? 'bg-steel-800 shadow-[inset_2px_0_0_0_#f5d90a]'
                    : 'hover:bg-steel-800/60'
                }`}
              >
                <span
                  className="w-10 h-10 shrink-0 rounded-sm border border-steel-700 flex items-center justify-center overflow-hidden"
                  style={CHECKER_SM}
                >
                  <img src={entry.url} alt="" className="max-w-full max-h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                </span>
                <span className={`text-xs capitalize truncate ${selected?.id === entry.id ? 'text-steel-100' : 'text-steel-300'}`}>
                  {entry.label}
                </span>
              </button>
            ))
          )}
          {!isItem && !hasRotations && entries.length > 0 && (
            <p className="text-steel-500 text-[11px] px-2 pt-2">
              No rotations yet — generate them on the design sheet.
            </p>
          )}
        </div>
      </div>

      {/* Center: enlarged view */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-steel-700 bg-steel-900">
          <button
            onClick={() => navigate(isItem ? `/studio/items/${itemId}` : `/studio/${characterId}`)}
            className="w-7 h-7 flex items-center justify-center bg-steel-850 hover:bg-steel-800 border border-steel-700 text-steel-400 hover:text-steel-100 rounded-md transition-colors cursor-pointer"
            title="Back to design sheet"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-steel-100 text-sm font-semibold capitalize truncate">
            {selected ? selected.label : 'Sprite viewer'}
          </h1>
          {natural && (
            <span className="text-steel-500 text-xs tabular-nums">
              {natural.width}×{natural.height}px
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {(['fit', ...ZOOM_LEVELS] as Zoom[]).map((level) => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className={`px-2 py-1 rounded-md text-xs tabular-nums transition-colors cursor-pointer ${
                  zoom === level
                    ? 'bg-steel-800 text-volt border border-steel-600'
                    : 'text-steel-400 hover:text-steel-100 border border-transparent'
                }`}
              >
                {level === 'fit' ? 'Fit' : `${level}×`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 flex">
          {!selected ? (
            <div className="m-auto text-center">
              <Image className="w-10 h-10 mx-auto mb-3 text-steel-600" />
              <p className="text-steel-400 text-sm">Nothing to show yet</p>
            </div>
          ) : (
            <div className="m-auto rounded-md border border-steel-700 p-3" style={CHECKER_STYLE}>
              <img
                key={selected.id}
                src={selected.url}
                alt={selected.label}
                onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                className={zoom === 'fit' ? 'max-w-[min(70vw,560px)] max-h-[65vh] object-contain' : 'max-w-none'}
                style={{
                  imageRendering: 'pixelated',
                  ...(zoom !== 'fit' && natural
                    ? { width: natural.width * zoom, height: natural.height * zoom }
                    : {}),
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="w-64 shrink-0 flex flex-col gap-4 border-l border-steel-700 bg-steel-900 p-4 overflow-y-auto">
        <div>
          <h2 className="text-steel-100 text-sm font-semibold flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-pulse" />
            Selected image
          </h2>
          <p className="text-steel-400 text-xs capitalize">{selected ? selected.label : '—'}</p>
          {natural && (
            <p className="text-steel-500 text-xs tabular-nums mt-0.5">
              {natural.width}×{natural.height}px
            </p>
          )}
          <button
            onClick={() => void handleDownload()}
            disabled={!selected || downloading}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-xs font-semibold rounded-md transition-[filter] cursor-pointer"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download PNG
          </button>
        </div>

        {!isItem && (
          <div className="border-t border-steel-700 pt-4">
            <h2 className="text-steel-100 text-sm font-semibold flex items-center gap-2 mb-2">
              <Compass className="w-4 h-4 text-pulse" />
              Rotation sheet
            </h2>
            <p className="text-steel-500 text-[11px] mb-3">
              All 8 directions composed into one horizontal spritesheet, plus a JSON frame map.
            </p>
            <button
              onClick={() => void handleSheetExport()}
              disabled={!hasRotations || exportingSheet}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
            >
              {exportingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5 text-pulse" />}
              Download sheet (PNG + JSON)
            </button>
            {!hasRotations && (
              <p className="text-steel-500 text-[11px] mt-2">
                Generate rotations on the design sheet to enable this export.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
