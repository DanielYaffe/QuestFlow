import mongoose from 'mongoose';
import { describe, expect, jest, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import initApp from '../server';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import { materializeDesigns, ProposedDesign } from '../services/designMaterialization';
import KbDocumentModel from '../models/kbDocumentModel';
import { qdrant } from '../services/qdrant';

const OWNER = 'owner-materialize-test';
const PROJECT = 'project-materialize-test';
const GAME = 'game123';
const VALID_GAME = '507f1f77bcf86cd799439011';

const propose = (p: Partial<ProposedDesign> & { tempId: string; name: string }): ProposedDesign => ({
  kind: 'npc',
  ...p,
});

const run = (proposals: ProposedDesign[], gameId = GAME) =>
  materializeDesigns({ ownerId: OWNER, projectId: PROJECT, gameId, proposals });

beforeAll(async () => {
  await initApp();
  const dbName = mongoose.connection.name.toLowerCase();
  if (!dbName.includes('test')) {
    throw new Error(`Refusing to run against non-test database "${mongoose.connection.name}"`);
  }
});

beforeEach(async () => {
  // Scoped to this suite's project so a shared test DB stays intact.
  await CharacterModel.deleteMany({ projectId: PROJECT });
  await ItemModel.deleteMany({ projectId: PROJECT });
});

afterAll(async () => {
  await CharacterModel.deleteMany({ projectId: PROJECT });
  await ItemModel.deleteMany({ projectId: PROJECT });
  await KbDocumentModel.deleteMany({ gameId: VALID_GAME });
  await mongoose.connection.close();
});

describe('materializeDesigns — creating', () => {
  test('copies exact KB fields and the canonical id into a materialized Studio character', async () => {
    const kbDoc = await KbDocumentModel.create({
      gameId: VALID_GAME,
      type: 'characters',
      title: 'NPCs',
      originalText: '## Elder Maru\nid: 9001\nfaction: Council',
      status: 'ready',
    });

    try {
      const { ids } = await run([
        propose({ tempId: 'ent-kb', name: 'Elder Maru', kbRef: 'Elder Maru' }),
      ], VALID_GAME);
      const doc = await CharacterModel.findById(ids['ent-kb']);
      expect(doc?.customFields).toMatchObject({ id: 9001, faction: 'Council' });
      expect(doc?.maple.mapleId).toBe(9001);
    } finally {
      await KbDocumentModel.deleteOne({ _id: kbDoc._id });
    }
  });

  // The observed production failure: a document re-uploaded with richer fields
  // leaves the old vector payload in place until a re-embed runs, so the payload
  // has no id at all. Identity comes from the document, so this still resolves.
  test('reads the canonical id from the source document, not a stale vector payload', async () => {
    const kbDoc = await KbDocumentModel.create({
      gameId: VALID_GAME,
      type: 'characters',
      title: 'NPCs',
      originalText: JSON.stringify([{ name: 'FortySeven', id: 2000, kind: 'npc' }]),
      status: 'ready',
    });
    const scroll = jest.spyOn(qdrant, 'scroll').mockResolvedValue({
      points: [{
        id: 'stale-point',
        payload: {
          entity: 'FortySeven',
          docId: String(kbDoc._id),
          // What the live KB actually holds: embedded before ids existed.
          fields: { kind: 'npc', summary: 'FortySeven is an NPC.' },
        },
      }],
      next_page_offset: null,
    } as Awaited<ReturnType<typeof qdrant.scroll>>);

    try {
      const { ids } = await run([
        propose({ tempId: 'ent-stale', name: 'FortySeven', kbRef: 'FortySeven' }),
      ], VALID_GAME);
      const doc = await CharacterModel.findById(ids['ent-stale']);
      expect(doc?.customFields).toMatchObject({ id: 2000 });
      expect(doc?.maple.mapleId).toBe(2000);
    } finally {
      scroll.mockRestore();
      await KbDocumentModel.deleteOne({ _id: kbDoc._id });
    }
  });

  test('creates a character and stamps the KB provenance tag', async () => {
    const { ids, designs } = await run([
      propose({ tempId: 'ent-1', kind: 'monster', name: 'Balrog', appearance: 'shadow and flame', lore: 'ancient terror', kbRef: 'Balrog' }),
    ]);

    const doc = await CharacterModel.findById(ids['ent-1']);
    expect(doc?.name).toBe('Balrog');
    expect(doc?.kind).toBe('monster');
    expect(doc?.appearance).toBe('shadow and flame');
    expect(doc?.kbRef).toBe(`${GAME}:Balrog`);
    expect(designs[0].created).toBe(true);
    expect(designs[0].kbRef).toBe(`${GAME}:Balrog`);
  });

  test('creates an item with its rarity and tag', async () => {
    const { ids, designs } = await run([
      propose({ tempId: 'ent-1', kind: 'item', name: 'Emberfang', description: 'quenched in dragonfire', rarity: 'epic', kbRef: 'Emberfang' }),
    ]);

    const doc = await ItemModel.findById(ids['ent-1']);
    expect(doc?.name).toBe('Emberfang');
    expect(doc?.rarity).toBe('epic');
    expect(doc?.kbRef).toBe(`${GAME}:Emberfang`);
    expect(designs[0].kind).toBe('item');
    // The character collection must not have been touched.
    expect(await CharacterModel.countDocuments({ projectId: PROJECT })).toBe(0);
  });

  test('leaves kbRef empty when the questline has no linked game', async () => {
    const { ids } = await run([propose({ tempId: 'ent-1', name: 'Wanderer', kbRef: 'Wanderer' })], '');
    const doc = await CharacterModel.findById(ids['ent-1']);
    expect(doc?.kbRef).toBe('');
  });

  test('skips a proposal with a blank name rather than writing a nameless design', async () => {
    const { ids, designs } = await run([propose({ tempId: 'ent-1', name: '   ' })]);
    expect(designs).toHaveLength(0);
    expect(ids['ent-1']).toBeUndefined();
    expect(await CharacterModel.countDocuments({ projectId: PROJECT })).toBe(0);
  });
});

describe('materializeDesigns — linking instead of duplicating', () => {
  test('links an explicitly named existing design', async () => {
    const existing = await CharacterModel.create({ ownerId: OWNER, projectId: PROJECT, kind: 'npc', name: 'Elder Maru' });

    const { ids, designs } = await run([
      propose({ tempId: 'ent-1', name: 'Someone Else', existingId: String(existing._id) }),
    ]);

    expect(ids['ent-1']).toBe(String(existing._id));
    expect(designs[0].created).toBe(false);
    expect(await CharacterModel.countDocuments({ projectId: PROJECT })).toBe(1);
  });

  test('ignores an existingId belonging to another project', async () => {
    const foreign = await CharacterModel.create({ ownerId: OWNER, projectId: 'someone-elses-project', kind: 'npc', name: 'Outsider' });

    const { ids } = await run([propose({ tempId: 'ent-1', name: 'Outsider', existingId: String(foreign._id) })]);

    expect(ids['ent-1']).not.toBe(String(foreign._id));
    await CharacterModel.deleteMany({ projectId: 'someone-elses-project' });
  });

  test('links a design already materialized from the same KB entity', async () => {
    const first = await run([propose({ tempId: 'ent-1', kind: 'monster', name: 'Balrog', kbRef: 'Balrog' })]);
    // A later edit names the same entity with different prose.
    const second = await run([propose({ tempId: 'ent-9', kind: 'monster', name: 'The Balrog', kbRef: 'Balrog' })]);

    expect(second.ids['ent-9']).toBe(first.ids['ent-1']);
    expect(second.designs[0].created).toBe(false);
    expect(await CharacterModel.countDocuments({ projectId: PROJECT })).toBe(1);
  });

  test('links a hand-made design by name and backfills its kbRef', async () => {
    const handMade = await CharacterModel.create({
      ownerId: OWNER, projectId: PROJECT, kind: 'monster', name: 'balrog', kbRef: '',
    });

    const { ids, designs } = await run([
      propose({ tempId: 'ent-1', kind: 'monster', name: 'Balrog', kbRef: 'Balrog' }),
    ]);

    expect(ids['ent-1']).toBe(String(handMade._id));
    expect(designs[0].created).toBe(false);
    expect(designs[0].kbRef).toBe(`${GAME}:Balrog`);

    const reloaded = await CharacterModel.findById(handMade._id);
    expect(reloaded?.kbRef).toBe(`${GAME}:Balrog`);
    expect(await CharacterModel.countDocuments({ projectId: PROJECT })).toBe(1);
  });

  test('links an item by name, matching the character behaviour', async () => {
    const existing = await ItemModel.create({ ownerId: OWNER, projectId: PROJECT, name: 'Emberfang' });
    const { ids } = await run([propose({ tempId: 'ent-1', kind: 'item', name: 'emberfang' })]);

    expect(ids['ent-1']).toBe(String(existing._id));
    expect(await ItemModel.countDocuments({ projectId: PROJECT })).toBe(1);
  });

  test('does not overwrite a kbRef that already points elsewhere', async () => {
    const existing = await CharacterModel.create({
      ownerId: OWNER, projectId: PROJECT, kind: 'npc', name: 'Maru', kbRef: `${GAME}:Different Entity`,
    });

    await run([propose({ tempId: 'ent-1', name: 'Maru', kbRef: 'Elder Maru' })]);

    const reloaded = await CharacterModel.findById(existing._id);
    expect(reloaded?.kbRef).toBe(`${GAME}:Different Entity`);
  });

  test('a name shared across kinds stays two designs — node slots are kind-specific', async () => {
    await CharacterModel.create({ ownerId: OWNER, projectId: PROJECT, kind: 'npc', name: 'Ash' });

    const { ids } = await run([propose({ tempId: 'ent-1', kind: 'monster', name: 'Ash' })]);

    const created = await CharacterModel.findById(ids['ent-1']);
    expect(created?.kind).toBe('monster');
    expect(await CharacterModel.countDocuments({ projectId: PROJECT })).toBe(2);
  });

  test('the same design referenced twice in one batch yields one document', async () => {
    const { ids } = await run([
      propose({ tempId: 'ent-1', kind: 'monster', name: 'Balrog', kbRef: 'Balrog' }),
      propose({ tempId: 'ent-2', kind: 'monster', name: 'Balrog', kbRef: 'Balrog' }),
    ]);

    expect(ids['ent-1']).toBe(ids['ent-2']);
    expect(await CharacterModel.countDocuments({ projectId: PROJECT })).toBe(1);
  });

  test('an empty proposal list touches nothing', async () => {
    const result = await run([]);
    expect(result).toEqual({ ids: {}, designs: [], allocationWarnings: [] });
  });
});
