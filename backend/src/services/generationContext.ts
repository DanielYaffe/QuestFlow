import mongoose from 'mongoose';
import { KbType } from './qdrant';
import { retrieve, RetrievedChunk } from './ragService';
import { getOwnedGame } from './gameService';
import { DifficultyBucket } from './structuredParse';

// ---------------------------------------------------------------------------
// Reference-context assembly (§5.3) — gather optional KB material for one
// generation step. Never an allowlist: the block explicitly invites invention,
// and an empty/missing KB yields '' so generation runs exactly as before.
// ---------------------------------------------------------------------------

export type GenerationStep = 'objectives' | 'characters' | 'questline' | 'nodeEdit';

export interface ReferenceEntity {
  name: string;
  role?: string;
  type: KbType;
}

// Why the KB did or didn't contribute. Ungrounded generation is the normal case
// (most questlines link no game), but 'not-owned' and 'no-matches' look
// identical to an author staring at a result that ignored their world — so each
// exit reports itself rather than collapsing into one silent empty block.
export type GroundingReason = 'no-game' | 'not-owned' | 'no-matches';

export interface GroundingState {
  consulted: boolean;
  reason?: GroundingReason;
  gameId?: string;
  gameName?: string;
  entityCount: number;
}

export interface ReferenceContext {
  referenceBlock: string;
  entities: ReferenceEntity[];
  grounding: GroundingState;
}

function ungrounded(reason: GroundingReason, game?: { id: string; name: string }): ReferenceContext {
  return {
    referenceBlock: '',
    entities: [],
    grounding: {
      consulted: false,
      reason,
      gameId: game?.id,
      gameName: game?.name,
      entityCount: 0,
    },
  };
}

// Which KB categories feed each step, and how much of each.
const STEP_SOURCES: Record<GenerationStep, { type: KbType; topK: number }[]> = {
  // lore/quests set tone and precedent; items feed the objectives step
  // because rewards are generated there.
  objectives: [
    { type: 'lore', topK: 3 },
    { type: 'quests', topK: 3 },
    { type: 'maps', topK: 2 },
    { type: 'items', topK: 2 },
    { type: 'general', topK: 2 },
  ],
  characters: [
    { type: 'monsters', topK: 4 },
    { type: 'characters', topK: 4 },
    { type: 'lore', topK: 2 },
    { type: 'general', topK: 2 },
  ],
  questline: [
    { type: 'monsters', topK: 3 },
    { type: 'characters', topK: 3 },
    { type: 'items', topK: 3 },
    { type: 'maps', topK: 2 },
    { type: 'quests', topK: 2 },
  ],
  // Editing an existing graph is a different job from drafting one: the payoff
  // is naming entities that can become node references, so the three castable
  // types get the deepest recall. lore/general are queried too because a KB may
  // describe its cast only inside prose world documents.
  nodeEdit: [
    { type: 'characters', topK: 4 },
    { type: 'monsters', topK: 4 },
    { type: 'items', topK: 4 },
    { type: 'lore', topK: 2 },
    { type: 'maps', topK: 2 },
    { type: 'general', topK: 1 },
  ],
};

const SECTION_LABELS: Record<KbType, string> = {
  monsters: 'Existing monsters & enemies',
  characters: 'Existing characters & NPCs',
  maps: 'Known maps & areas',
  items: 'Existing items & loot',
  quests: 'Existing quests',
  lore: 'World lore',
  general: 'World notes',
};

const MAX_ENTRY_CHARS = 300;

// Looser than retrieve()'s 0.5 default: reference material is optional
// guidance, and a short story premise scores low against entity sheets — a
// strict cutoff silently returns nothing and generation loses the KB entirely.
const REFERENCE_SCORE_THRESHOLD = 0.35;

function formatChunk(chunk: RetrievedChunk): string {
  // Entity points embed a line-oriented sheet; flatten it for the prompt.
  const flat = chunk.text.replace(/\s*\n\s*/g, '; ').trim();
  const body = flat.length > MAX_ENTRY_CHARS ? `${flat.slice(0, MAX_ENTRY_CHARS)}…` : flat;
  if (chunk.entity !== undefined) {
    const stage = chunk.difficultyBucket ? ` [${chunk.difficultyBucket}-game]` : '';
    return `- ${body}${stage}`;
  }
  return `- (from "${chunk.title}") ${body}`;
}

/**
 * Build the optional REFERENCE MATERIAL block for a generation step. Returns
 * '' when there is no game, the game isn't the caller's, or nothing relevant
 * is retrieved — generation then runs free, exactly as without a KB. The
 * accompanying `grounding` says which of those happened.
 */
export async function buildReferenceContext(args: {
  ownerId: string;
  gameId?: string;
  step: GenerationStep;
  query: string;
  progression?: DifficultyBucket;
}): Promise<ReferenceContext> {
  const { ownerId, gameId, step, query, progression } = args;
  // A malformed id is a missing link, not a crash — findOne would throw a
  // CastError, and callers treat this as an optional enrichment.
  if (!gameId || !mongoose.isValidObjectId(gameId)) return ungrounded('no-game');

  const game = await getOwnedGame(ownerId, gameId);
  if (!game) return ungrounded('not-owned');
  const gameRef = { id: gameId, name: game.name };

  const groups = await Promise.all(
    STEP_SOURCES[step].map(async ({ type, topK }) => ({
      type,
      chunks: await retrieve({
        gameId,
        type,
        query,
        topK,
        progression,
        scoreThreshold: REFERENCE_SCORE_THRESHOLD,
      }).catch((): RetrievedChunk[] => []),
    })),
  );

  const sections: string[] = [];
  const entities: ReferenceEntity[] = [];
  const seenEntities = new Set<string>();

  for (const { type, chunks } of groups) {
    if (chunks.length === 0) continue;
    sections.push(`${SECTION_LABELS[type]}:\n${chunks.map(formatChunk).join('\n')}`);
    for (const chunk of chunks) {
      if (chunk.entity === undefined || seenEntities.has(chunk.entity)) continue;
      seenEntities.add(chunk.entity);
      entities.push({ name: chunk.entity, role: chunk.entityRole, type });
    }
  }

  if (sections.length === 0) return ungrounded('no-matches', gameRef);

  const referenceBlock = `
REFERENCE MATERIAL (optional) — existing data from this game's world:
${sections.join('\n\n')}

You MAY use or take inspiration from the material above, and you may also freely invent new elements that fit this world. When something you need already exists above, prefer referencing the existing entity over re-creating a near-duplicate.${progression ? `\nThis quest is aimed at the ${progression} game, so lean toward references of a fitting difficulty — but this is a preference, not a rule.` : ''}`;

  return {
    referenceBlock,
    entities,
    grounding: {
      consulted: true,
      gameId: gameRef.id,
      gameName: gameRef.name,
      entityCount: entities.length,
    },
  };
}
