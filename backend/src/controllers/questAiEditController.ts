import { Response } from 'express';
import mongoose from 'mongoose';
import { QuestlineRequest } from '../middlewares/requireQuestlineOwnership';
import { complete } from '../services/ai';
import { hasGenApiKey } from '../config/ai';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import ProjectModel from '../models/projectModel';
import { buildReferenceContext, GroundingState } from '../services/generationContext';
import {
  loadProjectCharacters,
  loadProjectItems,
  buildProjectCharactersBlock,
  buildProjectItemsBlock,
} from '../services/projectRosterContext';
import { materializeDesigns, DesignKind } from '../services/designMaterialization';
import {
  isValidChange,
  readProposedDesigns,
  readRefs,
  RefLists,
} from '../services/aiEditParse';

// ---------------------------------------------------------------------------
// Input shapes (deserialized from frontend React Flow state)
// ---------------------------------------------------------------------------

interface NodeSnapshot {
  id: string;
  data: {
    title?: string;
    body?: string;
    variant?: string;
    // Node references — the designs pinned to this node. The client has always
    // sent these (they ride along in the same array saveGraph posts); until now
    // the prompt ignored them.
    npcIds?: string[];
    monsterIds?: string[];
    rewardIds?: string[];
  };
}

interface EdgeSnapshot {
  source: string;
  target: string;
}

/** A design the author already has, offered to the model by id. */
interface KnownDesign {
  id: string;
  name: string;
  kind: DesignKind;
  kbRef: string;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const OUTPUT_CONTRACT = `Change types available: updateNode | addNode | deleteNode | addEdge | deleteEdge

━━━ NODE REFERENCES (characters, monsters, items) ━━━
A node's references are the designs pinned to it: npcIds (friendly or neutral figures), monsterIds (hostile figures), rewardIds (items awarded).
To change them, add "refs" to an updateNode or addNode change, carrying BOTH "before" and "after" as COMPLETE lists — not deltas. Omit "refs" entirely when a node's references are unchanged.
- To reference something that already exists, use its exact id from the lists above.
- To reference something that does not exist yet, invent a temp id ("ent-1", "ent-2", …), put it in the list, and describe it once in the top-level "entities" array. The system creates the design.
- When the reference material lists a figure or item that fits, REUSE it rather than inventing a lookalike: set "kbRef" to its exact name.
- When an existing project design fits, set "existingId" to its exact id.
- Describe each new design once in "entities" even if it appears on several nodes; reference its temp id from each.

Rules:
- Only propose changes that directly serve the instruction — no unrequested edits
- updateNode: always include full before AND after values for title, body, and variant (even if a field is unchanged)
- addNode: variants must be one of: story, combat, dialogue, treasure — do NOT include a node id (the system assigns it)
- summary: exactly one sentence explaining why this change is needed
- Maximum 8 changes per response
- Return ONLY valid JSON — no markdown fences, no explanation text`;

const OUTPUT_SHAPE = `Return this exact JSON structure:
{
  "entities": [
    { "tempId": "ent-1", "kind": "monster", "name": "Balrog", "appearance": "towering shadow wreathed in flame", "lore": "an ancient terror sealed beneath the mountain", "kbRef": "Balrog" },
    { "tempId": "ent-2", "kind": "item", "name": "Emberfang", "description": "a blade quenched in dragonfire", "rarity": "epic" }
  ],
  "changes": [
    { "type": "updateNode", "nodeId": "3", "summary": "Replacing the ambush with a dragon encounter as requested", "before": { "title": "Bandit Ambush", "body": "...", "variant": "combat" }, "after": { "title": "Dragon's Lair", "body": "...", "variant": "combat" }, "refs": { "before": { "npcIds": [], "monsterIds": ["664f…"], "rewardIds": [] }, "after": { "npcIds": [], "monsterIds": ["ent-1"], "rewardIds": ["ent-2"] } } },
    { "type": "addNode", "summary": "Adding a discovery scene that foreshadows the dragon", "node": { "title": "Ancient Warning", "body": "...", "variant": "story" }, "connectFrom": "2" },
    { "type": "deleteEdge", "source": "2", "target": "3", "sourceTitle": "Dark Forest", "targetTitle": "Bandit Ambush", "summary": "Removing the old direct path since it now routes through the new scene" }
  ]
}
"entities" may be an empty array when no new design is needed.`;

function describeNode(n: NodeSnapshot, refLine: string): string {
  return `  [${n.id}] "${n.data?.title ?? '?'}" (${n.data?.variant ?? 'story'})
    ${n.data?.body ?? ''}
    references — ${refLine}`;
}

function buildAiEditPrompt(args: {
  storyPrompt: string;
  genre: string;
  nodes: NodeSnapshot[];
  edges: EdgeSnapshot[];
  focusNodeId: string;
  refLineFor: (n: NodeSnapshot) => string;
  designBlock: string;
  projectBlock: string;
  referenceBlock: string;
  instruction: string;
}): string {
  const {
    storyPrompt, genre, nodes, edges, focusNodeId, refLineFor,
    designBlock, projectBlock, referenceBlock, instruction,
  } = args;

  const nodeTitleMap = new Map(nodes.map((n) => [n.id, n.data?.title ?? n.id]));
  const focus = focusNodeId ? nodes.find((n) => n.id === focusNodeId) : undefined;

  const edgeList = edges
    .map((e) => {
      const from = `${e.source} "${nodeTitleMap.get(e.source) ?? e.source}"`;
      const to   = `${e.target} "${nodeTitleMap.get(e.target) ?? e.target}"`;
      return `  ${from} → ${to}`;
    })
    .join('\n');

  const header = `You are a professional game designer editing an existing RPG questline graph.

Story premise:
"""
${storyPrompt}
"""
Genre: ${genre}`;

  const tail = `${designBlock}${projectBlock}${referenceBlock ? `\n${referenceBlock}\n` : ''}
User instruction:
"""
${instruction}
"""`;

  // ── Focused edit: one node is the only legal target, so the rest of the
  // graph is context. Neighbours arrive in full; everything else is a title
  // skeleton that places the scene in the arc without paying for its prose.
  if (focus) {
    const incoming = edges.filter((e) => e.target === focus.id).map((e) => e.source);
    const outgoing = edges.filter((e) => e.source === focus.id).map((e) => e.target);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const render = (ids: string[]): string =>
      ids
        .map((id) => byId.get(id))
        .filter((n): n is NodeSnapshot => n !== undefined)
        .map((n) => describeNode(n, refLineFor(n)))
        .join('\n\n');

    const skeleton = nodes
      .map((n) => `  [${n.id}] "${n.data?.title ?? '?'}"${n.id === focus.id ? '   ← you are editing this one' : ''}`)
      .join('\n');

    return `${header}

Questline outline — every scene, in graph order:
${skeleton}

Narrative flow (source id "title" → target id "title"):
${edgeList || '  (no edges yet)'}

━━━ THE SCENE YOU ARE EDITING ━━━
${describeNode(focus, refLineFor(focus))}

━━━ WHAT LEADS INTO IT ━━━
${render(incoming) || '  (nothing — this is an opening scene)'}

━━━ WHAT FOLLOWS IT ━━━
${render(outgoing) || '  (nothing — this is an ending scene)'}
${tail}

Your task: rewrite ONLY node ${focus.id}, so that it fulfils the instruction and still reads continuously from the scene before it into the scene after it.

Return exactly one updateNode change for node id "${focus.id}". Do NOT add, delete, connect, or modify any other node.

${OUTPUT_CONTRACT}

${OUTPUT_SHAPE}`;
  }

  // ── Unfocused edit: any node is fair game, so the whole graph arrives in full.
  const nodeList = nodes.map((n) => describeNode(n, refLineFor(n))).join('\n\n');
  const nodeIds = nodes.map((n) => `"${n.id}"`).join(', ');

  return `${header}

Current nodes (id | title | variant | body | references):
${nodeList || '  (no nodes yet)'}

Current edges — narrative flow (source id "title" → target id "title"):
${edgeList || '  (no edges yet)'}
${tail}

Your task: propose the minimum set of changes that fulfil the instruction while keeping the graph coherent (no orphaned nodes, no broken narrative flow). Reference the characters and rewards naturally in any new or updated body text where appropriate.

${OUTPUT_CONTRACT}
- Use ONLY these existing node IDs when referencing nodes: ${nodeIds}

${OUTPUT_SHAPE}`;
}

// ---------------------------------------------------------------------------
// Shared setup for both endpoints
// ---------------------------------------------------------------------------

/**
 * KB grounding: the questline's own game, falling back to its project's linked
 * game ('' on the questline means inherit). No game → free editing.
 */
async function resolveGameId(questline: { gameId?: string; projectId?: string }): Promise<string> {
  let effectiveGameId = questline.gameId || '';
  if (!effectiveGameId && questline.projectId) {
    const project = await ProjectModel.findById(questline.projectId).select('gameId').lean();
    effectiveGameId = project?.gameId || '';
  }
  return effectiveGameId;
}

/** Every design the model is allowed to name, by id. */
async function loadKnownDesigns(rawIds: string[]): Promise<KnownDesign[]> {
  // Node data is client-supplied and can carry stale or malformed ids; a single
  // bad one would make the whole $in query throw a cast error.
  const ids = rawIds.filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) return [];
  const [characters, items] = await Promise.all([
    CharacterModel.find({ _id: { $in: ids } }).select('name kind lore kbRef').lean(),
    ItemModel.find({ _id: { $in: ids } }).select('name rarity kbRef').lean(),
  ]);
  return [
    ...characters.map((c) => ({
      id: String(c._id), name: c.name, kind: c.kind as DesignKind, kbRef: c.kbRef ?? '',
    })),
    ...items.map((i) => ({
      id: String(i._id), name: i.name, kind: 'item' as DesignKind, kbRef: i.kbRef ?? '',
    })),
  ];
}

function buildDesignBlock(designs: KnownDesign[]): string {
  if (designs.length === 0) return '';
  const line = (d: KnownDesign) => `  - id="${d.id}" name="${d.name}"${d.kbRef ? ' (from your knowledge base)' : ''}`;
  const npcs = designs.filter((d) => d.kind === 'npc');
  const monsters = designs.filter((d) => d.kind === 'monster');
  const items = designs.filter((d) => d.kind === 'item');
  const sections = [
    npcs.length ? `NPCs:\n${npcs.map(line).join('\n')}` : '',
    monsters.length ? `Monsters:\n${monsters.map(line).join('\n')}` : '',
    items.length ? `Items:\n${items.map(line).join('\n')}` : '',
  ].filter(Boolean);
  return `\nDESIGNS ALREADY IN THIS QUESTLINE (reference these by id):\n${sections.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Controller — propose edits
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
 *               focusNodeId:
 *                 type: string
 *                 description: Restrict the edit to a single node
 *     responses:
 *       200:
 *         description: Proposed changes, any designs they would create, and KB grounding state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 changes:
 *                   type: array
 *                 entities:
 *                   type: array
 *                 grounding:
 *                   type: object
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

  const { instruction, nodes, edges, focusNodeId } = req.body as {
    instruction?: unknown;
    nodes?: unknown;
    edges?: unknown;
    focusNodeId?: unknown;
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
  const nodeSnapshots = nodes as NodeSnapshot[];
  const focusId = typeof focusNodeId === 'string' && nodeSnapshots.some((n) => n.id === focusNodeId)
    ? focusNodeId
    : '';

  try {
    // Everything the model may name by id: the questline's roster plus whatever
    // the live graph already pins (the two can drift before an autosave lands).
    const referencedIds = new Set<string>([
      ...(questline.characterIds ?? []),
      ...(questline.itemIds ?? []),
    ]);
    for (const n of nodeSnapshots) {
      for (const id of [...(n.data?.npcIds ?? []), ...(n.data?.monsterIds ?? []), ...(n.data?.rewardIds ?? [])]) {
        referencedIds.add(id);
      }
    }

    const gameId = await resolveGameId(questline);
    const trimmedInstruction = instruction.trim().slice(0, 500);

    const [knownDesigns, reference, projectCharacters, projectItems] = await Promise.all([
      loadKnownDesigns([...referencedIds]),
      buildReferenceContext({
        ownerId: questline.ownerId,
        gameId: gameId || undefined,
        step: 'nodeEdit',
        query: `${trimmedInstruction}\n${questline.storyPrompt || questline.description}`,
      }),
      loadProjectCharacters(questline.ownerId, questline.projectId ?? ''),
      loadProjectItems(questline.ownerId, questline.projectId ?? ''),
    ]);

    const nameById = new Map(knownDesigns.map((d) => [d.id, d.name]));
    const refLineFor = (n: NodeSnapshot): string => {
      const label = (ids: string[]) =>
        ids.length ? ids.map((id) => `${nameById.get(id) ?? id} (id="${id}")`).join(', ') : 'none';
      return `NPCs: ${label(n.data?.npcIds ?? [])} | monsters: ${label(n.data?.monsterIds ?? [])} | items: ${label(n.data?.rewardIds ?? [])}`;
    };

    const prompt = buildAiEditPrompt({
      storyPrompt: questline.storyPrompt || questline.description,
      genre: questline.genre,
      nodes: nodeSnapshots,
      edges: edges as EdgeSnapshot[],
      focusNodeId: focusId,
      refLineFor,
      designBlock: buildDesignBlock(knownDesigns),
      projectBlock: `${buildProjectCharactersBlock(projectCharacters)}${buildProjectItemsBlock(projectItems)}`,
      referenceBlock: reference.referenceBlock,
      instruction: trimmedInstruction,
    });

    const json = await complete(prompt);
    const parsed = JSON.parse(json) as { changes?: unknown; entities?: unknown };

    const proposed = readProposedDesigns(parsed.entities, reference.entities);
    // An id is legal if it names a design we offered, or a design the model is
    // asking us to create in this same response.
    const allowedIds = new Set<string>([
      ...knownDesigns.map((d) => d.id),
      ...projectCharacters.map((c) => c.id),
      ...projectItems.map((i) => i.id),
      ...proposed.map((p) => p.tempId),
    ]);

    const raw = Array.isArray(parsed.changes) ? parsed.changes : [];
    const changes = raw
      .filter(isValidChange)
      .slice(0, 8)
      .map((c) => {
        const ch = c as Record<string, unknown>;
        if (ch.type !== 'updateNode' && ch.type !== 'addNode') return c;
        const refs = readRefs(ch.refs, allowedIds);
        // Drop only the refs block on malformed input — the text edit is still
        // worth offering.
        return refs ? { ...ch, refs } : { ...ch, refs: undefined };
      });

    // Only ship descriptors something actually references, so a stray invention
    // never reaches the materialize step.
    const usedTempIds = new Set<string>();
    for (const c of changes) {
      const refs = (c as { refs?: { before: RefLists; after: RefLists } }).refs;
      if (!refs) continue;
      for (const id of [...refs.after.npcIds, ...refs.after.monsterIds, ...refs.after.rewardIds]) {
        usedTempIds.add(id);
      }
    }

    const grounding: GroundingState = reference.grounding;
    res.json({
      changes,
      entities: proposed.filter((p) => usedTempIds.has(p.tempId)),
      grounding,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed JSON — please try again' });
    } else {
      console.error('[questAiEdit] aiEditQuestline error:', error);
      res.status(500).json({ error: 'Failed to generate edit proposals' });
    }
  }
}

// ---------------------------------------------------------------------------
// Controller — materialize proposed designs on approval
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /questlines/{id}/ai-edit/materialize:
 *   post:
 *     summary: Create project designs for AI-proposed entities the author approved
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
 *               - entities
 *             properties:
 *               entities:
 *                 type: array
 *     responses:
 *       200:
 *         description: tempId → design id map plus the resolved designs
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export async function materializeAiEditDesigns(req: QuestlineRequest, res: Response): Promise<void> {
  const { entities } = req.body as { entities?: unknown };
  if (!Array.isArray(entities)) {
    res.status(400).json({ error: 'entities must be an array' });
    return;
  }

  const questline = req.questline!;
  if (!questline.projectId) {
    res.status(400).json({ error: 'Questline has no project' });
    return;
  }

  try {
    const gameId = await resolveGameId(questline);
    // Re-read the descriptors from the wire rather than trusting their shape;
    // the client echoes back what we proposed, but it is still client input.
    const proposals = readProposedDesigns(
      entities,
      // No reference lookup here — kbRef was already validated when proposed, so
      // pass the echoed names through as their own canonical form.
      (entities as Record<string, unknown>[])
        .filter((e) => e && typeof e.kbRef === 'string' && e.kbRef.trim())
        .map((e) => ({ name: String(e.kbRef).trim(), type: 'general' as const })),
    );

    const result = await materializeDesigns({
      ownerId: questline.ownerId,
      projectId: questline.projectId,
      gameId,
      proposals,
    });

    res.json(result);
  } catch (error) {
    console.error('[questAiEdit] materializeAiEditDesigns error:', error);
    res.status(500).json({ error: 'Failed to create designs' });
  }
}
