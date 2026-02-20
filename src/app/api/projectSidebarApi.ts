import { NodeVariant } from '../types/quest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Character = {
  id: string;
  name: string;
  appearance: string;
  background: string;
  imageUrl?: string;
  questIds: string[]; // node IDs from the questline this character appears in
};

export type Chapter = {
  id: string;
  title: string;
  scenes: { id: string; title: string }[];
};

export type QuestSummary = {
  id: string;
  title: string;
  variant: NodeVariant;
};

// ---------------------------------------------------------------------------
// Stub data — replace with real API responses when backend is ready
// ---------------------------------------------------------------------------

const STUB_CHARACTERS: Character[] = [
  {
    id: 'c1',
    name: 'The Knight',
    appearance: 'A small, silent knight clad in black shell armour. No expression betrays the thoughts within.',
    background: 'The Knight is one of many Vessels created to contain the Infection. Having escaped the Abyss, they now wander the world pursuing a goal only half-remembered.',
    questIds: ['9001', '9003', '9006'],
  },
  {
    id: 'c2',
    name: 'Elderbug',
    appearance: 'A frail, ancient bug sitting on a bench at the entrance of Dirtmouth. His eyes are distant and weary.',
    background: 'The eldest remaining resident of Dirtmouth. He has watched the town empty around him and continues to wait, though he no longer remembers exactly what for.',
    questIds: ['9001', '9002'],
  },
  {
    id: 'c3',
    name: 'Quirrel',
    appearance: 'A cheerful scholar dressed in traveler\'s clothing, carrying a nail and a keen curiosity about the world.',
    background: 'A wandering explorer who once served the Pale King\'s archive. He has since broken free of his past and walks the world driven by wonder rather than duty.',
    questIds: ['9002', '9004', '9006'],
  },
];

const STUB_CHAPTERS: Chapter[] = [
  {
    id: 'ch1',
    title: 'The Fading Town',
    scenes: [
      { id: 's1', title: 'Chapter 1 Scene 01' },
      { id: 's2', title: 'Chapter 1 Scene 02' },
      { id: 's3', title: 'Chapter 1 Scene 03' },
      { id: 's4', title: 'Chapter 1 Scene 04' },
      { id: 's5', title: 'Chapter 1 Scene 05' },
    ],
  },
  {
    id: 'ch2',
    title: 'Depths of the Clock',
    scenes: [
      { id: 's6', title: 'Chapter 2 Scene 01' },
      { id: 's7', title: 'Chapter 2 Scene 02' },
      { id: 's8', title: 'Chapter 2 Scene 03' },
    ],
  },
];

const STUB_QUEST_SUMMARIES: QuestSummary[] = [
  { id: '9001', title: 'A World Not My Own', variant: 'story' },
  { id: '9002', title: 'Distorted Memories', variant: 'dialogue' },
  { id: '9003', title: 'Clockwork Collapse', variant: 'combat' },
  { id: '9004', title: 'Dragon Suppression', variant: 'combat' },
  { id: '9005', title: 'Rift Stabilization', variant: 'story' },
  { id: '9006', title: 'The Rift Architect', variant: 'treasure' },
];

// ---------------------------------------------------------------------------
// API functions — uncomment backend calls and remove stubs when ready
// ---------------------------------------------------------------------------

export async function fetchCharacters(questlineId: number): Promise<Character[]> {
  // --- BACKEND CALL (uncomment when API is ready) ---
  // const response = await fetch(`/api/questlines/${questlineId}/characters`);
  // if (!response.ok) throw new Error(`Failed to fetch characters for questline ${questlineId}`);
  // return response.json();

  // --- STUB ---
  void questlineId;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return STUB_CHARACTERS;
}

export async function fetchChapters(questlineId: number): Promise<Chapter[]> {
  // --- BACKEND CALL (uncomment when API is ready) ---
  // const response = await fetch(`/api/questlines/${questlineId}/chapters`);
  // if (!response.ok) throw new Error(`Failed to fetch chapters for questline ${questlineId}`);
  // return response.json();

  // --- STUB ---
  void questlineId;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return STUB_CHAPTERS;
}

export async function fetchQuestSummaries(questlineId: number): Promise<QuestSummary[]> {
  // --- BACKEND CALL (uncomment when API is ready) ---
  // const response = await fetch(`/api/questlines/${questlineId}/quests`);
  // if (!response.ok) throw new Error(`Failed to fetch quest summaries for questline ${questlineId}`);
  // return response.json();

  // --- STUB ---
  void questlineId;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return STUB_QUEST_SUMMARIES;
}
