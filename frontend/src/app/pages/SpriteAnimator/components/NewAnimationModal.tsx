import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { getSprites, SpriteRecord } from '../../../api/spriteApi';
import { CHECKER_SM } from '../../../utils/spriteStyles';

const FRAME_COUNTS = [4, 6, 8, 10, 12, 14, 16];

export interface NewAnimationInput {
  name: string;
  action: string;
  frameCount: number;
  spriteId?: string;
  sourceImageKey?: string;
  characterId?: string;
}

interface NewAnimationModalProps {
  isOpen: boolean;
  /** Preselect a sprite by id (deep link from the generator). */
  initialSpriteId?: string;
  /** Pre-linked character source (deep link from the studio). */
  characterId?: string;
  characterSourceKey?: string;
  onClose: () => void;
  onSubmit: (input: NewAnimationInput) => Promise<void>;
}

export function NewAnimationModal({
  isOpen, initialSpriteId, characterId, characterSourceKey, onClose, onSubmit,
}: NewAnimationModalProps) {
  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const [loadingSprites, setLoadingSprites] = useState(false);
  const [selectedSprite, setSelectedSprite] = useState<SpriteRecord | null>(null);
  const [name, setName] = useState('');
  const [action, setAction] = useState('');
  const [frameCount, setFrameCount] = useState(8);
  const [submitting, setSubmitting] = useState(false);

  const characterMode = Boolean(characterId && characterSourceKey);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setAction('');
    setFrameCount(8);
    setSelectedSprite(null);
    if (characterMode) return;

    setLoadingSprites(true);
    getSprites()
      .then((list) => {
        setSprites(list);
        if (initialSpriteId) {
          setSelectedSprite(list.find((s) => s._id === initialSpriteId) ?? null);
        }
      })
      .catch(() => setSprites([]))
      .finally(() => setLoadingSprites(false));
  }, [isOpen, initialSpriteId, characterMode]);

  const canSubmit = action.trim().length > 0 && (characterMode || selectedSprite !== null) && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim() || action.trim(),
        action: action.trim(),
        frameCount,
        ...(characterMode
          ? { characterId, sourceImageKey: characterSourceKey }
          : { spriteId: selectedSprite?._id }),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-pulse" />
            New Animation
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {characterMode ? (
            <div className="flex items-center gap-2.5 bg-steel-800 border border-steel-600 rounded-md px-3 py-2.5">
              <User className="w-4 h-4 text-pulse shrink-0" />
              <span className="text-steel-200 text-sm">Animating this character's sprite</span>
            </div>
          ) : (
            <div>
              <label className="block text-steel-400 text-sm mb-1.5">Source sprite</label>
              {loadingSprites ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 text-pulse animate-spin" />
                </div>
              ) : sprites.length === 0 ? (
                <p className="text-steel-400 text-sm py-4">
                  No sprites yet — generate one in the Sprite Generator first.
                </p>
              ) : (
                <div className="grid grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1">
                  {sprites.map((sprite) => (
                    <button
                      key={sprite._id}
                      type="button"
                      onClick={() => setSelectedSprite(sprite)}
                      className={`aspect-square rounded-md border overflow-hidden transition-colors cursor-pointer ${
                        selectedSprite?._id === sprite._id
                          ? 'border-volt'
                          : 'border-steel-700 hover:border-steel-500'
                      }`}
                      style={CHECKER_SM}
                      title={sprite.userPrompt}
                    >
                      <img src={sprite.imageUrl} alt={sprite.userPrompt} loading="lazy" className="w-full h-full object-contain p-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-steel-400 text-sm mb-1.5">Action</label>
            <input
              type="text"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder='e.g. "walk cycle", "swing sword", "idle breathing"'
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-steel-400 text-sm mb-1.5">Name <span className="text-steel-500">(optional)</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Defaults to the action"
                className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
              />
            </div>
            <div>
              <label className="block text-steel-400 text-sm mb-1.5">Frames</label>
              <div className="flex gap-1 bg-steel-800 border border-steel-600 rounded-md p-1">
                {FRAME_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFrameCount(n)}
                    className={`flex-1 py-1 rounded text-xs tabular-nums transition-colors cursor-pointer ${
                      frameCount === n ? 'bg-volt text-steel-950 font-semibold' : 'text-steel-400 hover:text-steel-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
              disabled={!canSubmit}
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
