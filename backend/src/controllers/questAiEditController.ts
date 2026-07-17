import { Response } from 'express';
import { QuestlineRequest } from '../middlewares/requireQuestlineOwnership';
import { complete } from '../services/ai';
import { hasGenApiKey } from '../config/ai';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import ProjectModel from '../models/projectModel';
import { buildReferenceContext } from '../services/generationContext';

// ---------------------------------------------------------------------------
// Input shapes (deserialized from frontend React Flow state)
// ---------------------------------------------------------------------------

interface NodeSnapshot {
  id: string;
  data: { title?: string; body?: string; variant?: string };
}

interface EdgeSnapshot {
  source: string;
  target: string;
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

function isValidChange(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const ch = c as Record<string, unknown>;
  if (typeof ch.type !== 'string') return false;
  if (typeof ch.summary !== 'string' || !ch.summary.trim()) return false;

  switch (ch.type) {
    case 'updateNode':
      return (
        typeof ch.nodeId === 'string' &&
        ch.before != null && typeof ch.before === 'object' &&
        ch.after  != null && typeof ch.after  === 'object'
      );
    case 'addNode':
      return ch.node != null && typeof ch.node === 'object';
    case 'deleteNode':
      return typeof ch.nodeId === 'string';
    case 'addEdge':
    case 'deleteEdge':
      return typeof ch.source === 'string' && typeof ch.target === 'string';
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildAiEditPrompt(
  storyPrompt: string,
  genre: string,
  nodes: NodeSnapshot[],
  edges: EdgeSnapshot[],
  characters: Array<{ name: string; background: string }>,
  rewards: Array<{ title: string; rarity: string }>,
  instruction: string,
  referenceBlock: string,
): string {
  const nodeTitleMap = new Map(nodes.map((n) => [n.id, n.data?.title ?? n.id]));

  const nodeList = nodes
    .map((n) => `  [${n.id}] "${n.data?.title ?? '?'}" (${n.data?.variant ?? 'story'}): ${n.data?.body ?? ''}`)
    .join('\n');

  const edgeList = edges
    .map((e) => {
      const from = `${e.source} "${nodeTitleMap.get(e.source) ?? e.source}"`;
      const to   = `${e.target} "${nodeTitleMap.get(e.target) ?? e.target}"`;
      return `  ${from} → ${to}`;
    })
    .join('\n');

  const characterList =
    characters.length > 0
      ? characters.map((c) => `  - ${c.name}: ${c.background}`).join('\n')
      : '  (none defined)';

  const rewardList =
    rewards.length > 0
      ? rewards.map((r) => `  - ${r.title} [${r.rarity}]`).join('\n')
      : '  (none defined)';

  const nodeIds = nodes.map((n) => `"${n.id}"`).join(', ');

  return `You are a professional game designer editing an existing RPG questline graph.

Story premise:
"""
${storyPrompt}
"""
Genre: ${genre}

Current nodes (id | title | variant | body):
${nodeList || '  (no nodes yet)'}

Current edges — narrative flow (source id "title" → target id "title"):
${edgeList || '  (no edges yet)'}

Characters in this questline:
${characterList}

Rewards in this questline:
${rewardList}
${referenceBlock ? `${referenceBlock}\n` : ''}
User instruction:
"""
${instruction}
"""

Your task: propose the minimum set of changes that fulfil the instruction while keeping the graph coherent (no orphaned nodes, no broken narrative flow). Reference the characters and rewards naturally in any new or updated body text where appropriate.

Change types available: updateNode | addNode | deleteNode | addEdge | deleteEdge

Rules:
- Only propose changes that directly serve the instruction — no unrequested edits
- updateNode: always include full before AND after values for title, body, and variant (even if a field is unchanged)
- addNode: variants must be one of: story, combat, dialogue, treasure — do NOT include a node id (the system assigns it)
- summary: exactly one sentence explaining why this change is needed
- Use ONLY these existing node IDs when referencing nodes: ${nodeIds}
- Maximum 8 changes per response
- Return ONLY valid JSON — no markdown fences, no explanation text

Return this exact JSON structure:
{
  "changes": [
    { "type": "updateNode", "nodeId": "3", "summary": "Replacing the ambush with a dragon encounter as requested", "before": { "title": "Bandit Ambush", "body": "...", "variant": "combat" }, "after": { "title": "Dragon's Lair", "body": "...", "variant": "combat" } },
    { "type": "addNode", "summary": "Adding a discovery scene that foreshadows the dragon", "node": { "title": "Ancient Warning", "body": "...", "variant": "story" }, "connectFrom": "2" },
    { "type": "deleteEdge", "source": "2", "target": "3", "sourceTitle": "Dark Forest", "targetTitle": "Bandit Ambush", "summary": "Removing the old direct path since it now routes through the new scene" }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /questlines/{id}/ai-edit:
 *   post:
 *     summary: Propose AI-driven edits to a questline graph (owner only)
 *     tags: [Questlines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - instruction
 *               - nodes
 *               - edges
 *             properties:
 *               instruction:
 *                 type: string
 *               nodes:
 *                 type: array
 *               edges:
 *                 type: array
 *     responses:
 *       200:
 *         description: Array of proposed changes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 changes:
 *                   type: array
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       502:
 *         description: AI returned malformed JSON
 */
export async function aiEditQuestline(req: QuestlineRequest, res: Response): Promise<void> {
  if (!hasGenApiKey()) {
    res.status(500).json({ error: 'AI provider API key is not configured' });
    return;
  }

  const { instruction, nodes, edges } = req.body as {
    instruction?: unknown;
    nodes?: unknown;
    edges?: unknown;
  };

  if (typeof instruction !== 'string' || !instruction.trim()) {
    res.status(400).json({ error: 'instruction is required and must be a non-empty string' });
    return;
  }
  if (!Array.isArray(nodes)) {
    res.status(400).json({ error: 'nodes must be an array' });
    return;
  }
  if (!Array.isArray(edges)) {
    res.status(400).json({ error: 'edges must be an array' });
    return;
  }

  const questline = req.questline!;

  const characterDocs = await CharacterModel.find({ _id: { $in: questline.characterIds ?? [] } }).lean();
  const characters = characterDocs.map((c) => ({
    name: c.name,
    background: c.lore ?? '',
  }));
  const itemDocs = await ItemModel.find({ _id: { $in: questline.itemIds ?? [] } })
    .select('name rarity')
    .lean();
  const rewards = itemDocs.map((i) => ({
    title: i.name,
    rarity: i.rarity ?? 'common',
  }));

  // KB grounding: the questline's own game, falling back to its project's
  // linked game ('' on the questline means inherit). No game → free editing.
  let effectiveGameId = questline.gameId || '';
  if (!effectiveGameId && questline.projectId) {
    const project = await ProjectModel.findById(questline.projectId).select('gameId').lean();
    effectiveGameId = project?.gameId || '';
  }
  const trimmedInstruction = instruction.trim().slice(0, 500);
  const reference = await buildReferenceContext({
    ownerId: questline.ownerId,
    gameId: effectiveGameId || undefined,
    step: 'questline',
    query: `${trimmedInstruction}\n${questline.storyPrompt || questline.description}`,
  });

  const prompt = buildAiEditPrompt(
    questline.storyPrompt || questline.description,
    questline.genre,
    nodes as NodeSnapshot[],
    edges as EdgeSnapshot[],
    characters,
    rewards,
    trimmedInstruction,
    reference.referenceBlock,
  );

  try {
    const json = await complete(prompt);
    const parsed = JSON.parse(json) as { changes?: unknown };
    const raw = Array.isArray(parsed.changes) ? parsed.changes : [];
    const changes = raw.filter(isValidChange).slice(0, 8);
    res.json({ changes });
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — please try again' });
    } else {
      res.status(500).json({ error: 'Failed to generate edit proposals' });
    }
  }
}
