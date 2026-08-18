import { describe, expect, jest, test } from '@jest/globals';

jest.mock('../services/qdrant', () => ({
  KB_TYPES: ['monsters', 'characters', 'maps', 'items', 'quests', 'lore', 'general'],
  collectionName: (gameId: string, type: string) => `kb_${gameId}_${type}`,
  qdrant: { scroll: jest.fn() },
}));

import {
  applyEntityMappings,
  NormalizedMappedEntity,
  questGiverRefId,
  TemplateMappingEntry,
} from '../services/templateEntityMappingService';

const mappings: TemplateMappingEntry[] = [
  {
    templatePath: 'npcId',
    kbType: 'characters',
    kbFieldPath: 'fields.id',
    valueType: 'number',
    purpose: 'dialogSpeakerId',
    explanation: '',
  },
  {
    templatePath: 'kills[].id',
    kbType: 'monsters',
    kbFieldPath: 'fields.id',
    valueType: 'number',
    purpose: 'requirementEntityId',
    explanation: '',
  },
  {
    templatePath: 'kills[].level',
    kbType: 'monsters',
    kbFieldPath: 'fields.level',
    valueType: 'number',
    purpose: 'level',
    explanation: '',
  },
];

const dialogSpeakerMapping: TemplateMappingEntry = {
  templatePath: 'dialogPages[].npcId',
  kbType: 'characters',
  kbFieldPath: 'fields.id',
  valueType: 'number',
  purpose: 'dialogSpeakerId',
  explanation: '',
};

function entity(patch: Partial<NormalizedMappedEntity>): NormalizedMappedEntity {
  return {
    refId: 'entity-1',
    kbType: 'characters',
    name: 'Entity',
    hasProjectSource: true,
    ...patch,
  };
}

describe('template entity mappings', () => {
  test('project custom fields win over exact KB fields', () => {
    const result = applyEntityMappings({
      mappings,
      entities: [entity({ projectFields: { id: 42 }, kbFields: { id: 7 } })],
      refIds: ['entity-1'],
    });
    expect(result.values.npcId).toBe(42);
    expect(result.sources.npcId).toMatchObject({ source: 'kbMapping', origins: ['project'] });
  });

  test('falls back to exact KB fields for a project entity', () => {
    const result = applyEntityMappings({
      mappings,
      entities: [entity({ projectFields: {}, kbFields: { id: 7 } })],
      refIds: ['entity-1'],
    });
    expect(result.values.npcId).toBe(7);
    expect(result.sources.npcId).toMatchObject({ origins: ['kb'] });
  });

  // maple.mapleId is itself a copy of a KB id taken at materialization time. If
  // the KB file was re-uploaded since, that copy is the stale one — the live KB
  // has to win, or the export carries an id the game no longer uses.
  test('a stale stored id does not outrank the current KB value', () => {
    const result = applyEntityMappings({
      mappings,
      entities: [entity({ projectFields: {}, canonicalFields: { id: 9270033 }, kbFields: { id: 9201074 } })],
      refIds: ['entity-1'],
    });
    expect(result.values.npcId).toBe(9201074);
    expect(result.sources.npcId).toMatchObject({ origins: ['kb'] });
  });

  test('falls back to the stored id when the KB has none', () => {
    const result = applyEntityMappings({
      mappings,
      entities: [entity({ projectFields: {}, canonicalFields: { id: 4242 }, kbFields: { faction: 'Council' } })],
      refIds: ['entity-1'],
    });
    expect(result.values.npcId).toBe(4242);
  });

  test('preserves manual values even when empty', () => {
    const result = applyEntityMappings({
      values: { npcId: '' },
      sources: { npcId: { source: 'manual' } },
      mappings,
      entities: [entity({ projectFields: { id: 42 } })],
      refIds: ['entity-1'],
    });
    expect(result.values.npcId).toBe('');
    expect(result.sources.npcId).toEqual({ source: 'manual' });
  });

  test('preserves a manually edited mapped array as a unit', () => {
    const kills = [{ id: 999, level: 99, amount: 1 }];
    const result = applyEntityMappings({
      values: { kills },
      sources: { kills: { source: 'manual' } },
      mappings,
      entities: [entity({ refId: 'm1', kbType: 'monsters', projectFields: { id: 11, level: 5 } })],
      refIds: ['m1'],
    });
    expect(result.values.kills).toEqual(kills);
    expect(result.sources.kills).toEqual({ source: 'manual' });
  });

  test('uses the first matching scalar reference in node order', () => {
    const result = applyEntityMappings({
      mappings,
      entities: [
        entity({ refId: 'first', projectFields: { id: 1 } }),
        entity({ refId: 'second', projectFields: { id: 2 } }),
      ],
      refIds: ['second', 'first'],
    });
    expect(result.values.npcId).toBe(2);
  });

  test('creates one array row per matching entity and keeps fields grouped', () => {
    const result = applyEntityMappings({
      values: { kills: [{ amount: 3 }] },
      mappings,
      entities: [
        entity({ refId: 'm1', kbType: 'monsters', name: 'One', projectFields: { id: 11, level: 5 } }),
        entity({ refId: 'm2', kbType: 'monsters', name: 'Two', projectFields: { id: 22, level: 8 } }),
      ],
      refIds: ['m1', 'm2'],
    });
    expect(result.values.kills).toEqual([
      { amount: 3, id: 11, level: 5 },
      { id: 22, level: 8 },
    ]);
    expect(result.sources['kills[].id']).toMatchObject({ entityIds: ['m1', 'm2'] });
  });

  test('broadcasts a dialog speaker id to every existing dialog page', () => {
    const result = applyEntityMappings({
      values: {
        dialogPages: [
          { id: 'page-1', prompt: 'Hello' },
          { id: 'page-2', prompt: 'Come with me' },
          { id: 'page-3', prompt: 'Be careful' },
        ],
      },
      mappings: [dialogSpeakerMapping],
      entities: [entity({ projectFields: { id: 42 } })],
      refIds: ['entity-1'],
    });
    expect(result.values.dialogPages).toEqual([
      { id: 'page-1', prompt: 'Hello', npcId: 42 },
      { id: 'page-2', prompt: 'Come with me', npcId: 42 },
      { id: 'page-3', prompt: 'Be careful', npcId: 42 },
    ]);
    expect(result.sources['dialogPages[].npcId']).toMatchObject({ entityIds: ['entity-1'] });
  });

  // `purpose` is free text the template analyzer writes, so the broadcast
  // decision cannot depend on it matching a magic string. One referenced NPC is
  // the speaker of every page regardless of how the mapping was worded.
  test('broadcasts to every page when the mapping purpose is worded differently', () => {
    const result = applyEntityMappings({
      values: {
        'dialogue.start.pages': [
          { id: 'page_1', prompt: 'Hello' },
          { id: 'page_2', prompt: 'Take this' },
        ],
      },
      mappings: [{
        templatePath: 'dialogue.start.pages[].npcId',
        kbType: 'characters',
        kbFieldPath: 'fields.id',
        valueType: 'number',
        purpose: 'The NPC this dialogue page is spoken by',
        explanation: '',
      }],
      entities: [entity({ projectFields: { id: 9001 } })],
      refIds: ['entity-1'],
    });
    expect(result.values['dialogue.start.pages']).toEqual([
      { id: 'page_1', prompt: 'Hello', npcId: 9001 },
      { id: 'page_2', prompt: 'Take this', npcId: 9001 },
    ]);
  });

  test('still broadcasts when the node also references entities of other types', () => {
    const result = applyEntityMappings({
      values: { dialogPages: [{ id: 'page-1' }, { id: 'page-2' }] },
      mappings: [dialogSpeakerMapping],
      entities: [
        entity({ refId: 'npc', projectFields: { id: 42 } }),
        entity({ refId: 'mob', kbType: 'monsters', projectFields: { id: 77 } }),
      ],
      refIds: ['npc', 'mob'],
    });
    expect(result.values.dialogPages).toEqual([
      { id: 'page-1', npcId: 42 },
      { id: 'page-2', npcId: 42 },
    ]);
  });

  // A quest node is handed out by one NPC, so several cast characters do not
  // become several speakers — the first in node order speaks every page.
  test('uses one speaker on every page when the node casts several characters', () => {
    const result = applyEntityMappings({
      values: { dialogPages: [{ id: 'page-1' }, { id: 'page-2' }] },
      mappings: [dialogSpeakerMapping],
      entities: [
        entity({ refId: 'a', projectFields: { id: 1 } }),
        entity({ refId: 'b', projectFields: { id: 2 } }),
      ],
      refIds: ['a', 'b'],
    });
    expect(result.values.dialogPages).toEqual([
      { id: 'page-1', npcId: 1 },
      { id: 'page-2', npcId: 1 },
    ]);
  });

  // Monsters and items are genuinely per-row: kill three of one, five of another.
  test('still lays out one row per entity for monsters', () => {
    const result = applyEntityMappings({
      values: { kills: [] },
      mappings,
      entities: [
        entity({ refId: 'm1', kbType: 'monsters', name: 'One', projectFields: { id: 11, level: 5 } }),
        entity({ refId: 'm2', kbType: 'monsters', name: 'Two', projectFields: { id: 22, level: 8 } }),
      ],
      refIds: ['m1', 'm2'],
    });
    expect(result.values.kills).toEqual([{ id: 11, level: 5 }, { id: 22, level: 8 }]);
  });

  // A quest is handed out by one NPC, and every node of it is dialogue with that
  // NPC — so a combat or collect node that casts nobody still needs a speaker.
  test('falls back to the quest giver on a node that casts no character', () => {
    const giver = entity({ refId: 'giver', name: 'Eliav', projectFields: { id: 9900005 } });
    const result = applyEntityMappings({
      values: { dialogPages: [{ id: 'p1' }, { id: 'p2' }] },
      mappings: [dialogSpeakerMapping],
      entities: [giver, entity({ refId: 'mob', kbType: 'monsters', projectFields: { id: 3230301 } })],
      refIds: ['mob'],
      questGiver: giver,
    });
    expect(result.values.dialogPages).toEqual([
      { id: 'p1', npcId: 9900005 },
      { id: 'p2', npcId: 9900005 },
    ]);
  });

  test('a node that casts its own character keeps that speaker', () => {
    const giver = entity({ refId: 'giver', name: 'Eliav', projectFields: { id: 9900005 } });
    const result = applyEntityMappings({
      values: { dialogPages: [{ id: 'p1' }] },
      mappings: [dialogSpeakerMapping],
      entities: [giver, entity({ refId: 'eurek', name: 'Eurek', projectFields: { id: 2040050 } })],
      refIds: ['eurek'],
      questGiver: giver,
    });
    expect(result.values.dialogPages).toEqual([{ id: 'p1', npcId: 2040050 }]);
  });

  // A cast NPC that carries no id must not leave the node speakerless — the
  // requirement is an id on every node, not "an id unless the cast is unmapped".
  test('falls back to the giver when the cast character has no id', () => {
    const giver = entity({ refId: 'giver', name: 'Eliav', projectFields: { id: 9900005 } });
    const result = applyEntityMappings({
      values: { dialogPages: [{ id: 'p1' }] },
      mappings: [dialogSpeakerMapping],
      entities: [giver, entity({ refId: 'arami', name: 'Arami', projectFields: {} })],
      refIds: ['arami'],
      questGiver: giver,
    });
    expect(result.values.dialogPages).toEqual([{ id: 'p1', npcId: 9900005 }]);
  });

  test('the quest giver never stands in for a monster or item mapping', () => {
    const giver = entity({ refId: 'giver', projectFields: { id: 9900005 } });
    const result = applyEntityMappings({
      values: { kills: [{ amount: 3 }] },
      mappings,
      entities: [giver],
      refIds: [],
      questGiver: giver,
    });
    expect(result.values.kills).toEqual([{ amount: 3 }]);
  });

  test('clears stale automatic values when a reference is removed', () => {
    const result = applyEntityMappings({
      values: { npcId: 9, kills: [{ id: 10, amount: 2 }] },
      sources: {
        npcId: { source: 'kbMapping' },
        'kills[].id': { source: 'kbMapping' },
      },
      mappings,
      entities: [],
      refIds: [],
    });
    expect(result.values.npcId).toBeUndefined();
    expect(result.values.kills).toEqual([{ amount: 2 }]);
    expect(result.sources.npcId).toBeUndefined();
  });

  test('does not use an entity of the wrong KB type', () => {
    const result = applyEntityMappings({
      mappings,
      entities: [entity({ kbType: 'items', projectFields: { id: 99 } })],
      refIds: ['entity-1'],
    });
    expect(result.values.npcId).toBeUndefined();
  });

  test('coerces a compatible string id to the mapped number type', () => {
    const result = applyEntityMappings({
      mappings,
      entities: [entity({ projectFields: { id: '123' } })],
      refIds: ['entity-1'],
    });
    expect(result.values.npcId).toBe(123);
  });
});

describe('questGiverRefId', () => {
  const edges = [{ source: '1', target: '2' }, { source: '2', target: '3' }];

  test('is the first character cast on the node nothing leads to', () => {
    const nodes = [
      { id: '1', npcIds: ['eliav'] },
      { id: '2', npcIds: ['eurek'] },
      { id: '3', npcIds: [] },
    ];
    expect(questGiverRefId(nodes, edges)).toBe('eliav');
  });

  test('looks further in when the opening scene casts nobody', () => {
    const nodes = [
      { id: '1', npcIds: [] },
      { id: '2', npcIds: ['eurek'] },
    ];
    expect(questGiverRefId(nodes, edges)).toBe('eurek');
  });

  test('is undefined for a questline with no characters at all', () => {
    expect(questGiverRefId([{ id: '1' }, { id: '2', npcIds: [] }], edges)).toBeUndefined();
  });

  test('falls back to the first node when every node has an incoming edge', () => {
    const nodes = [{ id: '1', npcIds: ['eliav'] }, { id: '2', npcIds: ['eurek'] }];
    const cyclic = [{ source: '2', target: '1' }, { source: '1', target: '2' }];
    expect(questGiverRefId(nodes, cyclic)).toBe('eliav');
  });
});
