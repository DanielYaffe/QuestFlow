import React, { useState, useEffect } from 'react';
import { X, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Character, QuestSummary, updateCharacterImage } from '../../../api/projectSidebarApi';
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

  useEffect(() => {
    setDraft(value);
  }, [value]);

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

interface CharacterDetailPanelProps {
  character: Character;
  questSummaries: QuestSummary[];
  questlineId: string;
  questStyleId: string;
  onImageUpdated: (url: string) => void;
  onClose: () => void;
}

export function CharacterDetailPanel({
  character,
  questSummaries,
  questlineId,
  questStyleId,
  onImageUpdated,
  onClose,
}: CharacterDetailPanelProps) {
  const [appearance, setAppearance] = useState(character.appearance);
  const [background, setBackground] = useState(character.background);
  const [imageUrl, setImageUrl] = useState(character.imageUrl ?? '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // Reset local state when character changes
  useEffect(() => {
    setAppearance(character.appearance);
    setBackground(character.background);
    setImageUrl(character.imageUrl ?? '');
    setGenError('');
  }, [character.id, character.appearance, character.background, character.imageUrl]);

  const characterQuests = questSummaries.filter((q) => character.questIds.includes(q.id));

  const handleGenerateImage = async () => {
    setIsGenerating(true);
    setGenError('');
    try {
      // Build prompt from character name, appearance, and style promptSuffix
      let prompt = `${character.name} — ${appearance || character.appearance}`;

      if (questStyleId) {
        const styles = await getQuestStyles();
        const style = styles.find((s) => s._id === questStyleId);
        if (style?.promptSuffix) {
          prompt += `. ${style.promptSuffix}`;
        }
      }

      const result = await generateSprite(prompt, {
        category: 'npc',
        detailLevel: 'detailed',
        background: 'transparent',
      });

      const url = result.imageUrl;
      setImageUrl(url);
      onImageUpdated(url);
      await updateCharacterImage(questlineId, character.id, url);
    } catch (err) {
      console.error('Image generation failed:', err);
      setGenError('Generation failed. Try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -16, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute top-0 h-full w-[300px] bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-hidden"
      style={{ left: '260px', zIndex: 20 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800 flex-shrink-0">
        <h3 className="text-white font-medium truncate">{character.name}</h3>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition-colors flex-shrink-0 ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Appearance */}
        <EditableField
          label="Appearance"
          value={appearance}
          onChange={setAppearance}
        />

        {/* Character Image */}
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Image</p>
          {imageUrl ? (
            <div className="space-y-2">
              <img
                src={imageUrl}
                alt={character.name}
                className="w-full rounded-lg object-cover"
              />
              <button
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
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
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {isGenerating ? 'Generating...' : 'Generate Image'}
              </button>
            </div>
          )}
          {genError && <p className="text-red-400 text-xs mt-1">{genError}</p>}
        </div>

        {/* Background */}
        <EditableField
          label="Background"
          value={background}
          onChange={setBackground}
        />

        {/* Quest Appearances */}
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Appears In</p>
          {characterQuests.length === 0 ? (
            <p className="text-zinc-600 text-sm italic">No quests assigned</p>
          ) : (
            <div className="space-y-2">
              {characterQuests.map((quest) => (
                <div
                  key={quest.id}
                  className="flex items-center gap-3 px-3 py-2 bg-zinc-800/60 rounded-lg border border-zinc-700/50"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${variantColor[quest.variant]}`} />
                  <span className="text-zinc-300 text-sm truncate">{quest.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
