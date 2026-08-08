import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Download, Gem, Loader2, Maximize2, Sparkles, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ItemRarity,
  ItemRecord,
  attachSpriteToItem,
  deleteItem,
  getItem,
  publishItemToKb,
  selectItemSpriteVersion,
  transformItemSprite,
  updateItem,
} from '../../api/itemApi';
import { SpriteTool } from '../../api/characterApi';
import { generateSprite, SpriteRecord } from '../../api/spriteApi';
import { useProject } from '../../context/ProjectContext';
import { useSpriteJobs } from '../../context/SpriteJobContext';
import { resolveStyle, useSpriteStyles } from '../../hooks/useSpriteStyles';
import { GroundedBadge } from '../../components/shared/GroundedBadge';
import { ConfirmModal } from '../../components/shared/ConfirmModal';
import { downloadUrl, fileSlug } from '../../utils/download';
import { SpriteToolsPanel } from './SpriteToolsPanel';
import { resolveHistoryIndex, useUndoShortcut } from './useSpriteHistory';
import {
  GenerateSpriteDialog,
  PublishDialog,
  SpritePickerDialog,
  StylePickerDialog,
} from './StudioDialogs';

// ---------------------------------------------------------------------------
// Item design sheet — sprite + identity + publish-to-KB for a studio Item.
// Slimmer sibling of the character DesignSheet (no rotations/animations/stats).
// ---------------------------------------------------------------------------

const RARITIES: { id: ItemRarity; label: string; chip: string }[] = [
  { id: 'common', label: 'Common', chip: 'bg-steel-800 text-steel-300 border-steel-600' },
  { id: 'rare',   label: 'Rare',   chip: 'bg-steel-800 text-pulse border-pulse/40' },
  { id: 'epic',   label: 'Epic',   chip: 'bg-steel-800 text-volt border-volt/40' },
];

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return fallback;
}

function Section({ title, icon: Icon, children, action }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="bg-steel-850 border border-steel-700 rounded-md">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-steel-700">
        <Icon className="w-4 h-4 text-pulse" />
        <h2 className="text-steel-100 text-sm font-semibold">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ItemSheet() {
  const { itemId = '' } = useParams();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const { registerJob } = useSpriteJobs();

  const [item, setItem] = useState<ItemRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Identity form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rarity, setRarity] = useState<ItemRarity>('common');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Tools
  const [toolBusy, setToolBusy] = useState<SpriteTool | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [spriteGenBusy, setSpriteGenBusy] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const { styles } = useSpriteStyles();

  // Publish responses omit the presigned version history — keep what we have so
  // the history strip survives.
  const applyItem = useCallback((i: ItemRecord) => {
    setItem((prev) => ({ ...i, candidateUrls: i.candidateUrls ?? prev?.candidateUrls }));
    setName(i.name);
    setDescription(i.description);
    setRarity(i.rarity);
    setTags(i.tags.join(', '));
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyItem(await getItem(itemId));
    } catch {
      toast.error('Failed to load item');
      navigate('/studio');
    } finally {
      setLoading(false);
    }
  }, [itemId, applyItem, navigate]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  // --- Sprite version history ------------------------------------------------
  const historyUrls = item?.candidateUrls ?? [];
  const historyIndex = item ? resolveHistoryIndex(item.assets, historyUrls.length) : -1;

  const goToVersion = useCallback(async (index: number) => {
    if (!item || index < 0 || index >= (item.candidateUrls?.length ?? 0)) return;
    setHistoryBusy(true);
    try {
      applyItem(await selectItemSpriteVersion(item._id, index));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to switch sprite version'));
    } finally {
      setHistoryBusy(false);
    }
  }, [item, applyItem]);

  useUndoShortcut(historyIndex, goToVersion);

  if (loading || !item) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <Loader2 className="w-6 h-6 text-pulse animate-spin" />
      </div>
    );
  }

  const style = resolveStyle(styles, item.spriteStyleId);
  const spriteKey = item.assets.snappedSpriteS3Key
    || item.assets.rawSpriteCandidates[item.assets.rawSpriteCandidates.length - 1]
    || '';

  const handlePickSprite = async (sprite: SpriteRecord) => {
    if (!sprite.imageKey) { toast.error('This sprite has no stored image key'); return; }
    try {
      applyItem(await attachSpriteToItem(item._id, sprite.imageKey));
      toast.success('Sprite attached');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to attach sprite'));
    }
  };

  const handleTool = async (tool: SpriteTool, targetSize: number) => {
    setToolBusy(tool);
    try {
      applyItem(await transformItemSprite(item._id, tool, tool === 'remove-bg' ? undefined : targetSize));
      toast.success(
        tool === 'resize' ? `Resized to ${targetSize}px`
          : tool === 'remove-bg' ? 'Background removed'
            : `Pixel-snapped to ${targetSize}px`,
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Tool failed'));
    } finally {
      setToolBusy(null);
    }
  };

  const handleSelectStyle = async (styleId: string) => {
    if (styleId === item.spriteStyleId) return;
    try {
      applyItem(await updateItem(item._id, { spriteStyleId: styleId }));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save style'));
    }
  };

  const handleGenerateSprite = async (prompt: string) => {
    try {
      const { jobId } = await generateSprite(prompt, style?.id ?? '');
      setSpriteGenBusy(true);
      registerJob(jobId, {
        label: `${item.name} sprite`,
        action: { type: 'studio-item-sprite', itemId: item._id },
        onDone: () => { void refresh(); setSpriteGenBusy(false); },
        onError: () => setSpriteGenBusy(false),
      });
      toast.success('Generating sprite — it will attach here when ready');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to start sprite generation'));
      throw err;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      applyItem(await updateItem(item._id, {
        name,
        description,
        rarity,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }));
      toast.success('Saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (gameId: string) => {
    try {
      applyItem(await publishItemToKb(item._id, gameId));
      toast.success(`${item.name} published — indexing into the knowledge base`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to publish'));
      throw err;
    }
  };

  const handleDelete = async () => {
    setPendingDelete(false);
    try {
      await deleteItem(item._id);
      toast.success('Item deleted');
      navigate('/studio');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete'));
    }
  };

  const handleDownload = async () => {
    if (!item.previewUrl) return;
    try {
      await downloadUrl(item.previewUrl, `${fileSlug(item.name, 'item')}.png`);
    } catch {
      toast.error('Download failed');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <SpritePickerDialog isOpen={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePickSprite} />
      <GenerateSpriteDialog
        isOpen={generateOpen}
        initialPrompt={item.description || item.name}
        style={style}
        onClose={() => setGenerateOpen(false)}
        onChangeStyle={() => { setGenerateOpen(false); setStyleOpen(true); }}
        onSubmit={handleGenerateSprite}
      />
      <StylePickerDialog
        isOpen={styleOpen}
        styles={styles}
        selectedId={style?.id ?? ''}
        onClose={() => setStyleOpen(false)}
        onSelect={(id) => void handleSelectStyle(id)}
      />
      <PublishDialog
        isOpen={publishOpen}
        defaultGameId={activeProject?.gameId ?? ''}
        published={Boolean(item.kbDocId)}
        onClose={() => setPublishOpen(false)}
        onPublish={handlePublish}
      />
      <ConfirmModal
        isOpen={pendingDelete}
        title="Delete item?"
        message={`"${item.name}" will be permanently deleted and removed from every questline that references it. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(false)}
      />

      <main className="max-w-4xl mx-auto px-8 py-8 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/studio')}
            className="w-8 h-8 flex items-center justify-center bg-steel-850 hover:bg-steel-800 border border-steel-700 text-steel-400 hover:text-steel-100 rounded-md transition-colors cursor-pointer"
            title="Back to studio"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-md bg-steel-800 flex items-center justify-center">
            <Gem className="w-5 h-5 text-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-steel-100 font-semibold text-lg leading-none truncate">{item.name}</h1>
              {item.kbRef && <GroundedBadge entityName={item.kbRef} />}
            </div>
            <p className="text-steel-400 text-xs mt-1 capitalize">{item.rarity} item design</p>
          </div>
          <button
            onClick={() => navigate(`/studio/items/${item._id}/sprites`)}
            disabled={!item.previewUrl}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-steel-850 hover:bg-steel-800 border border-steel-700 disabled:opacity-50 text-steel-100 text-sm rounded-md transition-colors cursor-pointer"
            title="View and download the sprite full-size"
          >
            <Maximize2 className="w-4 h-4 text-pulse" />
            View sprite
          </button>
          <button
            onClick={() => setPendingDelete(true)}
            className="w-8 h-8 flex items-center justify-center bg-steel-850 hover:bg-steel-800 border border-steel-700 text-steel-400 hover:text-red-400 rounded-md transition-colors cursor-pointer"
            title="Delete item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPublishOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            {item.kbDocId ? 'Update in KB' : 'Publish to KB'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Sprite + tools */}
          <Section
            title="Sprite"
            icon={Sparkles}
            action={
              <button
                onClick={() => setPickerOpen(true)}
                className="text-pulse text-xs font-medium hover:underline cursor-pointer"
              >
                Choose from sprites →
              </button>
            }
          >
            <SpriteToolsPanel
              name={item.name}
              previewUrl={item.previewUrl}
              pixelated
              onOpenPreview={() => navigate(`/studio/items/${item._id}/sprites`)}
              style={style}
              onChangeStyle={() => setStyleOpen(true)}
              generating={spriteGenBusy}
              onGenerate={() => setGenerateOpen(true)}
              hasSprite={Boolean(spriteKey)}
              toolBusy={toolBusy}
              onTool={(tool, targetSize) => void handleTool(tool, targetSize)}
              history={{ urls: historyUrls, index: historyIndex }}
              historyBusy={historyBusy}
              onSelectVersion={(index) => void goToVersion(index)}
              extraActions={
                <button
                  disabled={!item.previewUrl}
                  onClick={() => void handleDownload()}
                  className="flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-pulse" />
                  Download PNG
                </button>
              }
            />
          </Section>

          {/* Identity */}
          <Section
            title="Identity"
            icon={Gem}
            action={
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
            }
          >
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-steel-400 text-xs mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                />
              </div>
              <div>
                <label className="block text-steel-400 text-xs mb-1">Description <span className="text-steel-500">(used as the sprite subject)</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 text-sm resize-none focus:outline-none focus:border-pulse"
                />
              </div>
              <div>
                <label className="block text-steel-400 text-xs mb-1">Rarity</label>
                <div className="flex gap-1.5">
                  {RARITIES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRarity(r.id)}
                      className={`px-3 py-1.5 rounded-md border text-xs transition-colors cursor-pointer ${
                        rarity === r.id ? r.chip : 'bg-steel-800/50 text-steel-500 border-steel-700 hover:text-steel-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-steel-400 text-xs mb-1">Tags <span className="text-steel-500">(comma-separated)</span></label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                />
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
