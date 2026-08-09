import React, { useEffect, useState } from 'react';
import { History, Loader2, Redo2, Scissors, SlidersHorizontal, Sparkles, Undo2, Wand2 } from 'lucide-react';
import { SpriteTool } from '../../api/characterApi';
import { SpriteStyle } from '../../api/spriteApi';
import { CHECKER_SM, CHECKER_STYLE } from '../../utils/spriteStyles';

// ---------------------------------------------------------------------------
// The Sprite section body, shared by the character/mob and item design sheets:
// preview, art style, generation, the local image tools, and the version
// history (undo / redo / jump to any past version).
// ---------------------------------------------------------------------------

const DEFAULT_TARGET_SIZE = 64;

export interface SpriteHistory {
  urls: string[];
  index: number;
}

export interface SpriteToolsPanelProps {
  name: string;
  previewUrl?: string;
  // Item sprites are authored at tiny pixel sizes and must not be smoothed.
  pixelated?: boolean;
  onOpenPreview?: () => void;
  // Style — chosen on the sheet, not inside the generate dialog.
  style: SpriteStyle | null;
  onChangeStyle: () => void;
  // Generation
  generating: boolean;
  onGenerate: () => void;
  // Tools
  hasSprite: boolean;
  toolBusy: SpriteTool | null;
  onTool: (tool: SpriteTool, targetSize: number) => void;
  // Version history
  history: SpriteHistory;
  historyBusy: boolean;
  onSelectVersion: (index: number) => void;
  // Sheet-specific extras (the item sheet adds a PNG download).
  extraActions?: React.ReactNode;
}

export function SpriteToolsPanel({
  name,
  previewUrl,
  pixelated = false,
  onOpenPreview,
  style,
  onChangeStyle,
  generating,
  onGenerate,
  hasSprite,
  toolBusy,
  onTool,
  history,
  historyBusy,
  onSelectVersion,
  extraActions,
}: SpriteToolsPanelProps) {
  const [targetSize, setTargetSize] = useState(DEFAULT_TARGET_SIZE);

  // Seed the size from the style so the tools default to what this style
  // actually generates at, rather than a fixed 64.
  useEffect(() => {
    const width = style?.defaultDimensions?.width;
    if (width) setTargetSize(width);
  }, [style?.id, style?.defaultDimensions?.width]);

  const canUndo = history.index > 0;
  const canRedo = history.index >= 0 && history.index < history.urls.length - 1;
  const toolsDisabled = !hasSprite || toolBusy !== null || historyBusy;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4">
        {/* Preview */}
        <div
          className="relative w-40 h-40 shrink-0 rounded-md border border-steel-700 flex items-center justify-center"
          style={CHECKER_STYLE}
        >
          {previewUrl ? (
            <button
              onClick={onOpenPreview}
              className="w-full h-full flex items-center justify-center cursor-zoom-in"
              title="View full-size"
            >
              <img
                src={previewUrl}
                alt={name}
                className="max-w-full max-h-full object-contain p-2"
                style={pixelated ? { imageRendering: 'pixelated' } : undefined}
              />
            </button>
          ) : (
            <p className="text-steel-500 text-xs text-center px-3">
              No sprite yet — generate one or pick from your gallery
            </p>
          )}
          {(generating || historyBusy) && (
            <div className="absolute inset-0 rounded-md bg-steel-950/70 flex flex-col items-center justify-center gap-1.5">
              <Loader2 className="w-5 h-5 text-pulse animate-spin" />
              <p className="text-steel-200 text-[11px]">{generating ? 'Generating…' : 'Loading version…'}</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Art style — its own control, so it no longer hides behind Generate */}
          <button
            onClick={onChangeStyle}
            className="flex items-center gap-2 p-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 rounded-md text-left transition-colors cursor-pointer"
            title="Change this design's art style"
          >
            <span className="w-7 h-7 shrink-0 rounded overflow-hidden" style={CHECKER_SM}>
              {style && (
                <img
                  src={style.previewImagePath}
                  alt=""
                  className="w-full h-full object-contain"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-steel-500 text-[10px] uppercase tracking-wider leading-none">Style</span>
              <span className="block text-steel-100 text-xs truncate mt-0.5">{style?.name ?? 'Loading…'}</span>
            </span>
            <span className="ml-auto pr-1 text-pulse text-xs">Change</span>
          </button>

          <button
            disabled={generating}
            onClick={onGenerate}
            className="flex items-center gap-2 px-3 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-xs font-semibold rounded-md transition-[filter] cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate sprite
          </button>

          {/* Tools group — the size belongs to Resize and Pixel snap, never to
              Generate, so it lives inside this group and on the Resize row. */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-steel-500 text-[10px] uppercase tracking-wider">Tools</span>
            <span className="flex-1 h-px bg-steel-700" />
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={toolsDisabled}
              onClick={() => onTool('resize', targetSize)}
              className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
            >
              {toolBusy === 'resize'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                : <SlidersHorizontal className="w-3.5 h-3.5 text-pulse shrink-0" />}
              <span className="truncate">Resize to</span>
            </button>
            <input
              type="number"
              min={8}
              max={1024}
              value={targetSize}
              onChange={(e) => setTargetSize(Number(e.target.value))}
              aria-label="Target size in pixels"
              className="w-14 shrink-0 bg-steel-800 border border-steel-600 rounded-md px-2 py-2 text-steel-100 text-xs tabular-nums focus:outline-none focus:border-pulse"
            />
            <span className="text-steel-500 text-xs shrink-0">px</span>
          </div>

          <button
            disabled={toolsDisabled}
            onClick={() => onTool('pixel-snap', targetSize)}
            className="flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
            title="Snaps to the pixel grid at the size above"
          >
            {toolBusy === 'pixel-snap'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Wand2 className="w-3.5 h-3.5 text-pulse" />}
            Pixel snap
          </button>

          <button
            disabled={toolsDisabled}
            onClick={() => onTool('remove-bg', targetSize)}
            className="flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
          >
            {toolBusy === 'remove-bg'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Scissors className="w-3.5 h-3.5 text-pulse" />}
            Remove background
          </button>

          {extraActions}

          <p className="text-steel-500 text-[11px]">
            Resize and Pixel snap both use the size above. Resize grows by whole multiples (padded
            to the exact size) and snaps to the pixel grid when shrinking. All tools run locally —
            no generations spent — and every result is a new version you can undo.
          </p>
        </div>
      </div>

      {/* Version history */}
      {history.urls.length > 0 && (
        <div className="flex items-center gap-2 border-t border-steel-700 pt-3">
          <History className="w-3.5 h-3.5 text-pulse shrink-0" />
          <div className="flex gap-1 shrink-0">
            <button
              disabled={!canUndo || historyBusy}
              onClick={() => onSelectVersion(history.index - 1)}
              className="w-7 h-7 flex items-center justify-center bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-40 disabled:cursor-default text-steel-100 rounded-md transition-colors cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={!canRedo || historyBusy}
              onClick={() => onSelectVersion(history.index + 1)}
              className="w-7 h-7 flex items-center justify-center bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-40 disabled:cursor-default text-steel-100 rounded-md transition-colors cursor-pointer"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 min-w-0">
            {history.urls.map((url, i) => (
              <button
                key={`${url}-${i}`}
                disabled={historyBusy}
                onClick={() => onSelectVersion(i)}
                className={`w-9 h-9 shrink-0 rounded border overflow-hidden transition-colors cursor-pointer disabled:cursor-default ${
                  i === history.index
                    ? 'border-volt ring-1 ring-volt/40'
                    : 'border-steel-700 hover:border-steel-500'
                }`}
                style={CHECKER_SM}
                title={i === history.index ? `Version ${i + 1} — current` : `Go to version ${i + 1}`}
              >
                <img src={url} alt="" className="w-full h-full object-contain p-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
