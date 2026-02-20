import React, { useState, useEffect } from 'react';
import { Users, BookOpen, ScrollText, ChevronDown, ChevronRight, Plus, Trash2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchCharacters,
  fetchChapters,
  fetchQuestSummaries,
  Character,
  Chapter,
  QuestSummary,
} from '../../../api/projectSidebarApi';
import { CharacterDetailPanel } from './CharacterDetailPanel';

type Tab = 'characters' | 'chapters' | 'quests';

const variantColor: Record<string, string> = {
  story: 'bg-purple-500',
  combat: 'bg-red-500',
  dialogue: 'bg-blue-500',
  treasure: 'bg-amber-500',
};

interface ProjectSidebarProps {
  questlineId: number;
  isOpen: boolean;
}

export function ProjectSidebar({ questlineId, isOpen }: ProjectSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('characters');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questSummaries, setQuestSummaries] = useState<QuestSummary[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCharacters(questlineId).then(setCharacters).catch(console.error);
    fetchChapters(questlineId).then(setChapters).catch(console.error);
    fetchQuestSummaries(questlineId).then(setQuestSummaries).catch(console.error);
  }, [questlineId]);

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) ?? null;

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'characters', icon: <Users className="w-4 h-4" />, label: 'Characters' },
    { id: 'chapters', icon: <BookOpen className="w-4 h-4" />, label: 'Chapters' },
    { id: 'quests', icon: <ScrollText className="w-4 h-4" />, label: 'Quests' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Main sidebar panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="absolute left-0 top-0 h-full flex flex-row bg-zinc-900 border-r border-zinc-800"
            style={{ width: '260px', zIndex: 20 }}
          >
            {/* Tab strip */}
            <div className="w-10 flex flex-col items-center py-3 gap-1 border-r border-zinc-800 flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'text-purple-400 bg-purple-500/10'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {tab.icon}
                </button>
              ))}
            </div>

            {/* Content panel */}
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Tab header */}
              <div className="px-3 py-3 border-b border-zinc-800 flex-shrink-0">
                <p className="text-white text-sm font-medium capitalize">{activeTab}</p>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">
                {/* ── Characters ── */}
                {activeTab === 'characters' && (
                  <div className="py-1">
                    {characters.map((char) => (
                      <div
                        key={char.id}
                        onClick={() =>
                          setSelectedCharacterId(
                            selectedCharacterId === char.id ? null : char.id
                          )
                        }
                        className={`group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                          selectedCharacterId === char.id
                            ? 'bg-purple-500/10 border-l-2 border-purple-500'
                            : 'border-l-2 border-transparent hover:bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`text-sm truncate ${
                            selectedCharacterId === char.id ? 'text-purple-300' : 'text-zinc-300'
                          }`}
                        >
                          {char.name}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-zinc-500 hover:text-blue-400 transition-colors"
                            title="Duplicate"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button className="w-full px-3 py-2 text-left text-sm text-purple-400 hover:text-purple-300 hover:bg-zinc-800 transition-colors">
                      + Add New Character
                    </button>
                  </div>
                )}

                {/* ── Chapters ── */}
                {activeTab === 'chapters' && (
                  <div className="py-1">
                    {chapters.map((chapter) => {
                      const isExpanded = expandedChapters.has(chapter.id);
                      return (
                        <div key={chapter.id}>
                          <button
                            onClick={() => toggleChapter(chapter.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                            )}
                            <span className="text-zinc-200 text-sm truncate">{chapter.title}</span>
                          </button>
                          {isExpanded &&
                            chapter.scenes.map((scene) => (
                              <div
                                key={scene.id}
                                className="group flex items-center justify-between pl-8 pr-3 py-1.5 hover:bg-zinc-800 transition-colors cursor-pointer"
                              >
                                <span className="text-zinc-400 text-xs truncate">{scene.title}</span>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-purple-400 transition-colors flex-shrink-0"
                                  title="Continue Story"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Quests ── */}
                {activeTab === 'quests' && (
                  <div className="py-1">
                    {questSummaries.map((quest) => (
                      <div
                        key={quest.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 transition-colors cursor-pointer"
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

          {/* Character detail panel — renders beside the sidebar */}
          <AnimatePresence>
            {selectedCharacter && (
              <CharacterDetailPanel
                character={selectedCharacter}
                questSummaries={questSummaries}
                onClose={() => setSelectedCharacterId(null)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
