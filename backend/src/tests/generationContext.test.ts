import { describe, expect, test, jest, beforeEach } from '@jest/globals';

jest.mock('../services/ragService');
jest.mock('../services/gameService');

import { buildReferenceContext } from '../services/generationContext';
import { retrieve, RetrievedChunk } from '../services/ragService';
import { getOwnedGame } from '../services/gameService';

const mockRetrieve = retrieve as jest.MockedFunction<typeof retrieve>;
const mockGetOwnedGame = getOwnedGame as jest.MockedFunction<typeof getOwnedGame>;

// A real ObjectId shape — buildReferenceContext rejects malformed ids outright.
const GAME_ID = '507f1f77bcf86cd799439011';

const chunk = (entity: string, text: string): RetrievedChunk => ({
  text, score: 0.8, docId: 'doc1', title: 'Bestiary', entity, entityRole: 'boss',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ownedGame = { _id: GAME_ID, name: 'Ashfall' } as any;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('buildReferenceContext grounding', () => {
  test('reports no-game when nothing is linked', async () => {
    const result = await buildReferenceContext({ ownerId: 'u1', step: 'nodeEdit', query: 'q' });
    expect(result.grounding).toEqual({ consulted: false, reason: 'no-game', entityCount: 0, gameId: undefined, gameName: undefined });
    expect(result.referenceBlock).toBe('');
  });

  test('reports no-game for a malformed id instead of throwing a cast error', async () => {
    const result = await buildReferenceContext({ ownerId: 'u1', gameId: 'not-an-id', step: 'nodeEdit', query: 'q' });
    expect(result.grounding.reason).toBe('no-game');
    expect(mockGetOwnedGame).not.toHaveBeenCalled();
  });

  test('reports not-owned when the game is not the caller’s', async () => {
    mockGetOwnedGame.mockResolvedValue(null);
    const result = await buildReferenceContext({ ownerId: 'u1', gameId: GAME_ID, step: 'nodeEdit', query: 'q' });
    expect(result.grounding.reason).toBe('not-owned');
    expect(result.grounding.consulted).toBe(false);
  });

  test('reports no-matches, naming the game, when retrieval comes back empty', async () => {
    mockGetOwnedGame.mockResolvedValue(ownedGame);
    mockRetrieve.mockResolvedValue([]);
    const result = await buildReferenceContext({ ownerId: 'u1', gameId: GAME_ID, step: 'nodeEdit', query: 'q' });
    expect(result.grounding).toMatchObject({ consulted: false, reason: 'no-matches', gameName: 'Ashfall' });
    expect(result.referenceBlock).toBe('');
  });

  test('reports consulted with the entity count when material comes back', async () => {
    mockGetOwnedGame.mockResolvedValue(ownedGame);
    mockRetrieve.mockImplementation(async ({ type }) =>
      type === 'monsters' ? [chunk('Balrog', 'Balrog (boss); hp: 500')] : [],
    );

    const result = await buildReferenceContext({ ownerId: 'u1', gameId: GAME_ID, step: 'nodeEdit', query: 'q' });

    expect(result.grounding).toMatchObject({ consulted: true, gameName: 'Ashfall', entityCount: 1 });
    expect(result.entities).toEqual([{ name: 'Balrog', role: 'boss', type: 'monsters' }]);
    expect(result.referenceBlock).toContain('Existing monsters & enemies');
    expect(result.referenceBlock).toContain('Balrog');
  });

  test('a failing category degrades to no material rather than failing the edit', async () => {
    mockGetOwnedGame.mockResolvedValue(ownedGame);
    mockRetrieve.mockRejectedValue(new Error('qdrant down'));
    const result = await buildReferenceContext({ ownerId: 'u1', gameId: GAME_ID, step: 'nodeEdit', query: 'q' });
    expect(result.grounding.reason).toBe('no-matches');
  });
});

describe('nodeEdit retrieval step', () => {
  test('queries the castable types deepest, and includes lore/general', async () => {
    mockGetOwnedGame.mockResolvedValue(ownedGame);
    mockRetrieve.mockResolvedValue([]);

    await buildReferenceContext({ ownerId: 'u1', gameId: GAME_ID, step: 'nodeEdit', query: 'q' });

    const asked = new Map(
      mockRetrieve.mock.calls.map(([opts]) => [opts.type, opts.topK]),
    );
    expect(asked.get('characters')).toBe(4);
    expect(asked.get('monsters')).toBe(4);
    expect(asked.get('items')).toBe(4);
    // Lore and general matter here because a KB may describe its cast only in
    // prose world documents — the questline step never queries them.
    expect(asked.has('lore')).toBe(true);
    expect(asked.has('general')).toBe(true);
  });
});
