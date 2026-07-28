import React, { useEffect, useState } from 'react';
import { BookOpen, Loader2, Sparkles, Upload } from 'lucide-react';
import { getSprites, getStyles, SpriteRecord, SpriteStyle } from '../../api/spriteApi';
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
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-2xl w-full">
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
          <div className="grid grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
            {sprites.map((sprite) => (
              <button
                key={sprite._id}
                disabled={picking !== null}
                onClick={async () => {
                  setPicking(sprite._id);
                  try { await onPick(sprite); onClose(); } finally { setPicking(null); }
                }}
                className="relative aspect-square rounded-md border border-steel-700 hover:border-volt overflow-hidden transition-colors cursor-pointer disabled:opacity-60"
                style={CHECKER_SM}
                title={sprite.userPrompt}
              >
                <img src={sprite.imageUrl} alt={sprite.userPrompt} loading="lazy" className="w-full h-full object-contain p-1" />
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

// --- Generate sprite (ComfyUI pipeline, auto-attached on completion) -----------

export function GenerateSpriteDialog({ isOpen, initialPrompt, onClose, onSubmit }: {
  isOpen: boolean;
  initialPrompt: string;
  onClose: () => void;
  onSubmit: (prompt: string, styleId: string) => Promise<void>;
}) {
  const [styles, setStyles] = useState<SpriteStyle[]>([]);
  const [styleId, setStyleId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPrompt(initialPrompt);
    getStyles()
      .then((list) => {
        setStyles(list);
        setStyleId((current) => current || list[0]?.id || '');
      })
      .catch(() => setStyles([]));
  }, [isOpen, initialPrompt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(prompt.trim(), styleId);
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
          {styles.length > 0 && (
            <div>
              <label className="block text-steel-400 text-sm mb-1">Style</label>
              <select
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 focus:outline-none focus:border-pulse text-sm"
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
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
