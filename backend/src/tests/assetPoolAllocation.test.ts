import mongoose from 'mongoose';
import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import initApp from '../server';
import CharacterModel from '../models/characterModel';
import ItemModel from '../models/itemModel';
import ProjectModel from '../models/projectModel';
import {
  allocateAssetFields,
  allocatePoolValue,
  poolBindings,
  usedPoolValues,
} from '../services/assetPoolAllocation';

const OWNER = 'owner-pool-allocation-test';

// Nothing here is called "id" by accident: the point is that allocation follows
// whatever the project declares and binds to a pool, not a known field name.
const schema = {
  valuePools: [
    { key: 'npcNumbers', name: 'NPC numbers', valueType: 'number', options: [], ranges: [{ min: 100, max: 109 }] },
    { key: 'lootCodes', name: 'Loot codes', valueType: 'number', options: [], ranges: [{ min: 500, max: 504 }] },
    { key: 'labels', name: 'Labels', valueType: 'text', options: [], ranges: [] },
  ],
  assetTypes: [
    {
      key: 'npc',
      name: 'NPC',
      fields: [
        { key: 'gameRef', label: 'Game ref', type: 'number', required: true, nullable: false, poolKey: 'npcNumbers' },
        { key: 'nickname', label: 'Nickname', type: 'text', required: false, nullable: true, poolKey: 'labels' },
      ],
    },
    {
      key: 'monster',
      name: 'Monster',
      fields: [
        // Same pool as the npc field above, under a different name.
        { key: 'mobRef', label: 'Mob ref', type: 'number', required: true, nullable: false, poolKey: 'npcNumbers' },
      ],
    },
    {
      key: 'item',
      name: 'Item',
      fields: [
        {
          key: 'meta',
          label: 'Meta',
          type: 'object',
          required: false,
          nullable: true,
          fields: [
            { key: 'code', label: 'Code', type: 'number', required: true, nullable: false, poolKey: 'lootCodes' },
          ],
        },
      ],
    },
  ],
};

let projectId: string;

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
  ]);
  const project = await ProjectModel.create({ ownerId: OWNER, name: 'Pool Test', assetSchema: schema });
  projectId = String(project._id);
});

afterAll(async () => {
  await Promise.all([
    ProjectModel.deleteMany({ ownerId: OWNER }),
    CharacterModel.deleteMany({ ownerId: OWNER }),
    ItemModel.deleteMany({ ownerId: OWNER }),
  ]);
  await mongoose.connection.close();
});

describe('value pool allocation', () => {
  test('finds every field bound to a pool, across asset types and nesting', async () => {
    expect(poolBindings(schema as never, 'npcNumbers')).toEqual([
      { assetType: 'npc', path: ['gameRef'] },
      { assetType: 'monster', path: ['mobRef'] },
    ]);
    expect(poolBindings(schema as never, 'lootCodes')).toEqual([
      { assetType: 'item', path: ['meta', 'code'] },
    ]);
  });

  test('allocates inside the pool the field is bound to', async () => {
    const { value, error } = await allocatePoolValue({ projectId, assetType: 'npc', path: ['gameRef'] });
    expect(error).toBe('');
    expect(value).toBeGreaterThanOrEqual(100);
    expect(value).toBeLessThanOrEqual(109);
  });

  // The pool is the namespace: a monster holding 103 in its own differently
  // named field means 103 is not free for an npc.
  test('a value held under another field name in the same pool is taken', async () => {
    await CharacterModel.create({
      ownerId: OWNER, projectId, kind: 'monster', name: 'Mob', customFields: { mobRef: 103 },
    });
    expect(await usedPoolValues({ projectId, schema: schema as never, poolKey: 'npcNumbers' })).toContain(103);
    for (let i = 0; i < 12; i += 1) {
      const { value } = await allocatePoolValue({ projectId, assetType: 'npc', path: ['gameRef'] });
      expect(value).not.toBe(103);
    }
  });

  test('separate pools do not interfere', async () => {
    await CharacterModel.create({
      ownerId: OWNER, projectId, kind: 'npc', name: 'A', customFields: { gameRef: 100 },
    });
    const used = await usedPoolValues({ projectId, schema: schema as never, poolKey: 'lootCodes' });
    expect(used.size).toBe(0);
  });

  test('reads a nested pooled field', async () => {
    await ItemModel.create({
      ownerId: OWNER, projectId, name: 'Loot', customFields: { meta: { code: 502 } },
    });
    expect(await usedPoolValues({ projectId, schema: schema as never, poolKey: 'lootCodes' })).toContain(502);
  });

  // Successive clicks of Allocate must differ; a lowest-first scan returned the
  // floor of the pool every time because nothing is written until save.
  test('successive draws differ rather than repeating the pool floor', async () => {
    const seen = new Set<number>();
    for (let i = 0; i < 8; i += 1) {
      const { value } = await allocatePoolValue({
        projectId, assetType: 'npc', path: ['gameRef'], taken: seen,
      });
      seen.add(value);
    }
    expect(seen.size).toBe(8);
  });

  test('reports exhaustion instead of repeating a value', async () => {
    const taken = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    const { value, error } = await allocatePoolValue({
      projectId, assetType: 'npc', path: ['gameRef'], taken,
    });
    expect(value).toBe(0);
    expect(error).toMatch(/No available values remain/);
  });

  test('refuses a field with no pool rather than inventing one', async () => {
    const { value, error } = await allocatePoolValue({ projectId, assetType: 'npc', path: ['name'] });
    expect(value).toBe(0);
    expect(error).toMatch(/not associated with a value pool/);
  });

  test('a text pool is not allocatable', async () => {
    const { value, error } = await allocatePoolValue({ projectId, assetType: 'npc', path: ['nickname'] });
    expect(value).toBe(0);
    expect(error).toMatch(/no numeric ranges/);
  });

  describe('filling an asset', () => {
    test('fills every numeric pooled field the schema declares', async () => {
      const { values, allocated } = await allocateAssetFields({ projectId, assetType: 'item' });
      expect(allocated).toHaveLength(1);
      expect((values.meta as Record<string, unknown>).code).toBeGreaterThanOrEqual(500);
    });

    test('keeps a value the caller already supplied', async () => {
      const { values, allocated } = await allocateAssetFields({
        projectId, assetType: 'npc', values: { gameRef: 107 },
      });
      expect(values.gameRef).toBe(107);
      expect(allocated).toHaveLength(0);
    });

    test('does not touch fields bound to a non-numeric pool', async () => {
      const { values } = await allocateAssetFields({ projectId, assetType: 'npc' });
      expect(values.nickname).toBeUndefined();
    });

    test('an asset type with no pooled fields is left alone', async () => {
      const { values, allocated } = await allocateAssetFields({
        projectId, assetType: 'unknownType', values: { keep: 'me' },
      });
      expect(values).toEqual({ keep: 'me' });
      expect(allocated).toHaveLength(0);
    });

    test('does not reuse a value handed out earlier in the same batch', async () => {
      const taken = new Set<number>();
      const results = [];
      for (let i = 0; i < 5; i += 1) {
        const { values } = await allocateAssetFields({ projectId, assetType: 'npc', taken });
        results.push(values.gameRef as number);
      }
      expect(new Set(results).size).toBe(5);
    });
  });
});
