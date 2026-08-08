import { describe, expect, test } from '@jest/globals';
import { isValidChange, readProposedDesigns, readRefs } from '../services/aiEditParse';
import { ReferenceEntity } from '../services/generationContext';

const kb: ReferenceEntity[] = [
  { name: 'Balrog', type: 'monsters', role: 'boss' },
  { name: 'Elder Maru', type: 'characters', role: 'quest_giver' },
  { name: 'Emberfang', type: 'items' },
];

describe('readRefs', () => {
  const allowed = new Set(['aaa', 'bbb', 'ent-1']);

  test('accepts a well-formed block and normalizes missing slots', () => {
    const refs = readRefs(
      { before: { monsterIds: ['aaa'] }, after: { monsterIds: ['ent-1'], rewardIds: ['bbb'] } },
      allowed,
    );
    expect(refs).toEqual({
      before: { npcIds: [], monsterIds: ['aaa'], rewardIds: [] },
      after: { npcIds: [], monsterIds: ['ent-1'], rewardIds: ['bbb'] },
    });
  });

  test('drops the whole block when any id was never offered', () => {
    expect(readRefs(
      { before: { npcIds: [] }, after: { npcIds: ['ent-99'] } },
      allowed,
    )).toBeUndefined();
  });

  test('an emptied after is preserved — detaching is legitimate (ADR-0002)', () => {
    const refs = readRefs({ before: { monsterIds: ['aaa'] }, after: {} }, allowed);
    expect(refs?.after.monsterIds).toEqual([]);
    expect(refs?.before.monsterIds).toEqual(['aaa']);
  });

  test('rejects malformed or absent blocks', () => {
    expect(readRefs(undefined, allowed)).toBeUndefined();
    expect(readRefs({ before: {} }, allowed)).toBeUndefined();
    expect(readRefs('nope', allowed)).toBeUndefined();
  });

  test('discards non-string and blank ids rather than passing them through', () => {
    const refs = readRefs(
      { before: {}, after: { npcIds: ['aaa', 42, '', '   ', null] } },
      allowed,
    );
    expect(refs?.after.npcIds).toEqual(['aaa']);
  });
});

describe('readProposedDesigns', () => {
  test('grounds a proposal whose kbRef names offered material', () => {
    const [design] = readProposedDesigns(
      [{ tempId: 'ent-1', kind: 'monster', name: 'The Balrog', kbRef: 'balrog' }],
      kb,
    );
    expect(design.kbRef).toBe('Balrog');
  });

  test('grounds on exact name even when the model omits kbRef', () => {
    const [design] = readProposedDesigns(
      [{ tempId: 'ent-1', kind: 'npc', name: 'elder maru' }],
      kb,
    );
    expect(design.kbRef).toBe('Elder Maru');
  });

  test('drops a hallucinated kbRef that names nothing we offered', () => {
    const [design] = readProposedDesigns(
      [{ tempId: 'ent-1', kind: 'npc', name: 'Invented Person', kbRef: 'Smaug' }],
      kb,
    );
    expect(design.kbRef).toBeUndefined();
  });

  test('forces monster kind for an entity filed under the monsters sheet', () => {
    const [design] = readProposedDesigns(
      [{ tempId: 'ent-1', kind: 'npc', name: 'Balrog' }],
      kb,
    );
    expect(design.kind).toBe('monster');
  });

  test('coerces an unrecognized role to a character kind', () => {
    const [villain, friendly] = readProposedDesigns(
      [
        { tempId: 'ent-1', kind: 'villain', name: 'Nameless Dread' },
        { tempId: 'ent-2', kind: 'shopkeeper', name: 'Tilda' },
      ],
      kb,
    );
    expect(villain.kind).toBe('monster');
    expect(friendly.kind).toBe('npc');
  });

  test('keeps a valid rarity and discards an invalid one', () => {
    const [good, bad] = readProposedDesigns(
      [
        { tempId: 'ent-1', kind: 'item', name: 'Emberfang', rarity: 'epic' },
        { tempId: 'ent-2', kind: 'item', name: 'Stick', rarity: 'mythic' },
      ],
      kb,
    );
    expect(good.rarity).toBe('epic');
    expect(bad.rarity).toBeUndefined();
  });

  test('skips entries with no tempId or no name, and de-duplicates tempIds', () => {
    const designs = readProposedDesigns(
      [
        { tempId: '', kind: 'npc', name: 'Nameless' },
        { tempId: 'ent-1', kind: 'npc', name: '' },
        { tempId: 'ent-2', kind: 'npc', name: 'Keep' },
        { tempId: 'ent-2', kind: 'npc', name: 'Duplicate' },
        'garbage',
      ],
      kb,
    );
    expect(designs.map((d) => d.name)).toEqual(['Keep']);
  });

  test('returns nothing when entities is absent or not an array', () => {
    expect(readProposedDesigns(undefined, kb)).toEqual([]);
    expect(readProposedDesigns({ tempId: 'ent-1' }, kb)).toEqual([]);
  });
});

describe('isValidChange', () => {
  test('accepts each well-formed change type', () => {
    expect(isValidChange({ type: 'updateNode', nodeId: '1', summary: 'why', before: {}, after: {} })).toBe(true);
    expect(isValidChange({ type: 'addNode', summary: 'why', node: {} })).toBe(true);
    expect(isValidChange({ type: 'deleteNode', nodeId: '1', summary: 'why' })).toBe(true);
    expect(isValidChange({ type: 'addEdge', source: '1', target: '2', summary: 'why' })).toBe(true);
  });

  test('rejects a change with no summary, unknown type, or missing fields', () => {
    expect(isValidChange({ type: 'updateNode', nodeId: '1', before: {}, after: {} })).toBe(false);
    expect(isValidChange({ type: 'rewriteEverything', summary: 'why' })).toBe(false);
    expect(isValidChange({ type: 'updateNode', summary: 'why', before: {} })).toBe(false);
    expect(isValidChange(null)).toBe(false);
  });
});
