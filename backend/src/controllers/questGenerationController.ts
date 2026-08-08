import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getProjectId } from '../utils/projectScope';
import QuestlineModel from '../models/questlineModel';
import QuestStyleModel from '../models/questStyleModel';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import NodeVariantConfigModel, { BASE_VARIANT_SEEDS } from '../models/nodeVariantConfigModel';
import GameThemeModel, { IGameTheme } from '../models/gameThemeModel';
import ThemeConfigModel from '../models/themeConfigModel';
import ExportTemplateModel from '../models/exportTemplateModel';
import { resolveProjectId } from '../models/projectModel';
import { complete } from '../services/ai';
import { hasGenApiKey } from '../config/ai';
import { buildReferenceContext, ReferenceEntity } from '../services/generationContext';
import {
  loadProjectCharacters,
  loadProjectRewardTitles,
  buildProjectCharactersBlock,
  buildProjectRewardsBlock,
} from '../services/projectRosterContext';
import {
  materializeDesigns,
  normalizeCharacterKind,
  ProposedDesign,
} from '../services/designMaterialization';
import { ownsGame } from '../services/gameService';
import { DifficultyBucket } from '../services/structuredParse';

const BASE_VARIANT_KEYS = new Set(BASE_VARIANT_SEEDS.map((s) => s.key));

// Palette pool for AI-generated variants
const AI_VARIANT_PALETTES = [
  { borderColor: 'border-emerald-500', bgColor: 'bg-emerald-500/10', iconColor: 'text-emerald-400', shadowColor: 'shadow-emerald-500/50' },
  { borderColor: 'border-orange-500',  bgColor: 'bg-orange-500/10',  iconColor: 'text-orange-400',  shadowColor: 'shadow-orange-500/50' },
  { borderColor: 'border-cyan-500',    bgColor: 'bg-cyan-500/10',    iconColor: 'text-cyan-400',    shadowColor: 'shadow-cyan-500/50' },
  { borderColor: 'border-pink-500',    bgColor: 'bg-pink-500/10',    iconColor: 'text-pink-400',    shadowColor: 'shadow-pink-500/50' },
  { borderColor: 'border-violet-500',  bgColor: 'bg-violet-500/10',  iconColor: 'text-violet-400',  shadowColor: 'shadow-violet-500/50' },
  { borderColor: 'border-yellow-500',  bgColor: 'bg-yellow-500/10',  iconColor: 'text-yellow-400',  shadowColor: 'shadow-yellow-500/50' },
];

async function ensureVariantConfigsExist(variantKeys: string[]): Promise<void> {
  const unknown = variantKeys.filter((k) => !BASE_VARIANT_KEYS.has(k));
  if (unknown.length === 0) return;

  const existingDocs = await NodeVariantConfigModel.find({ key: { $in: unknown } }).select('key').lean();
  const existingKeys = new Set(existingDocs.map((d) => d.key));

  const toCreate = unknown.filter((k) => !existingKeys.has(k));
  if (toCreate.length === 0) return;

  let paletteIdx = 0;
  const docs = toCreate.map((key) => {
    const palette = AI_VARIANT_PALETTES[paletteIdx % AI_VARIANT_PALETTES.length];
    paletteIdx++;
    return {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      iconKey: 'star',
      isBase: false,
      ...palette,
    };
  });

  await NodeVariantConfigModel.insertMany(docs, { ordered: false }).catch(() => {
    // ignore duplicate key errors from race conditions
  });
}

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
  // Exact KB entity name when this reward IS an existing item from the game's
  // knowledge base — surfaced as a "grounded" mark and persisted on the
  // questline reward. Absent for invented rewards.
  kbRef?: string;
}

// ---------------------------------------------------------------------------
// Helper — load theme metadata (falls back to generic_rpg if not found)
// ---------------------------------------------------------------------------

async function loadTheme(themeId?: string): Promise<IGameTheme | null> {
  const id = themeId || 'generic_rpg';
  return GameThemeModel.findOne({ themeId: id }).lean();
}

function buildThemeContext(theme: IGameTheme | null): string {
  if (!theme) return '';

  const rewardList = theme.rewardTypes.map((r) => `${r.name} (${r.rarity})`).join(', ');
  const questList  = theme.questTypes.map((q) => q.name).join(', ');

  return `
Theme context:
- Tone: ${theme.questTone}
- Naming style: ${theme.namingStyle}
- Available reward types: ${rewardList}
- Quest types: ${questList}
- Location rules: ${theme.locationRules}
- Dialogue style: ${theme.dialogueStyle}`.trim();
}

// Optional soft progression hint from the client ('' / unknown → none).
function parseProgression(v: unknown): DifficultyBucket | undefined {
  return v === 'early' || v === 'mid' || v === 'late' ? v : undefined;
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { status?: number; message?: string };
  return maybeError.status === 429 || maybeError.message?.includes('RESOURCE_EXHAUSTED') === true;
}

function buildFallbackObjectives(template?: TemplateContext): { objectives: Objective[]; rewards: Reward[] } {
  const requirementFields = template?.schemaSummary?.requirementFields ?? template?.inferredAiGuidance?.objectiveFields ?? [];
  const rewardFields = template?.schemaSummary?.rewardFields ?? template?.inferredAiGuidance?.rewardFields ?? [];
  const hasCombat = requirementFields.some((field) => /kill|combat|monster|mob/i.test(field));
  const hasCollection = requirementFields.some((field) => /collect|item|drop/i.test(field));
  const hasReward = rewardFields.length > 0;

  return {
    objectives: [
      {
        id: 'obj-1',
        title: hasCombat ? 'Combat' : 'Investigate',
        description: hasCombat
          ? 'Defeat the main threat connected to the quest.'
          : 'Discover the source of the conflict and why it matters.',
      },
      {
        id: 'obj-2',
        title: hasCollection ? 'Collect Items' : 'Talk to NPC',
        description: hasCollection
          ? 'Gather the required materials or quest items.'
          : 'Speak with an important character to move the story forward.',
      },
      {
        id: 'obj-3',
        title: 'Complete Quest',
        description: 'Return to the final objective and resolve the quest.',
      },
    ],
    rewards: [
      { id: 'rew-1', title: hasReward ? 'Receive Reward' : 'Receive Item' },
      { id: 'rew-2', title: 'Gain Currency' },
      { id: 'rew-3', title: 'Gain Experience' },
    ],
  };
}

interface TemplateContext {
  id: string;
  name: string;
  structure: unknown;
  templateSchema?: {
    generationContract?: {
      requirementRoles?: string[];
      rewardRoles?: string[];
      dialogRoles?: string[];
      promptSummary?: string;
    };
    summary?: string;
  };
  schemaSummary?: {
    requirementFields?: string[];
    rewardFields?: string[];
    dialogFields?: string[];
    structureSummary?: string;
  };
  inferredAiGuidance?: {
    objectiveFields?: string[];
    rewardFields?: string[];
    structureSummary?: string;
  };
}

function buildInitialTemplateValues(
  templateDoc: any,
  node: { id: string; title: string; body: string; npcIds?: string[] },
): Record<string, unknown> {
  const fields = templateDoc?.templateSchema?.editableFields;
  if (!Array.isArray(fields)) return {};

  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (
      field?.gameplayRole === 'questDialog'
      && field?.kind === 'array'
      && typeof field.path === 'string'
      && shouldSeedDialogField(field.path)
    ) {
      values[field.path] = [{
        id: `${node.id}_${field.path.replace(/[^\w]+/g, '_')}_page_1`,
        npcId: 0,
        type: 'ok',
        prompt: node.body || node.title,
      }];
    }
  }
  return values;
}

function shouldSeedDialogField(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized === 'dialog'
    || normalized === 'dialogue'
    || normalized === 'description'
    || normalized.endsWith('.dialog')
    || normalized.endsWith('.dialogue')
    || normalized.endsWith('.description')
    || /(^|\.)(start|inprogress|in_progress|progress|complete)\.pages$/.test(normalized);
}

// ---------------------------------------------------------------------------
// POST /quests/generate — generate objectives + rewards
// ---------------------------------------------------------------------------

function buildTemplateObjectivesPrompt(story: string, genre: string, themeContext: string, referenceBlock: string, projectBlock: string, template: TemplateContext): string {
  const contract = template.templateSchema?.generationContract;
  const requirementFields = contract?.requirementRoles?.length
    ? contract.requirementRoles.join(', ')
    : template.schemaSummary?.requirementFields?.join(', ') || 'No explicit requirement fields detected';
  const rewardFields = contract?.rewardRoles?.length
    ? contract.rewardRoles.join(', ')
    : template.schemaSummary?.rewardFields?.join(', ') || 'No explicit reward fields detected';
  const dialogFields = contract?.dialogRoles?.length
    ? contract.dialogRoles.join(', ')
    : template.schemaSummary?.dialogFields?.join(', ') || 'No explicit dialog fields detected';
  const structureSummary = contract?.promptSummary
    ?? template.templateSchema?.summary
    ?? template.schemaSummary?.structureSummary
    ?? template.inferredAiGuidance?.structureSummary
    ?? JSON.stringify(template.structure);

  return `You are a professional game designer specialising in quest design for ${genre} games.
${themeContext ? `\n${themeContext}\n` : ''}
A player has provided the following story premise:
"""
${story}
"""
${referenceBlock ? `${referenceBlock}\n` : ''}${projectBlock ? `${projectBlock}\n` : ''}
The user selected a quest-node export template named "${template.name}".
Analyzed template schema summary:
${structureSummary}

Requirement-related fields detected:
${requirementFields}

Reward-related fields detected:
${rewardFields}

Dialog-related fields detected:
${dialogFields}

Your task is to infer gameplay requirements, reward categories, and optional dialog intent that fit this template. The saved schema is the source of truth: do not force a fixed number of objectives or rewards.

Rules:
- Prefer general gameplay categories, not overly specific prose.
- Use the detected template schema roles to decide which requirement, reward, and dialog categories make sense.
- Do not copy IDs, amounts, concrete item names, monster names, or placeholder values from the template into generated titles.
- Do not assume the template has combat, collection, item reward, currency reward, experience reward, or dialog fields unless those roles are present above.
- Reward IDs and item IDs are filled manually later, so do not invent final IDs.${referenceBlock ? `
- If a reward IS one of the existing items listed in the reference material, use that item's exact name and add "kbRef" with the same exact name. Never add kbRef to rewards you invent.` : ''}
- Return ONLY valid JSON, no markdown, no explanation.

Return this JSON structure:
{
  "objectives": [
    { "id": "obj-1", "title": "Generic objective type", "description": "what the player should do and why" },
    { "id": "obj-2", "title": "Another objective type", "description": "what the player should do and why" }
  ],
  "rewards": [
    { "id": "rew-1", "title": "Generic reward type" }
  ]
}${referenceBlock ? `

A reward object may additionally carry "kbRef" — the exact name of the reference-material item it reuses. Include it whenever the reward IS one of the listed existing items.` : ''}`;
}

function buildObjectivesPrompt(story: string, genre: string, themeContext: string, referenceBlock: string, projectBlock: string, template?: TemplateContext): string {
  if (template) return buildTemplateObjectivesPrompt(story, genre, themeContext, referenceBlock, projectBlock, template);

  return `You are a professional game designer specialising in quest design for ${genre} games.
${themeContext ? `\n${themeContext}\n` : ''}
A player has provided the following story premise:
"""
${story}
"""
${referenceBlock ? `${referenceBlock}\n` : ''}${projectBlock ? `${projectBlock}\n` : ''}
Your task is to extract 3 to 7 quest objectives and 3 to 7 rewards that fit naturally within this story.

Rules:
- Objectives must be concrete, actionable tasks a player can complete (investigate, defeat, collect, escort, speak to, etc.)
- Each objective description should explain WHY it matters to the story, not just what to do
- Rewards must feel appropriate to the story's tone and setting
- Do NOT repeat themes — each objective and reward must be distinct
- Return between 3 and 7 objectives
- Return between 3 and 7 rewards${referenceBlock ? `
- If a reward IS one of the existing items listed in the reference material, use that item's exact name and add "kbRef" with the same exact name. Never add kbRef to rewards you invent.` : ''}
- Return ONLY valid JSON, no markdown, no explanation

Return this exact JSON structure:
{
  "objectives": [
    { "id": "obj-1", "title": "short title", "description": "one sentence explaining what and why" },
    { "id": "obj-2", "title": "short title", "description": "one sentence explaining what and why" },
    { "id": "obj-3", "title": "short title", "description": "one sentence explaining what and why" }
  ],
  "rewards": [
    { "id": "rew-1", "title": "reward name" },
    { "id": "rew-2", "title": "reward name" },
    { "id": "rew-3", "title": "reward name" }
  ]
}${referenceBlock ? `

A reward object may additionally carry "kbRef" — the exact name of the reference-material item it reuses. Include it whenever the reward IS one of the listed existing items.` : ''}`;
}

export async function generateObjectives(req: AuthRequest, res: Response) {
  const { story, genre, themeId, templateId, gameId, progression } = req.body as {
    story?: string; genre?: string; themeId?: string; templateId?: string; gameId?: string; progression?: string;
  };

  if (!story || !genre) {
    res.status(400).json({ error: 'story and genre are required' });
    return;
  }

  if (!hasGenApiKey()) {
    res.status(500).json({ error: 'AI provider API key is not configured' });
    return;
  }

  let template: TemplateContext | undefined;

  try {
    const [theme, reference, existingRewardTitles] = await Promise.all([
      loadTheme(themeId),
      buildReferenceContext({
        ownerId: String(req.user?._id ?? ''),
        gameId,
        step: 'objectives',
        query: story,
        progression: parseProgression(progression),
      }),
      loadProjectRewardTitles(req.user?._id, getProjectId(req)),
    ]);
    const themeContext = buildThemeContext(theme);
    const projectBlock = buildProjectRewardsBlock(existingRewardTitles);

    if (templateId) {
      if (!mongoose.Types.ObjectId.isValid(templateId)) {
        res.status(400).json({ error: 'Invalid template id' });
        return;
      }
      const templateDoc = await ExportTemplateModel.findOne({
        _id: templateId,
        $or: [{ isBuiltIn: true }, { ownerId: req.user?._id }],
      }).lean();
      if (!templateDoc) {
        res.status(403).json({ error: 'Template not found or not available' });
        return;
      }
      template = {
        id: templateDoc._id.toString(),
        name: templateDoc.name,
        structure: templateDoc.structure,
        templateSchema: templateDoc.templateSchema as TemplateContext['templateSchema'],
        schemaSummary: templateDoc.schemaSummary,
        inferredAiGuidance: templateDoc.inferredAiGuidance,
      };
    }

    const json = await complete(buildObjectivesPrompt(story, genre, themeContext, reference.referenceBlock, projectBlock, template));
    const parsed = JSON.parse(json) as { objectives: Objective[]; rewards: Reward[] };
    // kbRef is only trusted when it names an entity we actually offered as
    // reference — anything else is a hallucination and is dropped. A reward
    // whose title exactly matches an offered item is grounded even when the
    // model forgot the kbRef field.
    const canonicalNames = new Map(reference.entities.map((e: ReferenceEntity) => [e.name.toLowerCase(), e.name]));
    res.json({
      objectives: parsed.objectives ?? [],
      rewards: (parsed.rewards ?? []).map((reward) => ({
        ...reward,
        kbRef: (typeof reward.kbRef === 'string'
          ? canonicalNames.get(reward.kbRef.trim().toLowerCase())
          : undefined)
          ?? (typeof reward.title === 'string' ? canonicalNames.get(reward.title.trim().toLowerCase()) : undefined),
      })),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — try again' });
    } else if (isQuotaError(error)) {
      console.warn('[questGeneration] Gemini quota exhausted while generating objectives. Returning fallback objectives.');
      res.json(buildFallbackObjectives(template));
    } else {
      console.error('[questGeneration] generateObjectives error:', error);
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
  role: 'npc' | 'monster';
  appearance: string;
  background: string;
  // Exact KB entity name when this character IS an existing game entity —
  // generateQuestline links the existing Character doc instead of duplicating.
  kbRef?: string;
  // Mongo _id of an existing project Character this one reuses — linked
  // directly instead of inserting a duplicate.
  existingId?: string;
}

// Coercion to the CharacterModel enum lives with materialization, so the wizard
// and the quest editor agree on what counts as hostile.
const normalizeCharacterRole = normalizeCharacterKind;

function buildCharactersPrompt(story: string, genre: string, themeContext: string, referenceBlock: string, projectBlock: string): string {
  return `You are a professional narrative designer for ${genre} games.
${themeContext ? `\n${themeContext}\n` : ''}
A player has provided the following story premise:
"""
${story}
"""
${referenceBlock ? `${referenceBlock}\n` : ''}${projectBlock ? `${projectBlock}\n` : ''}
Your task is to identify all meaningful characters that exist or are implied in this story.

Rules:
- Extract 1 to 6 characters. Include only characters who would plausibly appear in the quest.
- Do NOT invent characters that are not suggested by the story.
- Each character must have role "npc" (any friendly or neutral figure: quest giver, merchant, ally, bystander) or "monster" (any hostile figure: villain, boss, enemy creature, antagonist).
- Appearance: 1 concise sentence describing their look (clothing, physical traits, atmosphere).
- Background: 1 concise sentence about who they are and their motivation in this story.${referenceBlock ? `
- The reference material lists characters and creatures that ALREADY EXIST in this game world. When the story involves a figure that matches one of them — a leader, mentor, elder, merchant, rival, beast — CAST the existing entity instead of inventing a similar new one: use its exact name and add "kbRef" with the same exact name.
- Only invent a new character when nothing in the reference material fits the role. Never add kbRef to characters you invent.` : ''}${projectBlock ? `
- If a story character IS one of the existing project characters listed above, return it with "existingId" set to that exact id and keep the same name — do not create a duplicate. Still fill role, appearance, and background.` : ''}
- Return ONLY valid JSON, no markdown, no explanation.

Return this exact JSON structure:
{
  "characters": [
    { "id": "char-1", "name": "Name", "role": "npc",     "appearance": "...", "background": "..." },
    { "id": "char-2", "name": "Name", "role": "monster",  "appearance": "...", "background": "..." },
    { "id": "char-3", "name": "Name", "role": "npc",     "appearance": "...", "background": "..." }
  ]
}${referenceBlock || projectBlock ? `

A character object may additionally carry ${referenceBlock ? '"kbRef" — the exact name of the reference-material entity it reuses' : ''}${referenceBlock && projectBlock ? ', and/or ' : ''}${projectBlock ? '"existingId" — the exact id of the project character it reuses' : ''}. Include the field whenever it applies.` : ''}`;
}

export async function generateCharacters(req: AuthRequest, res: Response) {
  const { story, genre, themeId, gameId, progression } = req.body as {
    story?: string; genre?: string; themeId?: string; gameId?: string; progression?: string;
  };

  if (!story || !genre) {
    res.status(400).json({ error: 'story and genre are required' });
    return;
  }

  if (!hasGenApiKey()) {
    res.status(500).json({ error: 'AI provider API key is not configured' });
    return;
  }

  try {
    const [theme, reference, projectCharacters] = await Promise.all([
      loadTheme(themeId),
      buildReferenceContext({
        ownerId: String(req.user?._id ?? ''),
        gameId,
        step: 'characters',
        query: story,
        progression: parseProgression(progression),
      }),
      loadProjectCharacters(req.user?._id, getProjectId(req)),
    ]);
    const themeContext = buildThemeContext(theme);
    const projectBlock = buildProjectCharactersBlock(projectCharacters);
    const json = await complete(buildCharactersPrompt(story, genre, themeContext, reference.referenceBlock, projectBlock));
    const parsed = JSON.parse(json) as { characters: GeneratedCharacter[] };
    // kbRef/existingId are only trusted when they name an entity we actually
    // offered — anything else is a hallucination and is dropped. The model may
    // also cast an offered entity without tagging it, so an exact name match
    // grounds the character anyway (the flag must not depend on the model
    // remembering a field).
    const canonicalNames = new Map(reference.entities.map((e: ReferenceEntity) => [e.name.toLowerCase(), e.name]));
    const validExistingIds = new Set(projectCharacters.map((c) => c.id));
    const projectIdByName = new Map(projectCharacters.map((c) => [c.name.toLowerCase(), c.id]));
    res.json({
      characters: (parsed.characters ?? []).map((character, index) => {
        const name = typeof character.name === 'string' ? character.name.trim().toLowerCase() : '';
        const kbRef = (typeof character.kbRef === 'string'
          ? canonicalNames.get(character.kbRef.trim().toLowerCase())
          : undefined) ?? canonicalNames.get(name);
        const existingId = (typeof character.existingId === 'string' && validExistingIds.has(character.existingId.trim())
          ? character.existingId.trim()
          : undefined) ?? projectIdByName.get(name);
        return {
          ...character,
          id: character.id || `char-${index + 1}`,
          role: normalizeCharacterRole(character.role),
          kbRef,
          existingId,
        };
      }),
    });
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
  characters: GeneratedCharacter[],
  promptSuffix: string,
  themeContext: string,
  referenceBlock: string,
): string {
  const objectiveList = objectives.map((o, i) => `  ${i + 1}. ${o.title} — ${o.description}`).join('\n');
  const rewardList    = rewards.map((r) => `  - id="${r.id}" title="${r.title}"`).join('\n');
  const characterList = characters.map((c) => `  - id="${c.id}" name="${c.name}" role="${c.role}"`).join('\n');

  const hasCharacters = characters.length > 0;

  return `You are a professional game designer creating a quest node graph for a ${genre} game.
${themeContext ? `\n${themeContext}\n` : ''}
Story premise:
"""
${story}
"""

Objectives to weave into the story (use as inspiration for scenes, not as a node-per-objective checklist):
${objectiveList}

Rewards available (use their exact IDs when assigning to nodes):
${rewardList}
${hasCharacters ? `
Characters in this story (use their exact IDs when assigning to nodes):
${characterList}
` : ''}${referenceBlock ? `${referenceBlock}\n` : ''}
━━━ WHAT A NODE IS ━━━
A node is a single SCENE in the story — one moment, one location, one decision point.
Think of it like a chapter in a book or a room in a dungeon.
Each node has a variant that describes the TYPE of scene:
  story    → exposition, cutscene, lore reveal, arrival at a new area
  combat   → fight, ambush, boss encounter, skirmish
  dialogue → conversation, interrogation, negotiation, NPC interaction
  treasure → item discovery, puzzle, exploration, looting

━━━ CHARACTER & REWARD ASSIGNMENT ━━━
- Every dialogue/story node SHOULD involve 1–2 relevant characters. Put their IDs in "npcIds".
- Every combat node SHOULD involve the monster characters. Put their IDs in "monsterIds".
- The final resolution node MUST have the reward IDs in "rewardIds". Mid-quest treasure nodes may also have reward IDs.
- Use ONLY IDs from the lists above. Leave arrays empty ([]) if none apply.

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
    { "id": "1", "type": "questNode", "variant": "story",    "title": "short action title", "body": "2-3 sentences describing the scene, what the player does, and what is at stake.", "npcIds": ["char-1"], "monsterIds": [], "rewardIds": [] },
    { "id": "2", "type": "questNode", "variant": "dialogue", "title": "short action title", "body": "2-3 sentences.", "npcIds": ["char-2"], "monsterIds": [], "rewardIds": [] },
    { "id": "3", "type": "questNode", "variant": "combat",   "title": "short action title", "body": "2-3 sentences.", "npcIds": [], "monsterIds": ["char-3"], "rewardIds": [] }
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

  const { story, genre, objectives, rewards, characters, styleId, themeId, exportFormat, templateId, projectId, gameId, progression } = req.body as {
    story?: string;
    genre?: string;
    objectives?: Objective[];
    rewards?: Reward[];
    characters?: GeneratedCharacter[];
    styleId?: string;
    themeId?: string;
    exportFormat?: string;
    templateId?: string;
    projectId?: string;
    gameId?: string;
    progression?: string;
  };

  if (!story || !genre || !objectives?.length) {
    res.status(400).json({ error: 'story, genre, and objectives are required' });
    return;
  }

  if (!hasGenApiKey()) {
    res.status(500).json({ error: 'AI provider API key is not configured' });
    return;
  }

  // Track inserted Character/Item docs so we can roll them back if the
  // questline itself fails to persist (standalone Mongo has no transactions).
  let insertedCharacterIds: mongoose.Types.ObjectId[] = [];
  let insertedItemIds: mongoose.Types.ObjectId[] = [];
  let questlineSaved = false;

  try {
    // 1. Resolve style promptSuffix and theme metadata in parallel
    const [style, theme] = await Promise.all([
      styleId
        ? (mongoose.isValidObjectId(styleId)
            ? QuestStyleModel.findById(styleId).lean()
            : QuestStyleModel.findOne({ engine: styleId }).lean())
        : Promise.resolve(null),
      loadTheme(themeId),
    ]);

    const promptSuffix = style?.promptSuffix ?? '';
    const themeContext = buildThemeContext(theme);

    // Resolve export format: request body → theme default → 'json'
    const resolvedExportFormat = exportFormat
      ?? (await ThemeConfigModel.findOne({ themeId: themeId ?? 'generic_rpg' }).lean())?.defaultExportFormat
      ?? 'json';

    // Resolve the owning project (active project header → body → user's Inbox)
    const resolvedProjectId = await resolveProjectId(userId, getProjectId(req) || projectId);

    // KB grounding: only a Game the caller owns counts; anything else is
    // treated as "no game" and generation runs free.
    const ownedGameId = gameId && (await ownsGame(String(userId), gameId)) ? gameId : '';
    const reference = await buildReferenceContext({
      ownerId: String(userId),
      gameId: ownedGameId || undefined,
      step: 'questline',
      query: [story, ...(objectives ?? []).map((o) => o.title)].join('\n'),
      progression: parseProgression(progression),
    });

    // Resolve the export template (if provided)
    let templateDoc = null;
    if (templateId) {
      if (!mongoose.Types.ObjectId.isValid(templateId)) {
        res.status(400).json({ error: 'Invalid template id' });
        return;
      }
      templateDoc = await ExportTemplateModel.findOne({
        _id: templateId,
        $or: [{ isBuiltIn: true }, { ownerId: userId }],
      }).lean();
      if (!templateDoc) {
        res.status(403).json({ error: 'Template not found or not available' });
        return;
      }
    }

    // 2. Ask the model to generate the graph
    const json = await complete(buildGraphPrompt(story, genre, objectives, rewards ?? [], characters ?? [], promptSuffix, themeContext, reference.referenceBlock));
    const generated = JSON.parse(json) as {
      title: string;
      nodes: { id: string; type: string; variant: string; title: string; body: string; npcIds?: string[]; monsterIds?: string[]; rewardIds?: string[] }[];
      edges: { id: string; source: string; target: string }[];
    };

    // 3. Ensure variant configs exist for any new variants the AI invented
    const variantKeys = [...new Set(generated.nodes.map((n) => n.variant ?? 'story'))];
    await ensureVariantConfigsExist(variantKeys);

    // 4. Materialize the generated characters and rewards into project designs,
    //    then build temp-id → _id maps for node remapping. Shared with the quest
    //    editor's AI edits, so both dedupe identically: an existing project
    //    design is linked (by id, KB tag, or name) rather than duplicated.
    const proposals: ProposedDesign[] = [
      ...(characters ?? []).map((c) => ({
        tempId:     c.id,
        kind:       c.role, // already coerced to 'npc' | 'monster'
        name:       c.name,
        appearance: c.appearance,
        lore:       c.background,
        kbRef:      c.kbRef,
        existingId: c.existingId,
      })),
      ...(rewards ?? [])
        .filter((r) => r.title?.trim())
        .map((r) => ({
          tempId: r.id,
          kind:   'item' as const,
          name:   r.title,
          kbRef:  r.kbRef,
        })),
    ];

    const { designs } = await materializeDesigns({
      ownerId:   String(userId),
      projectId: resolvedProjectId,
      gameId:    ownedGameId,
      proposals,
    });

    const charIdMap   = new Map<string, string>(); // "char-1" → mongo _id
    const rewardIdMap = new Map<string, string>(); // "rew-1"  → mongo _id
    const questlineCharacterIds: string[] = [];
    const questlineItemIds: string[] = [];

    for (const d of designs) {
      if (d.kind === 'item') {
        rewardIdMap.set(d.tempId, d.id);
        if (!questlineItemIds.includes(d.id)) questlineItemIds.push(d.id);
      } else {
        charIdMap.set(d.tempId, d.id);
        if (!questlineCharacterIds.includes(d.id)) questlineCharacterIds.push(d.id);
      }
    }

    // Only designs written just now are rolled back if the questline fails to
    // persist — linking an existing one must never delete it.
    insertedCharacterIds = designs
      .filter((d) => d.created && d.kind !== 'item')
      .map((d) => new mongoose.Types.ObjectId(d.id));
    insertedItemIds = designs
      .filter((d) => d.created && d.kind === 'item')
      .map((d) => new mongoose.Types.ObjectId(d.id));

    const questline = await QuestlineModel.create({
      ownerId:      userId,
      projectId:    resolvedProjectId,
      title:        generated.title || story.split('\n')[0].slice(0, 60) || 'New Quest',
      description:  story,
      genre:        genre,
      storyPrompt:  story,
      styleId:      styleId ?? '',
      themeId:      themeId ?? 'generic_rpg',
      exportFormat: resolvedExportFormat,
      gameId:       ownedGameId,
      characterIds: questlineCharacterIds,
      templateId:   templateDoc?._id.toString() ?? '',
      templateName: templateDoc?.name ?? '',
      templateSnapshot: templateDoc ? {
        id: templateDoc._id.toString(),
        name: templateDoc.name,
        rawTemplate: templateDoc.rawTemplate,
        structure: templateDoc.structure,
        templateAst: templateDoc.templateAst,
        defaultOutputFormat: templateDoc.defaultOutputFormat,
        fieldSchema: templateDoc.fieldSchema,
        templateSchema: templateDoc.templateSchema,
        schemaSummary: templateDoc.schemaSummary,
        analysisStatus: templateDoc.analysisStatus,
        inferredAiGuidance: templateDoc.inferredAiGuidance,
      } : undefined,
      // Nodes saved with placeholder IDs first — remapped below after we have _ids
      nodes: generated.nodes.map((n) => ({
        nodeId:     n.id,
        type:       n.type ?? 'questNode',
        title:      n.title,
        body:       n.body,
        variant:    n.variant ?? 'story',
        npcIds:     n.npcIds     ?? [],
        monsterIds: n.monsterIds ?? [],
        rewardIds:  n.rewardIds  ?? [],
        templateValues: buildInitialTemplateValues(templateDoc, n),
        exportFields: {
          questId: parseInt(n.id, 10) || undefined,
          silent: true,
          preQuest: generated.edges
            .filter((e) => e.target === n.id)
            .map((e) => parseInt(e.source, 10))
            .filter((id) => Number.isFinite(id)).length
            ? generated.edges
              .filter((e) => e.target === n.id)
              .map((e) => parseInt(e.source, 10))
              .filter((id) => Number.isFinite(id))
            : [-1],
          daily: false,
          toKill: [],
          toCollect: [],
          rewardItems: [],
        },
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
      itemIds: questlineItemIds,
    });

    // 5. Remap node arrays from temp IDs to MongoDB _ids and save
    const remappedNodes = questline.nodes.map((n) => ({
      _id:        n._id,
      nodeId:     n.nodeId,
      type:       n.type,
      title:      n.title,
      body:       n.body,
      variant:    n.variant,
      npcIds:     n.npcIds.map((id)     => charIdMap.get(id)   ?? id),
      monsterIds: n.monsterIds.map((id) => charIdMap.get(id)   ?? id),
      rewardIds:  n.rewardIds.map((id)  => rewardIdMap.get(id) ?? id),
      templateValues: n.templateValues ?? {},
      exportFields: n.exportFields,
    }));
    questline.nodes = remappedNodes as typeof questline.nodes;
    await questline.save();
    questlineSaved = true;

    res.status(201).json({ questlineId: questline._id.toString() });
  } catch (error) {
    // Roll back orphaned Character/Item docs if the questline never persisted.
    if (!questlineSaved && insertedCharacterIds.length > 0) {
      await CharacterModel.deleteMany({ _id: { $in: insertedCharacterIds } }).catch(() => {});
    }
    if (!questlineSaved && insertedItemIds.length > 0) {
      await ItemModel.deleteMany({ _id: { $in: insertedItemIds } }).catch(() => {});
    }
    console.error('[generateQuestline]', error);
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — try again' });
    } else {
      console.error('[questGeneration] generateQuestline error:', error);
      res.status(500).json({ error: 'Failed to generate questline' });
    }
  }
}
