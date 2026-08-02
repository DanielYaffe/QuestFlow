import { Response } from 'express';
import mongoose from 'mongoose';
import { config } from '../config/config';
import { AuthRequest } from '../middlewares/authMiddleware';
import { callGemini } from '../utils/gemini';
import { getProjectId } from '../utils/projectScope';
import QuestlineModel from '../models/questlineModel';
import QuestStyleModel from '../models/questStyleModel';
import NodeVariantConfigModel, { BASE_VARIANT_SEEDS } from '../models/nodeVariantConfigModel';
import ExportTemplateModel from '../models/exportTemplateModel';
import { normalizeTemplatePromptScheme, TemplatePromptField, TemplatePromptScheme } from '../services/exportTemplates/templateParser';

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
    promptScheme?: TemplatePromptScheme;
    generationContract?: {
      requirementRoles?: string[];
      rewardRoles?: string[];
      dialogRoles?: string[];
      promptRoles?: string[];
      promptSummary?: string;
    };
    summary?: string;
  };
  schemaSummary?: {
    requirementFields?: string[];
    rewardFields?: string[];
    dialogFields?: string[];
    promptFields?: string[];
    structureSummary?: string;
  };
  inferredAiGuidance?: {
    objectiveFields?: string[];
    rewardFields?: string[];
    promptFields?: string[];
    structureSummary?: string;
  };
}

type PromptNode = { id: string; title: string; body: string; promptValues?: Record<string, unknown> };

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function promptTextForNode(node: PromptNode): string {
  return node.body?.trim() || node.title;
}

function isPromptTextItemField(path: string): boolean {
  return /prompt|text|message|description|body|content|script|dialog|dialogue/i.test(path);
}

function defaultPromptItemValue(valueType: string): unknown {
  if (valueType === 'number') return 0;
  if (valueType === 'boolean') return false;
  return '';
}

function coercePromptItemValue(value: unknown, valueType: string): unknown {
  if (valueType === 'number') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
  if (valueType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    return Boolean(value);
  }
  return value === undefined || value === null ? '' : String(value);
}

function buildPromptRowFromSchema(field: TemplatePromptField, node: PromptNode, rawRow?: unknown): Record<string, unknown> {
  const raw = isRecordValue(rawRow) ? rawRow : {};
  const row: Record<string, unknown> = {};
  const text = promptTextForNode(node);
  const primaryTextField = field.textFields[0]
    ?? field.itemFields.find((item) => isPromptTextItemField(item.path))?.path;

  for (const itemField of field.itemFields) {
    const rawValue = raw[itemField.path];
    if (rawValue !== undefined) {
      row[itemField.path] = coercePromptItemValue(rawValue, itemField.valueType);
      continue;
    }
    row[itemField.path] = itemField.path === primaryTextField
      ? text
      : defaultPromptItemValue(itemField.valueType);
  }

  return row;
}

function normalizePromptValueForField(field: TemplatePromptField, node: PromptNode, rawValue: unknown): unknown {
  if (rawValue === undefined) return defaultPromptValueForField(field, node);

  if (field.kind === 'array' && field.itemFields.length > 0) {
    const rawRows = Array.isArray(rawValue) ? rawValue : [rawValue];
    return rawRows.length
      ? rawRows.map((row) => buildPromptRowFromSchema(field, node, row))
      : [buildPromptRowFromSchema(field, node)];
  }

  return rawValue;
}

function defaultPromptValueForField(field: TemplatePromptField, node: PromptNode): unknown {
  if (field.fillSource !== 'ai') return cloneValue(field.defaultValue);

  const text = promptTextForNode(node);
  if (field.kind === 'array') {
    if (field.itemFields.length > 0) return [buildPromptRowFromSchema(field, node)];
    if (field.textFields.length > 0 || field.optionFields.length > 0 || field.referenceFields.length > 0 || field.navigationFields.length > 0 || field.stateFields.length > 0) {
      const row: Record<string, unknown> = {};
      const primaryTextField = field.textFields[0] ?? 'text';
      row[primaryTextField] = text;
      [...field.optionFields, ...field.referenceFields, ...field.navigationFields, ...field.stateFields].forEach((key) => {
        row[key] = '';
      });
      return [row];
    }
    return [text];
  }

  if (field.kind === 'object') {
    if (isRecordValue(field.defaultValue)) {
      const next = cloneValue(field.defaultValue) as Record<string, unknown>;
      const textKey = field.textFields[0] ?? Object.keys(next).find((key) => typeof next[key] === 'string');
      if (textKey) next[textKey] = text;
      return next;
    }
    return {};
  }

  if (field.kind === 'text') return text;
  return cloneValue(field.defaultValue);
}

function normalizePromptValues(templateDoc: any, node: PromptNode): Record<string, unknown> {
  const scheme = normalizeTemplatePromptScheme(templateDoc?.templateSchema?.promptScheme as TemplatePromptScheme | undefined);
  if (!scheme?.fields?.length) return {};

  const raw = isRecordValue(node.promptValues) ? node.promptValues : {};
  const values: Record<string, unknown> = {};
  for (const field of scheme.fields) {
    if (!field?.path || field.fillSource === 'manual') continue;
    const rawValue = raw[field.path] ?? raw[field.id];
    values[field.path] = normalizePromptValueForField(field, node, rawValue);
  }
  return values;
}

// ---------------------------------------------------------------------------
// POST /quests/generate — generate objectives + rewards
// ---------------------------------------------------------------------------

function buildTemplateObjectivesPrompt(story: string, genre: string, template: TemplateContext): string {
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

A player has provided the following story premise:
"""
${story}
"""

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
- Reward IDs and item IDs are filled manually later, so do not invent final IDs.
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
}`;
}

function buildObjectivesPrompt(story: string, genre: string, template?: TemplateContext): string {
  if (template) return buildTemplateObjectivesPrompt(story, genre, template);

  return `You are a professional game designer specialising in quest design for ${genre} games.

A player has provided the following story premise:
"""
${story}
"""

Your task is to extract 3 to 7 quest objectives and 3 to 7 rewards that fit naturally within this story.

Rules:
- Objectives must be concrete, actionable tasks a player can complete (investigate, defeat, collect, escort, speak to, etc.)
- Each objective description should explain WHY it matters to the story, not just what to do
- Rewards must feel appropriate to the story's tone and setting
- Do NOT repeat themes — each objective and reward must be distinct
- Return between 3 and 7 objectives
- Return between 3 and 7 rewards
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
}`;
}

export async function generateObjectives(req: AuthRequest, res: Response) {
  const { story, genre, templateId } = req.body as { story?: string; genre?: string; templateId?: string };

  if (!story || !genre) {
    res.status(400).json({ error: 'story and genre are required' });
    return;
  }

  if (!config.GEMINI_API_KEY) {
    res.status(500).json({ error: 'Gemini API key is not configured' });
    return;
  }

  let template: TemplateContext | undefined;

  try {
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
    const json = await callGemini(buildObjectivesPrompt(story, genre, template));
    const parsed = JSON.parse(json) as { objectives: Objective[]; rewards: Reward[] };
    res.json(parsed);
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
  role: 'npc' | 'villain' | 'ally' | 'monster' | 'neutral';
  appearance: string;
  background: string;
}

const CHARACTER_ROLES = new Set(['npc', 'villain', 'ally', 'monster', 'neutral']);

function normalizeCharacterRole(role: unknown): GeneratedCharacter['role'] {
  if (typeof role !== 'string') return 'neutral';
  const normalized = role.toLowerCase().trim();
  if (CHARACTER_ROLES.has(normalized)) return normalized as GeneratedCharacter['role'];
  if (/enemy|boss|antagonist|evil|foe/.test(normalized)) return 'villain';
  if (/creature|beast|mob/.test(normalized)) return 'monster';
  if (/friend|companion|helper|mentor/.test(normalized)) return 'ally';
  return 'neutral';
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
    res.json({
      characters: (parsed.characters ?? []).map((character, index) => ({
        ...character,
        id: character.id || `char-${index + 1}`,
        role: normalizeCharacterRole(character.role),
      })),
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
  promptScheme?: TemplatePromptScheme,
): string {
  const objectiveList = objectives.map((o, i) => `  ${i + 1}. ${o.title} — ${o.description}`).join('\n');
  const rewardList    = rewards.map((r) => `  - id="${r.id}" title="${r.title}"`).join('\n');
  const characterList = characters.map((c) => `  - id="${c.id}" name="${c.name}" role="${c.role}"`).join('\n');

  const hasCharacters = characters.length > 0;
  const hasRewards    = rewards.length > 0;
  const promptSchemeFields = promptScheme?.fields ?? [];
  const promptSchemeSection = promptSchemeFields.length > 0 ? `
Template prompt scheme:
${JSON.stringify({
  summary: promptScheme?.summary,
  fields: promptSchemeFields.map((field) => ({
    id: field.id,
    path: field.path,
    label: field.label,
    mode: field.mode,
    kind: field.kind,
    shape: field.shape,
    itemFields: field.itemFields,
    textFields: field.textFields,
    optionFields: field.optionFields,
    referenceFields: field.referenceFields,
    navigationFields: field.navigationFields,
    stateFields: field.stateFields,
    fillSource: field.fillSource,
  })),
  relationships: promptScheme?.relationships ?? [],
}, null, 2)}

Generate "promptValues" for each node only for AI-filled fields in this prompt scheme.
Use exact scheme field paths as promptValues keys.
Values must match each field kind and shape.
Use each node title as the main topic, with node body and selected generation context as supporting context.
Use the relationship explanations to keep fields consistent. For example, if the relationship says one child field references another child field, generate values that reference existing values inside the same generated prompt value.
If relationships mention sequence, branching, terminal state, speaker/reference, control type, or state flags, follow the provided generationGuidance from the analyzed template.
Do not use a built-in dialogue format. Only use fields and relationships listed in the selected template prompt scheme.
Do not copy placeholder text, IDs, or example values from the template.
Leave manual fields empty or omit them.
` : '';

  return `You are a professional game designer creating a quest node graph for a ${genre} game.

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
` : ''}
${promptSchemeSection}
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
- Every combat node SHOULD involve the villain or monster characters. Put their IDs in "monsterIds".
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
    { "id": "1", "type": "questNode", "variant": "story",    "title": "short action title", "body": "2-3 sentences describing the scene, what the player does, and what is at stake.", "npcIds": ["char-1"], "monsterIds": [], "rewardIds": [], "promptValues": {} },
    { "id": "2", "type": "questNode", "variant": "dialogue", "title": "short action title", "body": "2-3 sentences.", "npcIds": ["char-2"], "monsterIds": [], "rewardIds": [], "promptValues": {} },
    { "id": "3", "type": "questNode", "variant": "combat",   "title": "short action title", "body": "2-3 sentences.", "npcIds": [], "monsterIds": ["char-3"], "rewardIds": [], "promptValues": {} }
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

  const { story, genre, objectives, rewards, characters, styleId, templateId } = req.body as {
    story?: string;
    genre?: string;
    objectives?: Objective[];
    rewards?: Reward[];
    characters?: GeneratedCharacter[];
    styleId?: string;
    templateId?: string;
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
      const style = mongoose.Types.ObjectId.isValid(styleId)
        ? await QuestStyleModel.findById(styleId).lean()
        : await QuestStyleModel.findOne({ engine: styleId }).lean();
      if (style) promptSuffix = style.promptSuffix;
    }

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

    // 2. Ask Gemini to generate the graph
    const promptScheme = normalizeTemplatePromptScheme((templateDoc?.templateSchema as { promptScheme?: TemplatePromptScheme } | undefined)?.promptScheme);
    const json = await callGemini(buildGraphPrompt(story, genre, objectives, rewards ?? [], characters ?? [], promptSuffix, promptScheme));
    const generated = JSON.parse(json) as {
      title: string;
      nodes: { id: string; type: string; variant: string; title: string; body: string; npcIds?: string[]; monsterIds?: string[]; rewardIds?: string[]; promptValues?: Record<string, unknown> }[];
      edges: { id: string; source: string; target: string }[];
    };

    // 3. Ensure variant configs exist for any new variants the AI invented
    const variantKeys = [...new Set(generated.nodes.map((n) => n.variant ?? 'story'))];
    await ensureVariantConfigsExist(variantKeys);

    // 4. Build temp-id → index maps so we can remap AI-generated IDs to MongoDB _ids after insert
    const charIdMap  = new Map<string, string>(); // "char-1" → mongo _id
    const rewardIdMap = new Map<string, string>(); // "rew-1"  → mongo _id

    const questline = await QuestlineModel.create({
      ownerId: userId,
      projectId:   getProjectId(req),
      title:       generated.title || story.split('\n')[0].slice(0, 60) || 'New Quest',
      description: story,
      genre:       genre,
      storyPrompt: story,
      styleId:     styleId ?? '',
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
        templateValues: {},
        promptValues: normalizePromptValues(templateDoc, n),
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
      rewards: (rewards ?? []).map((r) => ({
        title:       r.title,
        description: '',
      })),
      characters: (characters ?? []).map((c) => ({
        name:       c.name,
        appearance: c.appearance,
        background: c.background,
        imageUrl:   '',
        questIds:   [],
      })),
    });

    // 5. Build temp-id → MongoDB _id maps from the newly created embedded documents
    (characters ?? []).forEach((c, i) => {
      const mongoId = questline.characters[i]?._id?.toString();
      if (mongoId) charIdMap.set(c.id, mongoId);
    });
    (rewards ?? []).forEach((r, i) => {
      const mongoId = questline.rewards[i]?._id?.toString();
      if (mongoId) rewardIdMap.set(r.id, mongoId);
    });

    // 6. Remap node arrays from temp IDs to MongoDB _ids and save
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
      promptValues: n.promptValues ?? {},
      exportFields: n.exportFields,
    }));
    questline.nodes = remappedNodes as typeof questline.nodes;
    await questline.save();

    res.status(201).json({ questlineId: questline._id.toString() });
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — try again' });
    } else {
      console.error('[questGeneration] generateQuestline error:', error);
      res.status(500).json({ error: 'Failed to generate questline' });
    }
  }
}
