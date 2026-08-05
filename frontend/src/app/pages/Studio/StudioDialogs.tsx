import React, { useEffect, useState } from 'react';
import { BookOpen, Loader2, Palette, Sparkles, Upload } from 'lucide-react';
import { getSprites, SpriteRecord, SpriteStyle } from '../../api/spriteApi';
import { Game, listGames } from '../../api/gameApi';
import { CHECKER_SM } from '../../utils/spriteStyles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

// Dialogs shared by the studio design sheets (characters/mobs and items).

// --- Sprite picker (attach an existing generated sprite) ---------------------

export function SpritePickerDialog({ isOpen, onClose, onPick }: {
  isOpen: boolean;
  onClose: () => void;
  onPick: (sprite: SpriteRecord) => Promise<void>;
}) {
  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    getSprites().then(setSprites).catch(() => setSprites([])).finally(() => setLoading(false));
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Upload className="w-5 h-5 text-pulse" />
            Choose a sprite
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-pulse animate-spin" /></div>
        ) : sprites.length === 0 ? (
          <p className="text-steel-400 text-sm py-4">No sprites yet — generate one in the Sprite Generator first.</p>
        ) : (
          // auto-rows-min + items-start keep each cell sized by its own
          // aspect-square wrapper instead of stretching to the row height,
          // which is what squashed the thumbnails once the gallery grew.
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 auto-rows-min items-start gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {sprites.map((sprite) => (
              <button
                key={sprite._id}
                disabled={picking !== null}
                onClick={async () => {
                  setPicking(sprite._id);
                  try { await onPick(sprite); onClose(); } finally { setPicking(null); }
                }}
                className="relative block w-full rounded-md border border-steel-700 hover:border-volt overflow-hidden transition-colors cursor-pointer disabled:opacity-60"
                style={CHECKER_SM}
                title={sprite.userPrompt}
              >
                <div className="w-full aspect-square">
                  <img src={sprite.imageUrl} alt={sprite.userPrompt} loading="lazy" className="w-full h-full object-contain p-1" />
                </div>
                {picking === sprite._id && (
                  <span className="absolute inset-0 bg-steel-950/60 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-pulse animate-spin" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Style picker (the design's art style, chosen outside the generate flow) ---

export function StylePickerDialog({ isOpen, styles, selectedId, onClose, onSelect }: {
  isOpen: boolean;
  styles: SpriteStyle[];
  selectedId: string;
  onClose: () => void;
  onSelect: (styleId: string) => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Palette className="w-5 h-5 text-pulse" />
            Art style
          </DialogTitle>
        </DialogHeader>
        <p className="text-steel-400 text-sm">
          Every sprite generated for this design is rendered in the chosen style. Change it any
          time — existing sprites are left alone.
        </p>
        {styles.length === 0 ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-pulse animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 auto-rows-min gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {styles.map((s) => {
              const selected = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => { onSelect(s.id); onClose(); }}
                  className={`flex flex-col gap-2 p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                    selected
                      ? 'border-volt bg-steel-800'
                      : 'border-steel-700 bg-steel-800/50 hover:border-steel-500 hover:bg-steel-800'
                  }`}
                >
                  <div className="w-full aspect-square rounded overflow-hidden" style={CHECKER_SM}>
                    <img
                      src={s.previewImagePath}
                      alt={s.name}
                      className="w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                    />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold leading-tight ${selected ? 'text-volt' : 'text-steel-100'}`}>
                      {s.name}
                    </p>
                    <p className="text-steel-400 text-[11px] mt-0.5 leading-snug line-clamp-2">{s.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Generate sprite (ComfyUI pipeline, auto-attached on completion) -----------

export function GenerateSpriteDialog({ isOpen, initialPrompt, style, onClose, onChangeStyle, onSubmit }: {
  isOpen: boolean;
  initialPrompt: string;
  // The design's style, picked on the sheet — shown here for confirmation only.
  style: SpriteStyle | null;
  onClose: () => void;
  onChangeStyle: () => void;
  onSubmit: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPrompt(initialPrompt);
  }, [isOpen, initialPrompt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(prompt.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pulse" />
            Generate sprite
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-steel-400 text-sm mb-1">Subject</label>
            <textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Visually concrete description of this design"
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm resize-none"
            />
          </div>
          {style && (
            <div className="flex items-center gap-2.5 bg-steel-800/60 border border-steel-700 rounded-md px-3 py-2">
              <div className="w-8 h-8 shrink-0 rounded overflow-hidden" style={CHECKER_SM}>
                <img
                  src={style.previewImagePath}
                  alt=""
                  className="w-full h-full object-contain"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-steel-500 text-[10px] uppercase tracking-wide">Style</p>
                <p className="text-steel-100 text-xs truncate">{style.name}</p>
              </div>
              <button
                type="button"
                onClick={onChangeStyle}
                className="ml-auto text-pulse text-xs font-medium hover:underline cursor-pointer"
              >
                Change
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-md transition-colors text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !prompt.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-md transition-[filter] text-sm cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Generate
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Publish to KB dialog ------------------------------------------------------

export function PublishDialog({ isOpen, defaultGameId, published, onClose, onPublish }: {
  isOpen: boolean;
  defaultGameId: string;
  published: boolean;
  onClose: () => void;
  onPublish: (gameId: string) => Promise<void>;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [gameId, setGameId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    listGames()
      .then((list) => {
        setGames(list);
        setGameId(defaultGameId && list.some((g) => g._id === defaultGameId) ? defaultGameId : list[0]?._id ?? '');
      })
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [isOpen, defaultGameId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-pulse" />
            {published ? 'Update in knowledge base' : 'Publish to knowledge base'}
          </DialogTitle>
        </DialogHeader>

        <p className="text-steel-400 text-sm">
          The design becomes an entity in the game's knowledge base — quest generation can then cast it
          into stories as a grounded reference instead of inventing a lookalike.
        </p>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-pulse animate-spin" /></div>
        ) : games.length === 0 ? (
          <p className="text-steel-400 text-sm">No games yet — create one on the Games page first.</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {games.map((g) => (
              <button
                key={g._id}
                onClick={() => setGameId(g._id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors cursor-pointer ${
                  gameId === g._id ? 'bg-steel-800 text-steel-100 shadow-[inset_2px_0_0_0_#f5d90a]' : 'text-steel-200 hover:bg-steel-800/60'
                }`}
              >
                <BookOpen className={`w-4 h-4 shrink-0 ${gameId === g._id ? 'text-volt' : 'text-steel-400'}`} />
                <span className="truncate">{g.name}</span>
                <span className="ml-auto text-steel-500 text-xs">{g.documentCount ?? 0} docs</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-md transition-colors text-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={!gameId || submitting}
            onClick={async () => {
              setSubmitting(true);
              try { await onPublish(gameId); onClose(); } finally { setSubmitting(false); }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-md transition-[filter] text-sm cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {published ? 'Update entity' : 'Publish'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
