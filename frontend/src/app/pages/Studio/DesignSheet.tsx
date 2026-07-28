import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Compass, Film, Loader2, Maximize2, Plus, Scissors, Skull,
  SlidersHorizontal, Sparkles, Users, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CharacterRecord,
  CharacterSpeciesData,
  ROTATION_DIRECTIONS,
  SpriteTool,
  generateRotations,
  getCharacter,
  publishCharacterToKb,
  transformCharacterSprite,
  updateCharacter,
} from '../../api/characterApi';
import { AnimationSummary, listAnimations } from '../../api/animationApi';
import { generateSprite, SpriteRecord } from '../../api/spriteApi';
import { useProject } from '../../context/ProjectContext';
import { useSpriteJobs } from '../../context/SpriteJobContext';
import { GroundedBadge } from '../../components/shared/GroundedBadge';
import { CHECKER_SM, CHECKER_STYLE } from '../../utils/spriteStyles';
import { GenerateSpriteDialog, PublishDialog, SpritePickerDialog } from './StudioDialogs';

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return fallback;
}

// 3×3 compass layout: rotations around the character preview in the middle.
const COMPASS_GRID: (typeof ROTATION_DIRECTIONS[number] | 'center')[] = [
  'north-west', 'north', 'north-east',
  'west', 'center', 'east',
  'south-west', 'south', 'south-east',
];

// --- Section shell ----------------------------------------------------------------

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

// --- Main page ---------------------------------------------------------------------

export function DesignSheet() {
  const { characterId = '' } = useParams();
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const { registerJob, registerAnimationJob } = useSpriteJobs();

  const [character, setCharacter] = useState<CharacterRecord | null>(null);
  const [animations, setAnimations] = useState<AnimationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Identity form
  const [appearance, setAppearance] = useState('');
  const [lore, setLore] = useState('');
  const [tags, setTags] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);

  // Stats form (mobs)
  const [species, setSpecies] = useState<CharacterSpeciesData | null>(null);
  const [savingStats, setSavingStats] = useState(false);

  // Tools
  const [toolBusy, setToolBusy] = useState<SpriteTool | null>(null);
  const [resizeTarget, setResizeTarget] = useState(64);
  const [rotationsBusy, setRotationsBusy] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [spriteGenBusy, setSpriteGenBusy] = useState(false);

  const applyCharacter = useCallback((c: CharacterRecord) => {
    setCharacter(c);
    setAppearance(c.appearance);
    setLore(c.lore);
    setTags(c.tags.join(', '));
    setSpecies(c.speciesData);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyCharacter(await getCharacter(characterId));
      setAnimations(await listAnimations({ characterId }));
    } catch {
      toast.error('Failed to load design');
      navigate('/studio');
    } finally {
      setLoading(false);
    }
  }, [characterId, applyCharacter, navigate]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  if (loading || !character) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <Loader2 className="w-6 h-6 text-pulse animate-spin" />
      </div>
    );
  }

  const isMob = character.kind === 'monster';
  const spriteKey = character.assets.snappedSpriteS3Key
    || character.assets.rawSpriteCandidates[character.assets.rawSpriteCandidates.length - 1]
    || '';
  const hasRotations = Object.values(character.rotationUrls ?? {}).some(Boolean);

  const handlePickSprite = async (sprite: SpriteRecord) => {
    if (!sprite.imageKey) { toast.error('This sprite has no stored image key'); return; }
    try {
      const candidates = [...character.assets.rawSpriteCandidates, sprite.imageKey].slice(-20);
      const fresh = await updateCharacter(character._id, {
        assets: { ...character.assets, snappedSpriteS3Key: sprite.imageKey, rawSpriteCandidates: candidates },
      });
      applyCharacter({ ...fresh, rotationUrls: character.rotationUrls });
      toast.success('Sprite attached');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to attach sprite'));
    }
  };

  const handleTool = async (tool: SpriteTool) => {
    setToolBusy(tool);
    try {
      applyCharacter(await transformCharacterSprite(character._id, tool, tool === 'remove-bg' ? undefined : resizeTarget));
      toast.success(
        tool === 'resize' ? `Resized to ${resizeTarget}px`
          : tool === 'remove-bg' ? 'Background removed'
            : `Pixel-snapped to ${resizeTarget}px`,
      );
    } catch (err) {
      toast.error(errorMessage(err, 'Tool failed'));
    } finally {
      setToolBusy(null);
    }
  };

  const handleGenerateSprite = async (prompt: string, styleId: string) => {
    try {
      const { jobId } = await generateSprite(prompt, styleId);
      setSpriteGenBusy(true);
      registerJob(jobId, {
        label: `${character.name} sprite`,
        // The attach itself happens in the job context (survives reloads);
        // here we just refresh the sheet once it lands.
        action: { type: 'studio-sprite', characterId: character._id },
        onDone: () => { void refresh(); setSpriteGenBusy(false); },
        onError: () => setSpriteGenBusy(false),
      });
      toast.success('Generating sprite — it will attach here when ready');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to start sprite generation'));
      throw err;
    }
  };

  const handleRotations = async () => {
    setRotationsBusy(true);
    try {
      const { jobId } = await generateRotations(character._id);
      registerAnimationJob(jobId, {
        label: `${character.name} — 8 rotations`,
        link: `/studio/${character._id}`,
        onDone: () => { void refresh(); setRotationsBusy(false); },
        onError: () => setRotationsBusy(false),
      });
      toast.success('Generating 8 rotations — this takes 30–180 seconds');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to start rotations'));
      setRotationsBusy(false);
    }
  };

  const handleSaveIdentity = async () => {
    setSavingIdentity(true);
    try {
      const fresh = await updateCharacter(character._id, {
        appearance,
        lore,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      applyCharacter({ ...fresh, rotationUrls: character.rotationUrls });
      toast.success('Saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save'));
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleSaveStats = async () => {
    if (!species) return;
    setSavingStats(true);
    try {
      const fresh = await updateCharacter(character._id, { speciesData: species } as Parameters<typeof updateCharacter>[1]);
      applyCharacter({ ...fresh, rotationUrls: character.rotationUrls });
      toast.success('Stats saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save stats'));
    } finally {
      setSavingStats(false);
    }
  };

  const handlePublish = async (gameId: string) => {
    try {
      const fresh = await publishCharacterToKb(character._id, gameId);
      applyCharacter({ ...fresh, rotationUrls: character.rotationUrls });
      toast.success(`${character.name} published — indexing into the knowledge base`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to publish'));
      throw err;
    }
  };

  const statField = (label: string, key: keyof CharacterSpeciesData) => (
    <div key={key}>
      <label className="block text-steel-400 text-[11px] mb-1">{label}</label>
      <input
        type="number"
        value={species ? Number(species[key]) || 0 : 0}
        onChange={(e) => species && setSpecies({ ...species, [key]: Number(e.target.value) })}
        className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-sm tabular-nums focus:outline-none focus:border-pulse"
      />
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-steel-950">
      <SpritePickerDialog isOpen={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePickSprite} />
      <GenerateSpriteDialog
        isOpen={generateOpen}
        initialPrompt={character.appearance || character.name}
        onClose={() => setGenerateOpen(false)}
        onSubmit={handleGenerateSprite}
      />
      <PublishDialog
        isOpen={publishOpen}
        defaultGameId={activeProject?.gameId ?? ''}
        published={Boolean(character.kbDocId)}
        onClose={() => setPublishOpen(false)}
        onPublish={handlePublish}
      />

      <main className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-5">
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
            {isMob ? <Skull className="w-5 h-5 text-pulse" /> : <Users className="w-5 h-5 text-pulse" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-steel-100 font-semibold text-lg leading-none truncate">{character.name}</h1>
              {character.kbRef && <GroundedBadge entityName={character.kbRef} />}
            </div>
            <p className="text-steel-400 text-xs mt-1">{isMob ? 'Mob design' : 'Character design'}</p>
          </div>
          <button
            onClick={() => navigate(`/studio/${character._id}/sprites`)}
            disabled={!spriteKey && !hasRotations}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-steel-850 hover:bg-steel-800 border border-steel-700 disabled:opacity-50 text-steel-100 text-sm rounded-md transition-colors cursor-pointer"
            title="View and download the sprite and rotations full-size"
          >
            <Maximize2 className="w-4 h-4 text-pulse" />
            View sprites
          </button>
          <button
            onClick={() => setPublishOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            {character.kbDocId ? 'Update in KB' : 'Publish to KB'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Left column */}
          <div className="flex flex-col gap-5">
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
              <div className="flex gap-4">
                <div className="relative w-40 h-40 shrink-0 rounded-md border border-steel-700 flex items-center justify-center" style={CHECKER_STYLE}>
                  {character.previewUrl ? (
                    <button
                      onClick={() => navigate(`/studio/${character._id}/sprites?sel=sprite`)}
                      className="w-full h-full flex items-center justify-center cursor-zoom-in"
                      title="View full-size"
                    >
                      <img src={character.previewUrl} alt={character.name} className="max-w-full max-h-full object-contain p-2" />
                    </button>
                  ) : (
                    <p className="text-steel-500 text-xs text-center px-3">No sprite yet — generate one or pick from your gallery</p>
                  )}
                  {spriteGenBusy && (
                    <div className="absolute inset-0 rounded-md bg-steel-950/70 flex flex-col items-center justify-center gap-1.5">
                      <Loader2 className="w-5 h-5 text-pulse animate-spin" />
                      <p className="text-steel-200 text-[11px]">Generating…</p>
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <button
                    disabled={spriteGenBusy}
                    onClick={() => setGenerateOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-xs font-semibold rounded-md transition-[filter] cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate sprite
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-steel-400 text-xs shrink-0">Target size</label>
                    <input
                      type="number"
                      min={8}
                      max={1024}
                      value={resizeTarget}
                      onChange={(e) => setResizeTarget(Number(e.target.value))}
                      className="w-20 bg-steel-800 border border-steel-600 rounded-md px-2 py-1 text-steel-100 text-xs tabular-nums focus:outline-none focus:border-pulse"
                    />
                    <span className="text-steel-500 text-xs">px</span>
                  </div>
                  {([
                    ['resize', 'Resize (pixel-perfect)', SlidersHorizontal],
                    ['remove-bg', 'Remove background', Scissors],
                    ['pixel-snap', 'Pixel snap', Wand2],
                  ] as const).map(([tool, label, Icon]) => (
                    <button
                      key={tool}
                      disabled={!spriteKey || toolBusy !== null}
                      onClick={() => void handleTool(tool)}
                      className="flex items-center gap-2 px-3 py-2 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
                    >
                      {toolBusy === tool ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5 text-pulse" />}
                      {label}
                    </button>
                  ))}
                  <p className="text-steel-500 text-[11px]">
                    Each tool writes a new version — the previous sprite stays in the candidate history.
                    Resize grows by whole multiples (padded to the exact size) and snaps to the pixel
                    grid when shrinking; all tools run locally, no generations spent.
                  </p>
                </div>
              </div>
            </Section>

            {/* Rotations */}
            <Section
              title="8-direction rotations"
              icon={Compass}
              action={
                <button
                  onClick={() => void handleRotations()}
                  disabled={!spriteKey || rotationsBusy}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-xs font-semibold rounded-md transition-[filter] cursor-pointer"
                >
                  {rotationsBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {hasRotations ? 'Regenerate' : 'Generate'}
                </button>
              }
            >
              {hasRotations || rotationsBusy ? (
                <div className="grid grid-cols-3 gap-2 max-w-xs">
                  {COMPASS_GRID.map((dir) => {
                    const url = dir === 'center' ? character.previewUrl : character.rotationUrls?.[dir];
                    const sel = dir === 'center' ? 'sprite' : dir;
                    return (
                      <button
                        key={dir}
                        disabled={!url}
                        onClick={() => navigate(`/studio/${character._id}/sprites?sel=${sel}`)}
                        className={`aspect-square rounded-md border flex items-center justify-center ${
                          dir === 'center' ? 'border-steel-600' : 'border-steel-700'
                        } ${url ? 'cursor-zoom-in hover:border-steel-500 transition-colors' : ''}`}
                        style={CHECKER_SM}
                        title={url ? 'View full-size' : dir === 'center' ? 'current sprite' : dir}
                      >
                        {url ? (
                          <img src={url} alt={dir === 'center' ? 'current sprite' : dir} className="w-full h-full object-contain p-1.5" />
                        ) : dir === 'center' ? null : rotationsBusy ? (
                          <Loader2 className="w-3.5 h-3.5 text-steel-500 animate-spin" />
                        ) : (
                          <span className="text-steel-600 text-[10px]">{dir}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-steel-400 text-xs">
                  Generate all 8 compass directions from the current sprite (PixelLab, 1 generation).
                </p>
              )}
            </Section>

            {/* Animations */}
            <Section
              title="Animations"
              icon={Film}
              action={
                <button
                  onClick={() => navigate(`/sprite-animator?characterId=${character._id}&sourceKey=${encodeURIComponent(spriteKey)}`)}
                  disabled={!spriteKey}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-xs font-semibold rounded-md transition-[filter] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New animation
                </button>
              }
            >
              {animations.length === 0 ? (
                <p className="text-steel-400 text-xs">
                  No animations yet — create a walk cycle, idle, or attack from this design's sprite.
                </p>
              ) : (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {animations.map((anim) => (
                    <button
                      key={anim._id}
                      onClick={() => navigate(`/sprite-animator?animationId=${anim._id}`)}
                      className="shrink-0 w-24 text-left group cursor-pointer"
                      title={anim.name}
                    >
                      <div className="w-24 h-24 rounded-md border border-steel-700 group-hover:border-steel-500 overflow-hidden transition-colors" style={CHECKER_SM}>
                        {anim.previewUrl && <img src={anim.previewUrl} alt="" className="w-full h-full object-contain p-1" />}
                      </div>
                      <p className="text-steel-200 text-[11px] truncate mt-1">{anim.name}</p>
                      <p className="text-steel-500 text-[10px]">
                        {anim.status === 'generating' ? 'generating…' : `${anim.frameCount} frames`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            {/* Identity */}
            <Section
              title="Identity"
              icon={isMob ? Skull : Users}
              action={
                <button
                  onClick={() => void handleSaveIdentity()}
                  disabled={savingIdentity}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
                >
                  {savingIdentity && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              }
            >
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-steel-400 text-xs mb-1">Appearance <span className="text-steel-500">(used as the sprite subject)</span></label>
                  <textarea
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    rows={2}
                    className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 text-sm resize-none focus:outline-none focus:border-pulse"
                  />
                </div>
                <div>
                  <label className="block text-steel-400 text-xs mb-1">Lore</label>
                  <textarea
                    value={lore}
                    onChange={(e) => setLore(e.target.value)}
                    rows={3}
                    className="w-full bg-steel-800 border border-steel-600 rounded-md px-3 py-2 text-steel-100 text-sm resize-none focus:outline-none focus:border-pulse"
                  />
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

            {/* Stats — mobs only */}
            {isMob && species && (
              <Section
                title="Stats"
                icon={SlidersHorizontal}
                action={
                  <button
                    onClick={() => void handleSaveStats()}
                    disabled={savingStats}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-steel-800 hover:bg-steel-700 border border-steel-600 disabled:opacity-50 text-steel-100 text-xs rounded-md transition-colors cursor-pointer"
                  >
                    {savingStats && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save
                  </button>
                }
              >
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-steel-400 text-[11px] mb-1">Type 1</label>
                      <input
                        type="text"
                        value={species.type1}
                        onChange={(e) => setSpecies({ ...species, type1: e.target.value })}
                        className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                      />
                    </div>
                    <div>
                      <label className="block text-steel-400 text-[11px] mb-1">Type 2</label>
                      <input
                        type="text"
                        value={species.type2}
                        onChange={(e) => setSpecies({ ...species, type2: e.target.value })}
                        className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2.5">
                    {statField('HP', 'base_hp')}
                    {statField('M.ATK', 'base_melee_attack')}
                    {statField('M.DEF', 'base_melee_defense')}
                    {statField('R.ATK', 'base_ranged_attack')}
                    {statField('R.DEF', 'base_ranged_defense')}
                    {statField('Speed', 'base_speed')}
                    {statField('AP', 'base_max_ap')}
                  </div>
                  <div>
                    <label className="block text-steel-400 text-[11px] mb-1">Moves <span className="text-steel-500">(comma-separated)</span></label>
                    <input
                      type="text"
                      value={species.move_tags.join(', ')}
                      onChange={(e) => setSpecies({ ...species, move_tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                      className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-sm focus:outline-none focus:border-pulse"
                    />
                  </div>
                  <div>
                    <label className="block text-steel-400 text-[11px] mb-1">Bestiary bio</label>
                    <textarea
                      value={species.bestiary_bio}
                      onChange={(e) => setSpecies({ ...species, bestiary_bio: e.target.value })}
                      rows={2}
                      className="w-full bg-steel-800 border border-steel-600 rounded-md px-2.5 py-1.5 text-steel-100 text-sm resize-none focus:outline-none focus:border-pulse"
                    />
                  </div>
                </div>
              </Section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
