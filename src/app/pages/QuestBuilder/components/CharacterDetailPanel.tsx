import React, { useState, useEffect } from 'react';
import { X, ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { Character, QuestSummary } from '../../../api/projectSidebarApi';

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
  onClose: () => void;
}

export function CharacterDetailPanel({ character, questSummaries, onClose }: CharacterDetailPanelProps) {
  const [appearance, setAppearance] = useState(character.appearance);
  const [background, setBackground] = useState(character.background);

  // Reset local state when character changes
  useEffect(() => {
    setAppearance(character.appearance);
    setBackground(character.background);
  }, [character.id, character.appearance, character.background]);

  const characterQuests = questSummaries.filter((q) => character.questIds.includes(q.id));

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
          {character.imageUrl ? (
            <img
              src={character.imageUrl}
              alt={character.name}
              className="w-full rounded-lg object-cover"
            />
          ) : (
            <div className="w-full h-40 bg-zinc-800 border border-dashed border-zinc-600 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-zinc-500 transition-colors">
              <ImageIcon className="w-6 h-6 text-zinc-600" />
              <p className="text-zinc-600 text-xs">Upload image</p>
            </div>
          )}
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
