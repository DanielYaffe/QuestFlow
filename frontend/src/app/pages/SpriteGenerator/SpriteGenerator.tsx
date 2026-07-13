import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, Wand2, ChevronDown, ChevronUp,
  Download, Copy, Check, AlertCircle, Loader2, X, ZoomIn, HelpCircle, UserPlus,
} from 'lucide-react';
import { generateSprite, getSprites, getStyles, SpriteRecord, SpriteStyle } from '../../api/spriteApi';
import { useSpriteJobs } from '../../context/SpriteJobContext';
import { PromoteToCharacterModal } from './components/PromoteToCharacterModal';
import { useProject } from '../../context/ProjectContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_PROMPTS = [
  'A small fire dragon with lava-cracked scales',
  'A forest goblin with a mossy hat',
  'A glowing crystal golem with cracked stone skin',
  'A shadow wolf with three tails',
  'A merchant turtle carrying a house on its back',
  'A tiny mushroom knight with a spore lance',
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
// Style Picker
// ---------------------------------------------------------------------------

interface StylePickerProps {
  styles: SpriteStyle[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function StylePicker({ styles, selectedId, onSelect }: StylePickerProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {styles.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`flex flex-col gap-2 p-3 rounded-xl border text-left transition-all ${
            selectedId === s.id
              ? 'border-blue-500 bg-blue-600/10 ring-1 ring-blue-500/40'
              : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-600 hover:bg-zinc-800'
          }`}
        >
          <div
            className="w-full aspect-square rounded-lg bg-zinc-900 flex items-center justify-center overflow-hidden"
            style={CHECKER_SM}
          >
            <img
              src={s.previewImagePath}
              alt={s.name}
              className="w-full h-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div>
            <p className={`text-xs font-medium leading-tight ${selectedId === s.id ? 'text-blue-300' : 'text-white'}`}>
              {s.name}
            </p>
            <p className="text-zinc-500 text-xs mt-0.5 leading-snug line-clamp-2">{s.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What's a Style? modal
// ---------------------------------------------------------------------------

function StyleInfoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">What's a Style?</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed">
          A <strong className="text-white">Style</strong> is a complete art direction recipe — it controls the checkpoint model, art approach, color treatment, and output size. You pick the <em>subject</em>; the Style decides <em>how it looks</em>.
        </p>
        <ul className="flex flex-col gap-2 text-sm text-zinc-400">
          <li className="flex gap-2"><span className="text-blue-400 shrink-0">→</span> <span><strong className="text-white">Cassette Beasts</strong> — retro 64×64 pixel-art creature sprites</span></li>
          <li className="flex gap-2"><span className="text-blue-400 shrink-0">→</span> <span><strong className="text-white">Anime Monster</strong> — stylised Pokémon-style illustration</span></li>
          <li className="flex gap-2"><span className="text-blue-400 shrink-0">→</span> <span><strong className="text-white">Dark Fantasy</strong> — gritty realistic creature design</span></li>
          <li className="flex gap-2"><span className="text-blue-400 shrink-0">→</span> <span><strong className="text-white">No Style</strong> — raw SDXL, useful for prompt experiments</span></li>
        </ul>
        <p className="text-zinc-500 text-xs">
          Styles are curated and updated with the app. Adding a new Style requires a code change — there's no upload UI by design.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightbox modal
// ---------------------------------------------------------------------------

interface LightboxProps {
  sprite: SpriteRecord;
  styleName?: string;
  onClose: () => void;
  onDownload: (url: string, name: string) => void;
  onCopy: (text: string) => void;
  onPromote: () => void;
}

function Lightbox({ sprite, styleName, onClose, onDownload, onCopy, onPromote }: LightboxProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(sprite.positivePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-shrink-0 flex items-center justify-center p-6" style={CHECKER_STYLE}>
          <img
            src={sprite.imageUrl}
            alt={sprite.userPrompt}
            className="object-contain rounded-lg"
            style={{ maxHeight: '40vh', maxWidth: '100%' }}
          />
        </div>

        <div className="overflow-y-auto flex flex-col gap-4 p-5 border-t border-zinc-800">
          <div>
            <p className="text-zinc-500 text-xs mb-1">Subject</p>
            <p className="text-white text-sm">{sprite.userPrompt}</p>
          </div>

          {styleName && (
            <div>
              <p className="text-zinc-500 text-xs mb-1">Style</p>
              <span className="px-2 py-0.5 bg-blue-600/20 border border-blue-600/30 text-blue-300 text-xs rounded-full">{styleName}</span>
            </div>
          )}

          <div>
            <p className="text-zinc-500 text-xs mb-1">Composed positive prompt</p>
            <p className="text-zinc-400 text-xs leading-relaxed bg-zinc-800 rounded-lg px-3 py-2 font-mono">
              {sprite.positivePrompt}
            </p>
          </div>

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
              onClick={onPromote}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600/20 border border-purple-600/40 hover:bg-purple-600/30 text-purple-300 text-xs rounded-lg transition-colors ml-auto"
            >
              <UserPlus className="w-3 h-3" />
              Promote to Character
            </button>
            <button
              onClick={() => onDownload(sprite.imageUrl, sprite.userPrompt)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
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

export function SpriteGenerator() {
  const { activeProjectId } = useProject();
  const [subject, setSubject] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState('none');
  const [styles, setStyles] = useState<SpriteStyle[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);

  const [showNegative, setShowNegative] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showStyleInfo, setShowStyleInfo] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [current, setCurrent] = useState<SpriteRecord | null>(null);
  const [lightboxSprite, setLightboxSprite] = useState<SpriteRecord | null>(null);
  const [promoteSprite, setPromoteSprite] = useState<SpriteRecord | null>(null);

  const [previewCopied, setPreviewCopied] = useState(false);

  const deepLinkedRef = useRef(false);

  useEffect(() => {
    getStyles()
      .then((list) => {
        setStyles(list);
        const defaultStyle = list.find((s) => s.id === 'none') ?? list[0];
        if (defaultStyle) setSelectedStyleId(defaultStyle.id);
      })
      .catch(() => {})
      .finally(() => setStylesLoading(false));
  }, []);

  useEffect(() => {
    setLoadingHistory(true);
    getSprites()
      .then((records) => {
        setSprites(records);
        if (!deepLinkedRef.current) {
          deepLinkedRef.current = true;
          const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
          const spriteId = params.get('spriteId');
          if (spriteId) {
            const match = records.find((r) => r._id === spriteId);
            if (match) {
              setCurrent(match);
              setLightboxSprite(match);
            }
            window.location.hash = '/sprite-generator';
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [activeProjectId]);

  const { registerJob } = useSpriteJobs();

  const handleGenerate = async () => {
    if (!subject.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const { jobId } = await generateSprite(
        subject.trim(),
        selectedStyleId,
        negativePrompt.trim() || undefined,
      );
      registerJob(jobId, {
        label: subject.trim().slice(0, 40),
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
      window.open(url, '_blank');
    }
  }, []);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const styleNameFor = (id: string) => styles.find((s) => s.id === id)?.name;

  return (
    <>
      {showStyleInfo && <StyleInfoModal onClose={() => setShowStyleInfo(false)} />}

      {lightboxSprite && (
        <Lightbox
          sprite={lightboxSprite}
          styleName={styleNameFor(lightboxSprite.styleId)}
          onClose={() => setLightboxSprite(null)}
          onDownload={handleDownload}
          onCopy={handleCopy}
          onPromote={() => setPromoteSprite(lightboxSprite)}
        />
      )}

      {promoteSprite && (
        <PromoteToCharacterModal
          sprite={promoteSprite}
          onClose={() => setPromoteSprite(null)}
        />
      )}

      <div className="h-full overflow-y-auto bg-zinc-950">
        <div className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg leading-none">Sprite Generator</h1>
              <p className="text-zinc-500 text-xs mt-0.5">Generate game-ready sprites with AI</p>
            </div>
          </div>

          {/* Style picker */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-white text-sm font-medium">Style</h2>
              <button
                onClick={() => setShowStyleInfo(true)}
                className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                What's a Style?
              </button>
            </div>
            {stylesLoading ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading styles…
              </div>
            ) : (
              <StylePicker
                styles={styles}
                selectedId={selectedStyleId}
                onSelect={setSelectedStyleId}
              />
            )}
          </div>

          {/* Subject input + generate */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2 bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 pt-3 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-white text-xs font-medium">Subject</span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleGenerate}
                  disabled={!subject.trim() || isGenerating}
                  className="shrink-0 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  {isGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Generate</>
                  )}
                </button>
              </div>
              <textarea
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                placeholder={`Describe the creature — e.g. "a fire dragon with horns and lava-cracked skin". Don't describe the art style; the selected Style handles that.`}
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
                  onClick={() => setSubject(qp)}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-full transition-colors border border-zinc-700"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Optional negative prompt */}
            <div>
              <button
                onClick={() => setShowNegative((v) => !v)}
                className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
              >
                {showNegative ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Things to avoid (optional)
              </button>
              {showNegative && (
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder={`Words describing what to avoid — added on top of the style's defaults. e.g. "wings, fins"`}
                  rows={2}
                  className="mt-2 w-full bg-zinc-800/60 border border-zinc-700 text-white text-sm placeholder:text-zinc-500 rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 resize-none"
                />
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Preview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <h3 className="text-white text-sm font-medium">Preview</h3>
              {current && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleCopy(current.positivePrompt);
                      setPreviewCopied(true);
                      setTimeout(() => setPreviewCopied(false), 2000);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                      previewCopied
                        ? 'bg-green-600/20 border border-green-600/40 text-green-400'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                    }`}
                    title="Copy composed positive prompt"
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
                  <p className="text-zinc-600 text-xs mt-1">Background removal + pixel snap run automatically</p>
                </div>
              ) : current ? (
                <div className="flex flex-col items-center gap-4 max-w-sm w-full">
                  <div
                    className="relative group rounded-xl overflow-hidden border border-zinc-700 cursor-zoom-in"
                    style={CHECKER_STYLE}
                    onClick={() => setLightboxSprite(current)}
                  >
                    <img
                      src={current.imageUrl}
                      alt={current.userPrompt}
                      className="max-w-full max-h-80 object-contain"
                    />
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
                  <p className="text-zinc-600 text-xs mt-1">Pick a style, describe your subject, and click Generate</p>
                </div>
              )}
            </div>
          </div>

          {/* Gallery */}
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
                    onClick={() => { setCurrent(sprite); setLightboxSprite(sprite); }}
                  >
                    <div className="aspect-square flex items-center justify-center p-2 relative" style={CHECKER_SM}>
                      <img
                        src={sprite.imageUrl}
                        alt={sprite.userPrompt}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
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
