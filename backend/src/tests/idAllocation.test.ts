import mongoose from 'mongoose';
import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import initApp from '../server';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import ProjectModel from '../models/projectModel';
import QuestlineModel from '../models/questlineModel';
import { allocateId, allocateIds, usedIds } from '../services/idAllocationService';

const OWNER = 'owner-id-allocation-test';
let projectId: string;

async function makeProject(ranges: {
  npc?: Array<{ min: number; max: number }>;
  item?: Array<{ min: number; max: number }>;
  quest?: Array<{ min: number; max: number }>;
}): Promise<string> {
  const project = await ProjectModel.create({
    ownerId: OWNER,
    name: 'Allocation Test',
    mapleSettings: {
      npcIdRanges: ranges.npc ?? [],
      itemIdRanges: ranges.item ?? [],
      questIdRanges: ranges.quest ?? [],
    },
  });
  return String(project._id);
}

beforeAll(async () => {
  await initApp();
  const dbName = mongoose.connection.name.toLowerCase();
  if (!dbName.includes('test')) {
    throw new Error(`Refusing to run against non-test database "${mongoose.connection.name}"`);
  }
});

beforeEach(async () => {
  await Promise.all([
    ProjectModel.deleteMany({ ownerId: OWNER }),
    CharacterModel.deleteMany({ ownerId: OWNER }),
    ItemModel.deleteMany({ ownerId: OWNER }),
    QuestlineModel.deleteMany({ ownerId: OWNER }),
  ]);
  projectId = await makeProject({ npc: [{ min: 9900000, max: 9900009 }] });
});

afterAll(async () => {
  await Promise.all([
    ProjectModel.deleteMany({ ownerId: OWNER }),
    CharacterModel.deleteMany({ ownerId: OWNER }),
    ItemModel.deleteMany({ ownerId: OWNER }),
    QuestlineModel.deleteMany({ ownerId: OWNER }),
  ]);
  await mongoose.connection.close();
});

describe('id allocation', () => {
  test('allocates inside the configured range', async () => {
    const { id, error } = await allocateId({ projectId, type: 'npc' });
    expect(error).toBe('');
    expect(id).toBeGreaterThanOrEqual(9900000);
    expect(id).toBeLessThanOrEqual(9900009);
  });

  test('never hands out an id another design already holds', async () => {
    await CharacterModel.create({
      ownerId: OWNER, projectId, kind: 'npc', name: 'Taken', maple: { mapleId: 9900003 },
    });
    for (let i = 0; i < 12; i += 1) {
      const { id } = await allocateId({ projectId, type: 'npc' });
      expect(id).not.toBe(9900003);
    }
  });

  // The blind spot that let two designs share 9900000: a KB-grounded design
  // carries the game's id in customFields, which the old scan never read.
  test('treats an id held only in customFields as used', async () => {
    await CharacterModel.create({
      ownerId: OWNER, projectId, kind: 'npc', name: 'From KB', customFields: { id: 9900004 },
    });
    expect(await usedIds(projectId, 'npc')).toContain(9900004);
    for (let i = 0; i < 12; i += 1) {
      const { id } = await allocateId({ projectId, type: 'npc' });
      expect(id).not.toBe(9900004);
    }
  });

  test("a monster's id is not offered to an NPC", async () => {
    await CharacterModel.create({
      ownerId: OWNER, projectId, kind: 'monster', name: 'Mob', maple: { mapleId: 9900007 },
    });
    for (let i = 0; i < 12; i += 1) {
      const { id } = await allocateId({ projectId, type: 'npc' });
      expect(id).not.toBe(9900007);
    }
  });

  test('a batch hands out distinct ids', async () => {
    const { ids, error } = await allocateIds({ projectId, type: 'npc', count: 10 });
    expect(error).toBe('');
    expect(new Set(ids).size).toBe(10);
    expect(ids.every((id) => id >= 9900000 && id <= 9900009)).toBe(true);
  });

  test('honours ids already handed out but not yet written', async () => {
    const taken = [9900000, 9900001, 9900002, 9900003, 9900004, 9900005, 9900006, 9900007, 9900008];
    const { id } = await allocateId({ projectId, type: 'npc', taken });
    expect(id).toBe(9900009);
  });

  test('reports exhaustion rather than repeating an id', async () => {
    const { ids } = await allocateIds({ projectId, type: 'npc', count: 10 });
    const { id, error } = await allocateId({ projectId, type: 'npc', taken: ids });
    expect(id).toBe(0);
    expect(error).toMatch(/already in use/);
  });

  test('explains an unconfigured pool instead of allocating', async () => {
    const { id, error } = await allocateId({ projectId, type: 'item' });
    expect(id).toBe(0);
    expect(error).toMatch(/No item ID range is configured/);
  });

  test('a malformed project id is a missing pool, not a crash', async () => {
    const { id, error } = await allocateId({ projectId: 'not-an-object-id', type: 'npc' });
    expect(id).toBe(0);
    expect(error).toMatch(/No npc ID range is configured/);
  });

  test('quest ids come from the quest pool and avoid ids other questlines hold', async () => {
    const questProject = await makeProject({ quest: [{ min: 20000, max: 20004 }] });
    await QuestlineModel.create({
      ownerId: OWNER,
      projectId: questProject,
      title: 'Existing',
      nodes: [{ nodeId: '1', title: 'a', body: 'b', exportFields: { questId: 20002 } }],
    });
    const { ids, error } = await allocateIds({ projectId: questProject, type: 'quest', count: 4 });
    expect(error).toBe('');
    expect(ids).not.toContain(20002);
    expect(new Set(ids).size).toBe(4);
  });

  // The manual Allocate button returned the same first-of-pool id on every
  // click, because nothing is written until the author saves. Successive draws
  // must differ once the caller reports what it already holds.
  test('successive draws differ rather than repeating the pool floor', async () => {
    const seen = new Set<number>();
    for (let i = 0; i < 8; i += 1) {
      const { id } = await allocateId({ projectId, type: 'npc', taken: seen });
      seen.add(id);
    }
    expect(seen.size).toBe(8);
  });

  test('spreads across several ranges', async () => {
    const split = await makeProject({ npc: [{ min: 100, max: 101 }, { min: 500, max: 501 }] });
    const { ids } = await allocateIds({ projectId: split, type: 'npc', count: 4 });
    expect([...ids].sort((a, b) => a - b)).toEqual([100, 101, 500, 501]);
  });
});
