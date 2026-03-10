import { Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/config';
import { AuthRequest } from '../middlewares/authMiddleware';
import QuestlineModel from '../models/questlineModel';
import QuestStyleModel from '../models/questStyleModel';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface Objective {
  id: string;
  title: string;
  description: string;
}

interface Reward {
  id: string;
  title: string;
  rarity: 'common' | 'rare' | 'epic';
}

// ---------------------------------------------------------------------------
// Helper — run Gemini and strip fences
// ---------------------------------------------------------------------------

async function callGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
  });
  const text = (result.text ?? '').trim();
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

// ---------------------------------------------------------------------------
// POST /quests/generate — generate objectives + rewards
// ---------------------------------------------------------------------------

function buildObjectivesPrompt(story: string, genre: string): string {
  return `You are a professional game designer specialising in quest design for ${genre} games.

A player has provided the following story premise:
"""
${story}
"""

Your task is to extract exactly 5 quest objectives and exactly 5 rewards that fit naturally within this story.

Rules:
- Objectives must be concrete, actionable tasks a player can complete (investigate, defeat, collect, escort, speak to, etc.)
- Each objective description should explain WHY it matters to the story, not just what to do
- Rewards must feel appropriate to the story's tone and setting
- Rarity distribution: at least 2 common, at least 1 rare, at least 1 epic
- Do NOT repeat themes — each objective and reward must be distinct
- Return ONLY valid JSON, no markdown, no explanation

Return this exact JSON structure:
{
  "objectives": [
    { "id": "obj-1", "title": "short title", "description": "one sentence explaining what and why" },
    { "id": "obj-2", "title": "short title", "description": "one sentence explaining what and why" },
    { "id": "obj-3", "title": "short title", "description": "one sentence explaining what and why" },
    { "id": "obj-4", "title": "short title", "description": "one sentence explaining what and why" },
    { "id": "obj-5", "title": "short title", "description": "one sentence explaining what and why" }
  ],
  "rewards": [
    { "id": "rew-1", "title": "reward name", "rarity": "common" },
    { "id": "rew-2", "title": "reward name", "rarity": "common" },
    { "id": "rew-3", "title": "reward name", "rarity": "rare" },
    { "id": "rew-4", "title": "reward name", "rarity": "rare" },
    { "id": "rew-5", "title": "reward name", "rarity": "epic" }
  ]
}`;
}

export async function generateObjectives(req: AuthRequest, res: Response) {
  const { story, genre } = req.body as { story?: string; genre?: string };

  if (!story || !genre) {
    res.status(400).json({ error: 'story and genre are required' });
    return;
  }

  if (!config.GEMINI_API_KEY) {
    res.status(500).json({ error: 'Gemini API key is not configured' });
    return;
  }

  try {
    const json = await callGemini(buildObjectivesPrompt(story, genre));
    const parsed = JSON.parse(json) as { objectives: Objective[]; rewards: Reward[] };
    res.json(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — try again' });
    } else {
      res.status(500).json({ error: 'Failed to generate objectives' });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /quests/generate-characters — deduce characters from story
// ---------------------------------------------------------------------------

interface GeneratedCharacter {
  id: string;
  name: string;
  role: 'npc' | 'villain' | 'ally' | 'monster' | 'neutral';
  appearance: string;
  background: string;
}

function buildCharactersPrompt(story: string, genre: string): string {
  return `You are a professional narrative designer for ${genre} games.

A player has provided the following story premise:
"""
${story}
"""

Your task is to identify all meaningful characters that exist or are implied in this story — NPCs, allies, villains, monsters, and neutral figures.

Rules:
- Extract 1 to 6 characters. Include only characters who would plausibly appear in the quest.
- Do NOT invent characters that are not suggested by the story.
- Each character must have a distinct role: "npc" (quest giver, merchant, bystander), "ally" (joins the player), "villain" (antagonist, boss), "monster" (enemy creature), or "neutral" (ambiguous, can be either).
- Appearance: 1 concise sentence describing their look (clothing, physical traits, atmosphere).
- Background: 1 concise sentence about who they are and their motivation in this story.
- Return ONLY valid JSON, no markdown, no explanation.

Return this exact JSON structure:
{
  "characters": [
    { "id": "char-1", "name": "Name", "role": "npc",     "appearance": "...", "background": "..." },
    { "id": "char-2", "name": "Name", "role": "villain",  "appearance": "...", "background": "..." },
    { "id": "char-3", "name": "Name", "role": "ally",     "appearance": "...", "background": "..." }
  ]
}`;
}

export async function generateCharacters(req: AuthRequest, res: Response) {
  const { story, genre } = req.body as { story?: string; genre?: string };

  if (!story || !genre) {
    res.status(400).json({ error: 'story and genre are required' });
    return;
  }

  if (!config.GEMINI_API_KEY) {
    res.status(500).json({ error: 'Gemini API key is not configured' });
    return;
  }

  try {
    const json = await callGemini(buildCharactersPrompt(story, genre));
    const parsed = JSON.parse(json) as { characters: GeneratedCharacter[] };
    res.json(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — try again' });
    } else {
      res.status(500).json({ error: 'Failed to generate characters' });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /quests/generate-questline — generate full graph + save to DB
// ---------------------------------------------------------------------------

function buildGraphPrompt(
  story: string,
  genre: string,
  objectives: Objective[],
  rewards: Reward[],
  promptSuffix: string,
): string {
  const objectiveList = objectives.map((o, i) => `  ${i + 1}. ${o.title} — ${o.description}`).join('\n');
  const rewardList = rewards.map((r) => `  - ${r.title} (${r.rarity})`).join('\n');

  return `You are a professional game designer creating a quest node graph for a ${genre} game.

Story premise:
"""
${story}
"""

Objectives to weave into the story (use as inspiration for scenes, not as a node-per-objective checklist):
${objectiveList}

Rewards granted at the quest end:
${rewardList}

━━━ WHAT A NODE IS ━━━
A node is a single SCENE in the story — one moment, one location, one decision point.
Think of it like a chapter in a book or a room in a dungeon.
Each node has a variant that describes the TYPE of scene:
  story    → exposition, cutscene, lore reveal, arrival at a new area
  combat   → fight, ambush, boss encounter, skirmish
  dialogue → conversation, interrogation, negotiation, NPC interaction
  treasure → item discovery, puzzle, exploration, looting

━━━ WHAT BRANCHING MEANS ━━━
Branching means the STORY SPLITS. One scene ends and the player chooses (or the story diverges into) two DIFFERENT continuations.

CORRECT branching example:
  Node 3 "Confront the Spy" → edge to Node 4 "Persuade Him" (dialogue path)
                             → edge to Node 5 "Fight Your Way Through" (combat path)
  Both paths eventually reach Node 7 "Escape the Building"

WRONG (do NOT do this):
  Node 3 → Node 4 (objective A)
  Node 3 → Node 5 (objective B)
  These run in parallel simultaneously — that is not a player choice, it's just two tasks.

━━━ GRAPH RULES ━━━
- 7 to 11 nodes total
- MUST have at least 2 branch points where the story splits into different continuations
- Each branch represents a meaningful player choice or story divergence (stealth vs combat, trust vs betray, etc.)
- All branches MUST converge back to a single final resolution node
- The final node awards the rewards and concludes the story
- Node IDs: sequential strings "1", "2", "3", …
- Edge ID format: "e{source}-{target}"
- A node can have multiple outgoing edges (branching) or multiple incoming edges (converging) — both are valid
- Do NOT create isolated nodes with no edges

━━━ EXAMPLE SHAPE (8 nodes, 2 branch points) ━━━
1(intro) → 2(discover) → 3(branch point A) → 4(path A1) → 6(rejoin) → 7(branch point B) → 8(path B1) → 9(resolution)
                                             → 5(path A2) ↗              ↓                 → 10(path B2)↗

Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "title": "3–6 word quest title",
  "nodes": [
    { "id": "1", "type": "questNode", "variant": "story",    "title": "short action title", "body": "2-3 sentences describing the scene, what the player does, and what is at stake." },
    { "id": "2", "type": "questNode", "variant": "dialogue", "title": "short action title", "body": "2-3 sentences." },
    { "id": "3", "type": "questNode", "variant": "combat",   "title": "short action title", "body": "2-3 sentences." }
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2" },
    { "id": "e2-3", "source": "2", "target": "3" },
    { "id": "e2-4", "source": "2", "target": "4" }
  ]
}${promptSuffix ? `\n\nVisual style note (for node body descriptions): ${promptSuffix}` : ''}`;
}

export async function generateQuestline(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { story, genre, objectives, rewards, characters, styleId } = req.body as {
    story?: string;
    genre?: string;
    objectives?: Objective[];
    rewards?: Reward[];
    characters?: GeneratedCharacter[];
    styleId?: string;
  };

  if (!story || !genre || !objectives?.length) {
    res.status(400).json({ error: 'story, genre, and objectives are required' });
    return;
  }

  if (!config.GEMINI_API_KEY) {
    res.status(500).json({ error: 'Gemini API key is not configured' });
    return;
  }

  try {
    // 1. Resolve the style's promptSuffix (if provided)
    let promptSuffix = '';
    if (styleId) {
      const style = await QuestStyleModel.findById(styleId).lean();
      if (style) promptSuffix = style.promptSuffix;
    }

    // 2. Ask Gemini to generate the graph
    const json = await callGemini(buildGraphPrompt(story, genre, objectives, rewards ?? [], promptSuffix));
    const generated = JSON.parse(json) as {
      title: string;
      nodes: { id: string; type: string; variant: string; title: string; body: string }[];
      edges: { id: string; source: string; target: string }[];
    };

    // 3. Save to DB in the questline graph format
    const questline = await QuestlineModel.create({
      ownerId: userId,
      title:       generated.title || story.split('\n')[0].slice(0, 60) || 'New Quest',
      description: story,
      genre:       genre,
      storyPrompt: story,
      styleId:     styleId ?? '',
      nodes: generated.nodes.map((n) => ({
        nodeId:  n.id,
        type:    n.type ?? 'questNode',
        title:   n.title,
        body:    n.body,
        variant: n.variant ?? 'story',
      })),
      edges: generated.edges.map((e) => ({
        edgeId: e.id,
        source: e.source,
        target: e.target,
      })),
      objectives: (objectives ?? []).map((o) => ({
        objectiveId: o.id,
        title:       o.title,
        description: o.description,
      })),
      rewards: (rewards ?? []).map((r) => ({
        title:       r.title,
        description: '',
        rarity:      r.rarity,
      })),
      characters: (characters ?? []).map((c) => ({
        name:       c.name,
        appearance: c.appearance,
        background: c.background,
        imageUrl:   '',
        questIds:   [],
      })),
    });

    res.status(201).json({ questlineId: questline._id.toString() });
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — try again' });
    } else {
      res.status(500).json({ error: 'Failed to generate questline' });
    }
  }
}
