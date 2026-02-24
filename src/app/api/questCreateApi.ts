export interface Objective {
  id: string;
  title: string;
  description: string;
}

export interface Reward {
  id: string;
  title: string;
  rarity: 'common' | 'rare' | 'epic';
}

export interface GenerateObjectivesResult {
  objectives: Objective[];
  rewards: Reward[];
}

// ---------------------------------------------------------------------------
// Stub data — replace with real API response shape when backend is ready
// ---------------------------------------------------------------------------

const STUB_OBJECTIVES: Objective[] = [
  { id: 'obj-1', title: 'Investigate the ruined temple', description: 'Search the collapsed structure for clues about the distortion\'s origin.' },
  { id: 'obj-2', title: 'Defeat the corrupted guardian', description: 'Overcome the ancient sentinel twisted by rift energy.' },
  { id: 'obj-3', title: 'Recover the stolen artifact', description: 'Locate and retrieve the dimensional compass taken by the rift architect.' },
  { id: 'obj-4', title: 'Speak to the village elder', description: 'Gather lore about the rift from the last surviving elder of the old order.' },
  { id: 'obj-5', title: 'Escort the wounded scout', description: 'Safely guide the injured scout back to the outpost before nightfall.' },
];

const STUB_REWARDS: Reward[] = [
  { id: 'rew-1', title: 'Ancient Weapon Fragment', rarity: 'rare' },
  { id: 'rew-2', title: '500 Gold Coins', rarity: 'common' },
  { id: 'rew-3', title: 'Faction Reputation +20', rarity: 'common' },
  { id: 'rew-4', title: 'Magic Scroll: Temporal Shift', rarity: 'epic' },
  { id: 'rew-5', title: 'Hidden Dungeon Map', rarity: 'rare' },
];

// ---------------------------------------------------------------------------
// API call — uncomment and replace stub return once backend is available
// ---------------------------------------------------------------------------

export async function generateObjectives(
  _story: string,
  _genre: string,
): Promise<GenerateObjectivesResult> {
  // --- BACKEND CALL (uncomment when API is ready) ---
  // const response = await fetch('/api/quests/generate', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ story: _story, genre: _genre }),
  // });
  // if (!response.ok) throw new Error('Failed to generate objectives');
  // return response.json(); // expected: { objectives: Objective[], rewards: Reward[] }

  // --- STUB (remove once backend is ready) ---
  await new Promise((resolve) => setTimeout(resolve, 1200)); // simulate network
  return {
    objectives: STUB_OBJECTIVES,
    rewards: STUB_REWARDS,
  };
}
