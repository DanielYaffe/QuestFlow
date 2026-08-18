import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Download, Gem, Loader2, Palette, Plus, Skull, Trash2, UploadCloud, Users } from 'lucide-react';
import { toast } from 'sonner';
import { CharacterKind, CharacterRecord, createCharacter, deleteCharacter, listCharacters } from '../../api/characterApi';
import { ItemRecord, createItem, deleteItem, listItems } from '../../api/itemApi';
import {
  AssetPackageInput,
  downloadAssetPackage,
  GenericAssetPackageStatus,
  listAssetPackageStatuses,
} from '../../api/assetPackageApi';
import { useProject } from '../../context/ProjectContext';
import { GroundedBadge } from '../../components/shared/GroundedBadge';
import { ConfirmModal } from '../../components/shared/ConfirmModal';
import { CHECKER_SM } from '../../utils/spriteStyles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';
import { downloadBlob, fileSlug } from '../../utils/download';
import { AssetSchemaSettingsCard } from '../Projects/components/AssetSchemaSettingsCard';
import { AssetPackageGithubDialog } from './AssetPackageGithubDialog';

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

function parseStudioTab(value: string | null): StudioTab | null {
  return value === 'monster' || value === 'npc' || value === 'item' ? value : null;
}

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
  exportStatus?: GenericAssetPackageStatus['exportStatus'];
  link: string;
}

function exportBadge(status?: GenericAssetPackageStatus['exportStatus']): { label: string; className: string } | null {
  if (status === 'changed') {
    return {
      label: 'Changed',
      className: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    };
  }
  return null;
}

function requestErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return fallback;
}

export function Studio() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject, activeProjectId } = useProject();

  const routeTab = parseStudioTab(searchParams.get('tab'));
  const tab = routeTab ?? 'monster';
  const [cards, setCards] = useState<DesignCard[]>([]);
  const [cardsTab, setCardsTab] = useState<StudioTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [genericExporting, setGenericExporting] = useState<{
    action: 'download' | 'push';
  } | null>(null);
  const [githubExportInput, setGithubExportInput] = useState<AssetPackageInput | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DesignCard[] | null>(null);
  const [deletingAssets, setDeletingAssets] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const loadSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const loadSeq = loadSeqRef.current + 1;
    loadSeqRef.current = loadSeq;
    if (!activeProjectId) {
      setCards([]);
      setCardsTab(tab);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const statuses: GenericAssetPackageStatus[] = await listAssetPackageStatuses(activeProjectId, { assetTypes: [tab] });
      const statusById = new Map(statuses.map((status) => [status.sourceRecordId, status]));
      let nextCards: DesignCard[];
      if (tab === 'item') {
        const items: ItemRecord[] = await listItems({ projectId: activeProjectId });
        nextCards = items.map((i) => ({
          id: i._id,
          name: i.name,
          subtitle: i.description || `${i.rarity} item`,
          previewUrl: i.previewUrl,
          kbRef: i.kbRef || undefined,
          exportStatus: statusById.get(i._id)?.exportStatus ?? 'exported',
          link: `/studio/items/${i._id}`,
        })).sort((a, b) => Number(b.exportStatus === 'changed') - Number(a.exportStatus === 'changed'));
      } else {
        const characters: CharacterRecord[] = await listCharacters({ projectId: activeProjectId, kind: tab });
        nextCards = characters.map((c) => ({
          id: c._id,
          name: c.name,
          subtitle: c.appearance || 'No appearance yet',
          previewUrl: c.previewUrl,
          kbRef: c.kbRef || undefined,
          exportStatus: statusById.get(c._id)?.exportStatus ?? 'exported',
          link: `/studio/${c._id}`,
        })).sort((a, b) => Number(b.exportStatus === 'changed') - Number(a.exportStatus === 'changed'));
      }
      if (loadSeqRef.current !== loadSeq) return;
      setCards(nextCards);
      setCardsTab(tab);
    } catch {
      if (loadSeqRef.current !== loadSeq) return;
      setCards([]);
      setCardsTab(tab);
      toast.error('Failed to load designs');
    } finally {
      if (loadSeqRef.current === loadSeq) setLoading(false);
    }
  }, [activeProjectId, tab]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setSelectedIds(new Set()); }, [activeProjectId, tab]);

  const meta = TAB_META[tab];
  const TabIcon = meta.icon;
  const visibleCards = cardsTab === tab ? cards : [];
  const visibleLoading = loading || cardsTab !== tab;
  const selectedCount = selectedIds.size;
  const changedCount = visibleCards.filter((card) => card.exportStatus === 'changed').length;
  const allVisibleSelected = visibleCards.length > 0 && visibleCards.every((card) => selectedIds.has(card.id));

  const inputForIds = (ids: string[]): AssetPackageInput => {
    if (ids.length === 0) return { mode: 'changed-only', assetTypes: [tab] };
    return tab === 'item'
      ? { mode: 'changed-only', assetTypes: ['item'], itemIds: ids }
      : { mode: 'changed-only', assetTypes: [tab], characterIds: ids };
  };

  const targetIdsForCard = (cardId: string): string[] =>
    selectedIds.has(cardId) ? Array.from(selectedIds) : [cardId];

  const targetCardsForCard = (cardId: string): DesignCard[] => {
    const ids = new Set(targetIdsForCard(cardId));
    return visibleCards.filter((card) => ids.has(card.id));
  };

  const toggleSelected = (cardId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleCards.map((card) => card.id)));
  };

  const selectChanged = () => {
    setSelectedIds(new Set(visibleCards.filter((card) => card.exportStatus === 'changed').map((card) => card.id)));
  };

  const handleTabChange = (nextTab: StudioTab) => {
    if (nextTab === tab) return;
    setLoading(true);
    setCards([]);
    setCardsTab(null);
    setSelectedIds(new Set());
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const handleGenericDownload = async (ids: string[]) => {
    if (!activeProjectId || genericExporting) return;
    setGenericExporting({ action: 'download' });
    try {
      const blob = await downloadAssetPackage(activeProjectId, { ...inputForIds(ids), markExported: true });
      downloadBlob(blob, `${fileSlug(activeProject?.name, 'project')}-asset-package.zip`);
      toast.success('Asset package downloaded');
      void refresh();
    } catch (error) {
      toast.error(requestErrorMessage(error, 'Failed to download asset package'));
    } finally {
      setGenericExporting(null);
    }
  };

  const openGithubExportDialog = (ids: string[]) => {
    if (!activeProjectId) {
      toast.error('Choose a project before exporting assets.');
      return;
    }
    setGithubExportInput(inputForIds(ids));
  };

  const handleDeleteAssets = async () => {
    if (!pendingDelete || deletingAssets) return;
    setDeletingAssets(true);
    try {
      const ids = pendingDelete.map((card) => card.id);
      if (tab === 'item') {
        await Promise.all(ids.map((id) => deleteItem(id)));
      } else {
        await Promise.all(ids.map((id) => deleteCharacter(id)));
      }
      toast.success(`${pendingDelete.length} asset${pendingDelete.length === 1 ? '' : 's'} deleted`);
      setSelectedIds(new Set());
      setPendingDelete(null);
      await refresh();
    } catch (error) {
      toast.error(requestErrorMessage(error, 'Failed to delete asset'));
    } finally {
      setDeletingAssets(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <NewDesignDialog tab={tab} isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <AssetPackageGithubDialog
        isOpen={Boolean(githubExportInput)}
        input={githubExportInput}
        onClose={() => setGithubExportInput(null)}
        onPushed={refresh}
      />
      <ConfirmModal
        isOpen={Boolean(pendingDelete)}
        title={pendingDelete && pendingDelete.length > 1 ? 'Delete assets?' : 'Delete asset?'}
        message={
          pendingDelete && pendingDelete.length > 1
            ? `Are you sure you want to delete ${pendingDelete.length} assets? This cannot be undone.`
            : `Are you sure you want to delete "${pendingDelete?.[0]?.name ?? 'this asset'}"? This cannot be undone.`
        }
        confirmLabel={deletingAssets ? 'Deleting...' : 'Delete'}
        danger
        onConfirm={() => void handleDeleteAssets()}
        onCancel={() => {
          if (!deletingAssets) setPendingDelete(null);
        }}
      />

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

        <AssetSchemaSettingsCard project={activeProject} />

        <section className="bg-steel-850 border border-steel-700 rounded-md p-4 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-steel-100 text-sm font-semibold">Project asset package</h2>
              <p className="text-steel-400 text-xs mt-1">
                Right-click an asset card to export it to GitHub or download a package. Ctrl-click cards to select several assets first.
              </p>
            </div>
            <div className="sm:ml-auto flex flex-wrap gap-2">
              {genericExporting && (
                <span className="inline-flex items-center gap-2 px-3 py-2 text-xs text-steel-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-pulse" />
                  {genericExporting.action === 'push' ? 'Exporting...' : 'Downloading...'}
                </span>
              )}
              <span className="px-3 py-2 text-xs text-steel-400">
                {selectedCount} selected · {changedCount} changed
              </span>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-steel-900 border border-steel-700 rounded-md p-1">
            {(Object.keys(TAB_META) as StudioTab[]).map((id) => {
              const Icon = TAB_META[id].icon;
              return (
                <button
                  key={id}
                  onClick={() => handleTabChange(id)}
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllVisible}
              disabled={visibleCards.length === 0}
              className="px-3 py-1.5 bg-steel-850 hover:bg-steel-800 border border-steel-700 disabled:opacity-50 text-steel-200 text-xs rounded-md transition-colors cursor-pointer"
            >
              {allVisibleSelected ? 'Clear all' : 'Select all'}
            </button>
            <button
              type="button"
              onClick={selectChanged}
              disabled={changedCount === 0}
              className="px-3 py-1.5 bg-steel-850 hover:bg-steel-800 border border-steel-700 disabled:opacity-50 text-steel-200 text-xs rounded-md transition-colors cursor-pointer"
            >
              Select changed
            </button>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 bg-steel-850 hover:bg-steel-800 border border-steel-700 text-steel-200 text-xs rounded-md transition-colors cursor-pointer"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>

        {visibleLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-pulse animate-spin" />
          </div>
        ) : visibleCards.length === 0 ? (
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
            {visibleCards.map((c) => (
              (() => {
                const badge = exportBadge(c.exportStatus);
                const isSelected = selectedIds.has(c.id);
                const targetCount = isSelected ? selectedCount : 1;
                return (
                  <ContextMenu key={c.id}>
                    <ContextMenuTrigger asChild>
                      <button
                        onClick={(event) => {
                          if (event.ctrlKey || event.metaKey) {
                            event.preventDefault();
                            toggleSelected(c.id);
                            return;
                          }
                          navigate(c.link);
                        }}
                        onContextMenu={() => {
                          if (!selectedIds.has(c.id)) setSelectedIds(new Set([c.id]));
                        }}
                        className={`group relative text-left bg-steel-850 border rounded-md overflow-hidden transition-colors cursor-pointer ${
                          isSelected ? 'border-pulse ring-1 ring-pulse/40' : 'border-steel-700 hover:border-steel-500'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute left-2 top-2 z-10 w-6 h-6 rounded bg-pulse text-steel-950 flex items-center justify-center shadow">
                            <Check className="w-4 h-4" />
                          </span>
                        )}
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
                            {badge && (
                              <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${badge.className}`}>
                                {badge.label}
                              </span>
                            )}
                            {c.kbRef && <GroundedBadge entityName={c.kbRef} compact />}
                          </div>
                          <p className="text-steel-400 text-xs truncate mt-0.5">{c.subtitle}</p>
                        </div>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="bg-steel-800 border-steel-600 text-steel-100">
                      <ContextMenuItem
                        onSelect={() => openGithubExportDialog(targetIdsForCard(c.id))}
                        disabled={!activeProjectId || genericExporting !== null}
                        className="gap-2 cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4 text-pulse" />
                        Export to GitHub
                      </ContextMenuItem>
                      <ContextMenuItem
                        onSelect={() => void handleGenericDownload(targetIdsForCard(c.id))}
                        disabled={!activeProjectId || genericExporting !== null}
                        className="gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-pulse" />
                        Download package
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-steel-700" />
                      <ContextMenuItem
                        onSelect={() => setPendingDelete(targetCardsForCard(c.id))}
                        disabled={deletingAssets}
                        className="gap-2 cursor-pointer text-red-200 focus:text-red-100 focus:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4 text-red-300" />
                        Delete
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-steel-700" />
                      <ContextMenuItem disabled className="text-steel-400">
                        {targetCount} asset{targetCount === 1 ? '' : 's'} selected
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })()
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
