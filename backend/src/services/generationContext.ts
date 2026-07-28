import { KbType } from './qdrant';
import { retrieve, RetrievedChunk } from './ragService';
import { ownsGame } from './gameService';
import { DifficultyBucket } from './structuredParse';

// ---------------------------------------------------------------------------
// Reference-context assembly (§5.3) — gather optional KB material for one
// generation step. Never an allowlist: the block explicitly invites invention,
// and an empty/missing KB yields '' so generation runs exactly as before.
// ---------------------------------------------------------------------------

export type GenerationStep = 'objectives' | 'characters' | 'questline';

export interface ReferenceEntity {
  name: string;
  role?: string;
  type: KbType;
}

export interface ReferenceContext {
  referenceBlock: string;
  entities: ReferenceEntity[];
}

const EMPTY: ReferenceContext = { referenceBlock: '', entities: [] };

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
 * is retrieved — generation then runs free, exactly as without a KB.
 */
export async function buildReferenceContext(args: {
  ownerId: string;
  gameId?: string;
  step: GenerationStep;
  query: string;
  progression?: DifficultyBucket;
}): Promise<ReferenceContext> {
  const { ownerId, gameId, step, query, progression } = args;
  if (!gameId) return EMPTY;
  if (!(await ownsGame(ownerId, gameId))) return EMPTY;

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

  if (sections.length === 0) return EMPTY;

  const referenceBlock = `
REFERENCE MATERIAL (optional) — existing data from this game's world:
${sections.join('\n\n')}

You MAY use or take inspiration from the material above, and you may also freely invent new elements that fit this world. When something you need already exists above, prefer referencing the existing entity over re-creating a near-duplicate.${progression ? `\nThis quest is aimed at the ${progression} game, so lean toward references of a fitting difficulty — but this is a preference, not a rule.` : ''}`;

  return { referenceBlock, entities };
}
