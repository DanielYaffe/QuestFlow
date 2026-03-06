import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Wand2, SlidersHorizontal, ChevronDown, ChevronUp,
  Download, Copy, Check, AlertCircle, Loader2, X, ZoomIn, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { generateSprite, getSprites, SpriteFilters, SpriteRecord } from '../../api/spriteApi';
import { useSpriteJobs } from '../../context/SpriteJobContext';

// ---------------------------------------------------------------------------
// Filter option definitions
// ---------------------------------------------------------------------------

const ART_STYLES = [
  { value: 'pixel-art-8bit',  label: 'Pixel Art (8-Bit)' },
  { value: 'pixel-art-16bit', label: 'Pixel Art (16-Bit)' },
  { value: 'hand-drawn',      label: 'Hand Drawn' },
  { value: 'vector',          label: 'Vector Art' },
  { value: 'watercolor',      label: 'Watercolor' },
  { value: 'anime',           label: 'Anime / Cel Shading' },
  { value: 'realistic',       label: 'Semi-Realistic' },
  { value: '3d-render',       label: '3D Render' },
];

const PERSPECTIVES = [
  { value: 'side-view',    label: 'Side View' },
  { value: 'top-down',     label: 'Top Down' },
  { value: 'isometric',    label: 'Isometric' },
  { value: 'front-facing', label: 'Front Facing' },
];

const ASPECT_RATIOS = [
  { value: 'square',    label: '1:1 Square' },
  { value: 'portrait',  label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

const BACKGROUNDS = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'white',       label: 'White' },
  { value: 'black',       label: 'Black' },
  { value: 'gradient',    label: 'Gradient' },
  { value: 'scene',       label: 'Scene' },
];

const COLOR_PALETTES = [
  { value: 'vibrant',    label: 'Vibrant' },
  { value: 'muted',      label: 'Muted' },
  { value: 'monochrome', label: 'Monochrome' },
  { value: 'warm',       label: 'Warm' },
  { value: 'cool',       label: 'Cool' },
  { value: 'neon',       label: 'Neon / Cyberpunk' },
];

const DETAIL_LEVELS = [
  { value: 'minimal',        label: 'Minimal' },
  { value: 'medium',         label: 'Medium' },
  { value: 'detailed',       label: 'Detailed' },
  { value: 'ultra-detailed', label: 'Ultra Detailed' },
];

const CATEGORIES = [
  { value: 'character',   label: 'Character' },
  { value: 'enemy',       label: 'Enemy' },
  { value: 'npc',         label: 'NPC' },
  { value: 'item',        label: 'Item' },
  { value: 'weapon',      label: 'Weapon' },
  { value: 'environment', label: 'Environment' },
  { value: 'ui',          label: 'UI Element' },
  { value: 'effect',      label: 'Effect / Particle' },
];

const QUICK_PROMPTS = [
  'Pixel art hero with sword',
  'Forest goblin enemy',
  'Glowing health potion',
  'Ancient treasure chest',
  'Wizard casting fire spell',
  'Sci-fi robot companion',
];

const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #3f3f46 25%, transparent 25%), linear-gradient(-45deg, #3f3f46 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3f3f46 75%), linear-gradient(-45deg, transparent 75%, #3f3f46 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
  backgroundColor: '#27272a',
};

const CHECKER_SM: React.CSSProperties = {
  ...CHECKER_STYLE,
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
};

// ---------------------------------------------------------------------------
// FilterSelect
// ---------------------------------------------------------------------------

interface SelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

function FilterSelect({ label, value, options, onChange }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-blue-400 text-xs font-medium">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2.5 pr-8 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightbox modal
// ---------------------------------------------------------------------------

interface LightboxProps {
  sprite: SpriteRecord;
  onClose: () => void;
  onDownload: (url: string, name: string) => void;
  onCopy: (text: string) => void;
}

function Lightbox({ sprite, onClose, onDownload, onCopy }: LightboxProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(sprite.fullPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* Modal — fixed max height, flex column so sections don't overflow viewport */}
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close — sticky top-right */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Image — fixed height, never grows beyond 40vh */}
        <div className="flex-shrink-0 flex items-center justify-center p-6" style={CHECKER_STYLE}>
          <img
            src={sprite.imageUrl}
            alt={sprite.userPrompt}
            className="object-contain rounded-lg"
            style={{ maxHeight: '40vh', maxWidth: '100%' }}
          />
        </div>

        {/* Info + actions — scrollable when content is tall */}
        <div className="overflow-y-auto flex flex-col gap-4 p-5 border-t border-zinc-800">
          {/* User prompt */}
          <div>
            <p className="text-zinc-500 text-xs mb-1">Prompt</p>
            <p className="text-white text-sm">{sprite.userPrompt}</p>
          </div>

          {/* Full expanded prompt */}
          <div>
            <p className="text-zinc-500 text-xs mb-1">Full generation prompt</p>
            <p className="text-zinc-400 text-xs leading-relaxed bg-zinc-800 rounded-lg px-3 py-2 font-mono">
              {sprite.fullPrompt}
            </p>
          </div>

          {/* Filters row */}
          {sprite.filters && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(sprite.filters)
                .filter(([, v]) => v && v !== 'any' && v !== 'auto')
                .map(([k, v]) => (
                  <span key={k} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs rounded-full">
                    {v}
                  </span>
                ))}
            </div>
          )}

          {/* Action buttons — always visible at bottom of scroll area */}
          <div className="flex items-center gap-2 pt-1 sticky bottom-0 bg-zinc-900 pb-1">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-all duration-200 ${
                copied
                  ? 'bg-green-600/20 border border-green-600/40 text-green-400'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              <span className={`transition-transform duration-200 ${copied ? 'scale-110' : 'scale-100'}`}>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </span>
              {copied ? 'Copied!' : 'Copy prompt'}
            </button>
            <button
              onClick={() => onDownload(sprite.imageUrl, sprite.userPrompt)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors ml-auto"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: SpriteFilters = {
  artStyle:     'pixel-art-8bit',
  perspective:  'side-view',
  aspectRatio:  'square',
  background:   'transparent',
  colorPalette: 'vibrant',
  detailLevel:  'medium',
  category:     'character',
};

export function SpriteGenerator() {
  const [prompt, setPrompt] = useState('');
  const [filters, setFilters] = useState<SpriteFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(true);

  const [filtersEnabled, setFiltersEnabled] = useState(true);
  const [previewCopied, setPreviewCopied] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persisted sprites from DB + in-session preview
  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Currently previewed sprite in the main preview area
  const [current, setCurrent] = useState<SpriteRecord | null>(null);

  // Lightbox
  const [lightboxSprite, setLightboxSprite] = useState<SpriteRecord | null>(null);

  // Load saved sprites on mount
  useEffect(() => {
    getSprites()
      .then(setSprites)
      .catch(() => { /* non-fatal */ })
      .finally(() => setLoadingHistory(false));
  }, []);

  const setFilter = <K extends keyof SpriteFilters>(key: K, value: SpriteFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const { registerJob } = useSpriteJobs();

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const { jobId } = await generateSprite(prompt.trim(), filtersEnabled ? filters : {});
      registerJob(jobId, {
        label: prompt.trim().slice(0, 40),
        onDone: (record) => {
          setCurrent(record);
          setSprites((prev) => [record, ...prev]);
          setIsGenerating(false);
        },
        onError: (msg) => {
          setError(msg);
          setIsGenerating(false);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed — try again';
      setError(msg);
      setIsGenerating(false);
    }
  };

  const handleDownload = useCallback(async (url: string, name: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // fallback: open in new tab if fetch fails (e.g. CORS)
      window.open(url, '_blank');
    }
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const openLightbox = (sprite: SpriteRecord) => setLightboxSprite(sprite);

  return (
    <>
      {/* ── Lightbox ── */}
      {lightboxSprite && (
        <Lightbox
          sprite={lightboxSprite}
          onClose={() => setLightboxSprite(null)}
          onDownload={handleDownload}
          onCopy={handleCopy}
        />
      )}

      <div className="h-full overflow-y-auto bg-zinc-950">
        <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-6">

          {/* ── Header ── */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg leading-none">Sprite Generator</h1>
              <p className="text-zinc-500 text-xs mt-0.5">Generate game-ready sprites with AI</p>
            </div>
          </div>

          {/* ── Prompt + Generate ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2 bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 pt-3 pb-3">
              {/* Top row: category badge + generate button */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-white text-xs font-medium">
                    {filtersEnabled
                      ? (CATEGORIES.find((c) => c.value === filters.category)?.label ?? 'Sprite')
                      : 'Sprite'}
                  </span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="shrink-0 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  {isGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Generate</>
                  )}
                </button>
              </div>
              {/* Multiline textarea */}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                placeholder="Describe your sprite… e.g. maple story character with blue eyes and green hair with a pair of angel wings"
                rows={3}
                className="w-full bg-transparent text-white text-sm placeholder:text-zinc-500 focus:outline-none resize-none overflow-y-auto leading-relaxed"
              />
            </div>

            {/* Quick prompts */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-500 text-xs">Quick:</span>
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  onClick={() => setPrompt(qp)}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-full transition-colors border border-zinc-700"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Filter controls row */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="flex items-center gap-2 text-blue-400 text-xs font-medium hover:text-blue-300 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
                {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              <button
                onClick={() => setFiltersEnabled((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  filtersEnabled ? 'text-blue-400 hover:text-blue-300' : 'text-zinc-500 hover:text-zinc-400'
                }`}
                title={filtersEnabled ? 'Filters active — click to use prompt only' : 'Filters disabled — click to enable'}
              >
                {filtersEnabled
                  ? <ToggleRight className="w-4 h-4" />
                  : <ToggleLeft  className="w-4 h-4" />}
                {filtersEnabled ? 'Filters on' : 'Filters off'}
              </button>
            </div>

            {/* Filter grid */}
            {showFilters && filtersEnabled && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-1 border-t border-zinc-800">
                <FilterSelect label="Art Style"     value={filters.artStyle}     options={ART_STYLES}     onChange={(v) => setFilter('artStyle', v)} />
                <FilterSelect label="Perspective"   value={filters.perspective}  options={PERSPECTIVES}   onChange={(v) => setFilter('perspective', v)} />
                <FilterSelect label="Aspect Ratio"  value={filters.aspectRatio}  options={ASPECT_RATIOS}  onChange={(v) => setFilter('aspectRatio', v)} />
                <FilterSelect label="Background"    value={filters.background}   options={BACKGROUNDS}    onChange={(v) => setFilter('background', v)} />
                <FilterSelect label="Color Palette" value={filters.colorPalette} options={COLOR_PALETTES} onChange={(v) => setFilter('colorPalette', v)} />
                <FilterSelect label="Detail Level"  value={filters.detailLevel}  options={DETAIL_LEVELS}  onChange={(v) => setFilter('detailLevel', v)} />
                <FilterSelect label="Category"      value={filters.category}     options={CATEGORIES}     onChange={(v) => setFilter('category', v)} />
              </div>
            )}
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Preview ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <h3 className="text-white text-sm font-medium">Preview</h3>
              {current && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleCopy(current.fullPrompt);
                      setPreviewCopied(true);
                      setTimeout(() => setPreviewCopied(false), 2000);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                      previewCopied
                        ? 'bg-green-600/20 border border-green-600/40 text-green-400'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    }`}
                    title="Copy full generation prompt"
                  >
                    <span className={`transition-transform duration-200 ${previewCopied ? 'scale-110' : 'scale-100'}`}>
                      {previewCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </span>
                    {previewCopied ? 'Copied!' : 'Copy prompt'}
                  </button>
                  <button
                    onClick={() => handleDownload(current.imageUrl, current.userPrompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                </div>
              )}
            </div>

            <div className="bg-zinc-950/60 overflow-y-auto flex items-center justify-center" style={{ maxHeight: '420px', minHeight: '300px' }}>
              {isGenerating ? (
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                  <p className="text-zinc-400 text-sm">Generating your sprite…</p>
                  <p className="text-zinc-600 text-xs mt-1">This may take 10–20 seconds</p>
                </div>
              ) : current ? (
                <div className="flex flex-col items-center gap-4 max-w-sm w-full">
                  {/* Click to open lightbox */}
                  <div
                    className="relative group rounded-xl overflow-hidden border border-zinc-700 cursor-zoom-in"
                    style={CHECKER_STYLE}
                    onClick={() => openLightbox(current)}
                  >
                    <img
                      src={current.imageUrl}
                      alt={current.userPrompt}
                      className="max-w-full max-h-80 object-contain"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <p className="text-zinc-500 text-xs text-center line-clamp-2">{current.userPrompt}</p>
                </div>
              ) : (
                <div className="text-center">
                  <Sparkles className="w-14 h-14 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-500 text-sm">Your generated sprite will appear here</p>
                  <p className="text-zinc-600 text-xs mt-1">Enter a prompt above and click Generate</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Saved Sprites (from DB) ── */}
          <div>
            <h3 className="text-white text-sm font-medium mb-3">
              Your Sprites
              {!loadingHistory && sprites.length > 0 && (
                <span className="ml-2 text-zinc-500 font-normal">({sprites.length})</span>
              )}
            </h3>

            {loadingHistory ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </div>
            ) : sprites.length === 0 ? (
              <p className="text-zinc-600 text-sm">No sprites generated yet — create your first one above.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {sprites.map((sprite) => (
                  <div
                    key={sprite._id}
                    className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl overflow-hidden cursor-pointer transition-colors"
                    onClick={() => { setCurrent(sprite); openLightbox(sprite); }}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square flex items-center justify-center p-2 relative" style={CHECKER_SM}>
                      <img
                        src={sprite.imageUrl}
                        alt={sprite.userPrompt}
                        className="w-full h-full object-contain"
                      />
                      {/* Hover zoom hint */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Caption */}
                    <div className="px-2.5 py-2 border-t border-zinc-800">
                      <p className="text-zinc-400 text-xs line-clamp-2 group-hover:text-zinc-300 transition-colors">
                        {sprite.userPrompt}
                      </p>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(sprite.imageUrl, sprite.userPrompt); }}
                        className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs rounded transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
