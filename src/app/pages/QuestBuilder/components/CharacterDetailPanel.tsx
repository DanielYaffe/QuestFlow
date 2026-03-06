import React, { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, RefreshCw, Loader2, Save, AlertTriangle, ZoomIn, Download } from 'lucide-react';
import { useSpriteJobs } from '../../../context/SpriteJobContext';

const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,#3f3f46 25%,transparent 25%),' +
    'linear-gradient(-45deg,#3f3f46 25%,transparent 25%),' +
    'linear-gradient(45deg,transparent 75%,#3f3f46 75%),' +
    'linear-gradient(-45deg,transparent 75%,#3f3f46 75%)',
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
};
import { motion, AnimatePresence } from 'motion/react';
import {
  Character,
  QuestSummary,
  updateCharacter,
  updateCharacterImage,
} from '../../../api/projectSidebarApi';
import { generateSprite } from '../../../api/spriteApi';
import { getQuestStyles } from '../../../api/questStyleApi';

const variantColor: Record<string, string> = {
  story: 'bg-purple-500',
  combat: 'bg-red-500',
  dialogue: 'bg-blue-500',
  treasure: 'bg-amber-500',
};

interface EditableFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

function EditableField({ label, value, onChange }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  return (
    <div>
      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{label}</p>
      {isEditing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { setIsEditing(false); onChange(draft); }}
          rows={4}
          autoFocus
          className="w-full bg-zinc-800 text-zinc-200 text-sm px-3 py-2 rounded-lg border border-purple-500 focus:outline-none resize-none"
        />
      ) : (
        <p
          onClick={() => setIsEditing(true)}
          className="text-zinc-300 text-sm leading-relaxed cursor-text hover:text-white transition-colors"
        >
          {value || <span className="text-zinc-600 italic">Click to edit...</span>}
        </p>
      )}
    </div>
  );
}

interface UnsavedChangesDialogProps {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

function UnsavedChangesDialog({ onSave, onDiscard, onCancel, isSaving }: UnsavedChangesDialogProps) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-[240px] shadow-xl"
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-white text-sm font-medium">Unsaved changes</p>
        </div>
        <p className="text-zinc-400 text-xs mb-4 leading-relaxed">
          You have unsaved changes. Save them before leaving?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
          <button
            onClick={onDiscard}
            className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-xs transition-colors"
          >
            Discard changes
          </button>
          <button
            onClick={onCancel}
            className="w-full px-3 py-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

interface CharacterDetailPanelProps {
  character: Character;
  questSummaries: QuestSummary[];
  questlineId: string;
  questStyleId: string;
  registerCloseHandler: (fn: () => void) => void;
  onSaved: (patch: Partial<Character>) => void;
  onImageUpdated: (url: string) => void;
  onClose: () => void;
}

export function CharacterDetailPanel({
  character,
  questSummaries,
  questlineId,
  questStyleId,
  registerCloseHandler,
  onSaved,
  onImageUpdated,
  onClose,
}: CharacterDetailPanelProps) {
  const [appearance, setAppearance] = useState(character.appearance);
  const [background, setBackground] = useState(character.background);
  const [imageUrl, setImageUrl] = useState(character.imageUrl ?? '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [genError, setGenError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isDirty =
    appearance !== character.appearance ||
    background !== character.background;

  useEffect(() => {
    setAppearance(character.appearance);
    setBackground(character.background);
    setImageUrl(character.imageUrl ?? '');
    setGenError('');
    setSaveError('');
    setShowUnsavedDialog(false);
  }, [character.id]);

  // Expose the guarded close handler so the sidebar can trigger it on tab switch
  useEffect(() => {
    registerCloseHandler(() => {
      if (isDirty) {
        setPendingClose(true);
        setShowUnsavedDialog(true);
      } else {
        onClose();
      }
    });
  }, [isDirty, registerCloseHandler, onClose]);

  const characterQuests = questSummaries.filter((q) => character.questIds.includes(q.id));

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      await updateCharacter(questlineId, character.id, { appearance, background });
      onSaved({ appearance, background });
      if (pendingClose) {
        setShowUnsavedDialog(false);
        onClose();
      } else {
        setShowUnsavedDialog(false);
      }
    } catch {
      setSaveError('Save failed. Try again.');
    } finally {
      setIsSaving(false);
    }
  }, [questlineId, character.id, appearance, background, onSaved, pendingClose, onClose]);

  const requestClose = () => {
    if (isDirty) {
      setPendingClose(true);
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  };

  const handleDiscard = () => {
    setAppearance(character.appearance);
    setBackground(character.background);
    setShowUnsavedDialog(false);
    if (pendingClose) onClose();
  };

  const { registerJob } = useSpriteJobs();

  const handleGenerateImage = async () => {
    setIsGenerating(true);
    setGenError('');
    try {
      let prompt = `${character.name} — ${appearance || character.appearance}`;
      if (questStyleId) {
        const styles = await getQuestStyles();
        const style = styles.find((s) => s._id === questStyleId);
        if (style?.promptSuffix) prompt += `. ${style.promptSuffix}`;
      }
      const { jobId } = await generateSprite(prompt, {
        category: 'npc',
        detailLevel: 'detailed',
        background: 'transparent',
      });
      // Register at app level — SSE survives navigation
      registerJob(jobId, {
        label: character.name,
        onDone: async (result) => {
          setImageUrl(result.imageUrl);
          onImageUpdated(result.imageUrl);
          await updateCharacterImage(questlineId, character.id, result.imageKey);
          setIsGenerating(false);
        },
        onError: (err) => {
          setGenError(err);
          setIsGenerating(false);
        },
      });
    } catch {
      setGenError('Generation failed. Try again.');
      setIsGenerating(false);
    }
  };

  return (
    <>
    <motion.div
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -16, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute top-0 h-full w-[300px] bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-hidden"
      style={{ left: '260px', zIndex: 20 }}
    >
      {/* Unsaved changes dialog */}
      <AnimatePresence>
        {showUnsavedDialog && (
          <UnsavedChangesDialog
            onSave={handleSave}
            onDiscard={handleDiscard}
            onCancel={() => { setShowUnsavedDialog(false); setPendingClose(false); }}
            isSaving={isSaving}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-white font-medium truncate">{character.name}</h3>
          {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}
        </div>
        <button onClick={requestClose} className="text-zinc-500 hover:text-white transition-colors flex-shrink-0 ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <EditableField label="Appearance" value={appearance} onChange={setAppearance} />

        {/* Image */}
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Image</p>
          {imageUrl ? (
            <div className="space-y-2">
              <div
                className="relative group rounded-lg overflow-hidden cursor-zoom-in"
                style={CHECKER_STYLE}
                onClick={() => setLightboxOpen(true)}
              >
                <img src={imageUrl} alt={character.name} className="w-full object-contain max-h-48" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <button
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {isGenerating ? 'Generating...' : 'Regenerate'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-full h-40 bg-zinc-800 border border-dashed border-zinc-700 rounded-lg flex items-center justify-center">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                    <p className="text-zinc-500 text-xs">Generating...</p>
                  </div>
                ) : (
                  <p className="text-zinc-600 text-xs">No image yet</p>
                )}
              </div>
              <button
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {isGenerating ? 'Generating...' : 'Generate Image'}
              </button>
            </div>
          )}
          {genError && <p className="text-red-400 text-xs mt-1">{genError}</p>}
        </div>

        <EditableField label="Background" value={background} onChange={setBackground} />

        {/* Quest Appearances */}
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Appears In</p>
          {characterQuests.length === 0 ? (
            <p className="text-zinc-600 text-sm italic">No quests assigned</p>
          ) : (
            <div className="space-y-2">
              {characterQuests.map((quest) => (
                <div key={quest.id} className="flex items-center gap-3 px-3 py-2 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${variantColor[quest.variant]}`} />
                  <span className="text-zinc-300 text-sm truncate">{quest.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer — save button */}
      {isDirty && (
        <div className="px-4 py-3 border-t border-zinc-800 flex-shrink-0">
          {saveError && <p className="text-red-400 text-xs mb-2">{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      )}
    </motion.div>

    {/* Lightbox */}
    <AnimatePresence>
      {lightboxOpen && imageUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 260 }}
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center p-6" style={CHECKER_STYLE}>
              <img
                src={imageUrl}
                alt={character.name}
                className="object-contain rounded-lg max-h-[60vh] max-w-full"
              />
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800">
              <p className="text-zinc-300 text-sm font-medium truncate">{character.name}</p>
              <a
                href={imageUrl}
                download={`${character.name}.png`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-3 h-3" />
                Download
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
