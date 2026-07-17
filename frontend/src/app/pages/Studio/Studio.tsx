import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gem, Loader2, Palette, Plus, Skull, Users } from 'lucide-react';
import { toast } from 'sonner';
import { CharacterKind, CharacterRecord, createCharacter, listCharacters } from '../../api/characterApi';
import { ItemRecord, createItem, listItems } from '../../api/itemApi';
import { useProject } from '../../context/ProjectContext';
import { GroundedBadge } from '../../components/shared/GroundedBadge';
import { CHECKER_SM } from '../../utils/spriteStyles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

// ---------------------------------------------------------------------------
// Design studio — the visual identity workshop. Mobs and characters come from
// the unified Character collection; items are the dedicated Item collection.
// Cards open the matching design sheet.
// ---------------------------------------------------------------------------

type StudioTab = CharacterKind | 'item';

const TAB_META: Record<StudioTab, { label: string; singular: string; icon: React.ElementType }> = {
  monster: { label: 'Mobs',       singular: 'Mob',       icon: Skull },
  npc:     { label: 'Characters', singular: 'Character', icon: Users },
  item:    { label: 'Items',      singular: 'Item',      icon: Gem },
};

function NewDesignDialog({ tab, isOpen, onClose }: {
  tab: StudioTab;
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { activeProjectId } = useProject();
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const meta = TAB_META[tab];
  const Icon = meta.icon;

  useEffect(() => {
    if (isOpen) { setName(''); setDetail(''); }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (tab === 'item') {
        const created = await createItem({
          name: name.trim(),
          projectId: activeProjectId ?? undefined,
          description: detail.trim(),
        });
        toast.success('Item created');
        navigate(`/studio/items/${created._id}`);
      } else {
        const created = await createCharacter({
          name: name.trim(),
          kind: tab,
          projectId: activeProjectId ?? undefined,
          appearance: detail.trim(),
        });
        toast.success(`${meta.singular} created`);
        navigate(`/studio/${created._id}`);
      }
    } catch {
      toast.error('Failed to create design');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-steel-850 border-steel-700 text-steel-100 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-steel-100 text-lg flex items-center gap-2">
            <Icon className="w-5 h-5 text-pulse" />
            New {meta.singular}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-steel-400 text-sm mb-1">Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tab === 'monster' ? 'e.g. Ember Drake' : tab === 'npc' ? 'e.g. Elder Maren' : 'e.g. Frostbite Dagger'}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm"
            />
          </div>
          <div>
            <label className="block text-steel-400 text-sm mb-1">
              {tab === 'item' ? 'Description' : 'Appearance'} <span className="text-steel-500">(optional)</span>
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Visually concrete — used as the sprite subject"
              rows={3}
              className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:border-pulse text-sm resize-none"
            />
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
              disabled={submitting || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-md transition-[filter] text-sm cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create & open
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DesignCard {
  id: string;
  name: string;
  subtitle: string;
  previewUrl?: string;
  kbRef?: string;
  link: string;
}

export function Studio() {
  const navigate = useNavigate();
  const { activeProjectId } = useProject();

  const [tab, setTab] = useState<StudioTab>('monster');
  const [cards, setCards] = useState<DesignCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      if (tab === 'item') {
        const items: ItemRecord[] = await listItems({ projectId: activeProjectId });
        setCards(items.map((i) => ({
          id: i._id,
          name: i.name,
          subtitle: i.description || `${i.rarity} item`,
          previewUrl: i.previewUrl,
          kbRef: i.kbRef || undefined,
          link: `/studio/items/${i._id}`,
        })));
      } else {
        const characters: CharacterRecord[] = await listCharacters({ projectId: activeProjectId, kind: tab });
        setCards(characters.map((c) => ({
          id: c._id,
          name: c.name,
          subtitle: c.appearance || 'No appearance yet',
          previewUrl: c.previewUrl,
          kbRef: c.kbRef || undefined,
          link: `/studio/${c._id}`,
        })));
      }
    } catch {
      toast.error('Failed to load designs');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, tab]);

  useEffect(() => { void refresh(); }, [refresh]);

  const meta = TAB_META[tab];
  const TabIcon = meta.icon;

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <NewDesignDialog tab={tab} isOpen={createOpen} onClose={() => setCreateOpen(false)} />

      <main className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-steel-800 flex items-center justify-center">
            <Palette className="w-5 h-5 text-pulse" />
          </div>
          <div>
            <h1 className="text-steel-100 font-semibold text-lg leading-none">Design Studio</h1>
            <p className="text-steel-400 text-xs mt-0.5">
              Mobs, characters, and items: sprites, rotations, animations — publish to your game's KB to ground quests
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New {meta.singular}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-steel-900 border border-steel-700 rounded-md p-1 self-start">
          {(Object.keys(TAB_META) as StudioTab[]).map((id) => {
            const Icon = TAB_META[id].icon;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm transition-colors cursor-pointer ${
                  tab === id ? 'bg-volt text-steel-950 font-semibold' : 'text-steel-400 hover:text-steel-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {TAB_META[id].label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-pulse animate-spin" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-md bg-steel-850 border border-steel-700 flex items-center justify-center mb-4">
              <TabIcon className="w-7 h-7 text-steel-500" />
            </div>
            <h2 className="text-steel-100 font-medium mb-1">No {meta.label.toLowerCase()} yet</h2>
            <p className="text-steel-400 text-sm max-w-sm mb-5">
              Create one here, or promote a sprite from the Sprite Generator. Designs published to a game's
              knowledge base get cast into generated quests.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New {meta.singular}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {cards.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(c.link)}
                className="group text-left bg-steel-850 border border-steel-700 rounded-md overflow-hidden hover:border-steel-500 transition-colors cursor-pointer"
              >
                <div className="aspect-square flex items-center justify-center p-3" style={CHECKER_SM}>
                  {c.previewUrl ? (
                    <img src={c.previewUrl} alt={c.name} loading="lazy" className="w-full h-full object-contain" />
                  ) : (
                    <TabIcon className="w-10 h-10 text-steel-600" />
                  )}
                </div>
                <div className="px-3 py-2.5 border-t border-steel-700">
                  <div className="flex items-center gap-1.5">
                    <p className="text-steel-100 text-sm font-medium truncate group-hover:text-pulse transition-colors">
                      {c.name}
                    </p>
                    {c.kbRef && <GroundedBadge entityName={c.kbRef} compact />}
                  </div>
                  <p className="text-steel-400 text-xs truncate mt-0.5">{c.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
