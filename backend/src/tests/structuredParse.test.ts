import { describe, expect, test } from '@jest/globals';
import {
  parseCollectionFile,
  extractStats,
  scoreDifficulty,
  bucketOf,
} from '../services/structuredParse';

const mobsArray = JSON.stringify([
  { name: 'Cave Rat',   stats: { hp: 20,  attack: 4,  defense: 1,  level: 2 },  drops: [{ item: 'Rat Tail', chance: 0.8 }] },
  { name: 'Cave Troll', stats: { hp: 450, attack: 38, defense: 22, level: 14 }, drops: [{ item: 'Troll Hide', chance: 0.4 }], description: 'A hulking brute.' },
  { name: 'Elder Wyrm', stats: { hp: 900, attack: 80, defense: 45, level: 30 } },
]);

describe('parseCollectionFile', () => {
  test('explodes a top-level array into named entities', () => {
    const entities = parseCollectionFile(mobsArray);
    expect(entities).not.toBeNull();
    expect(entities).toHaveLength(3);
    expect(entities?.map((e) => e.name)).toEqual(['Cave Rat', 'Cave Troll', 'Elder Wyrm']);
  });

  test('accepts a wrapper object holding the entity array', () => {
    const entities = parseCollectionFile(JSON.stringify({ version: 2, mobs: JSON.parse(mobsArray) }));
    expect(entities).toHaveLength(3);
    expect(entities?.[0].name).toBe('Cave Rat');
  });

  test('accepts a name-keyed map', () => {
    const entities = parseCollectionFile(JSON.stringify({
      'Cave Rat':   { hp: 20, attack: 4 },
      'Elder Wyrm': { hp: 900, attack: 80 },
    }));
    expect(entities?.map((e) => e.name)).toEqual(['Cave Rat', 'Elder Wyrm']);
  });

  test('accepts a single entity object', () => {
    const entities = parseCollectionFile(JSON.stringify({
      name: 'Tribal Leader',
      role: 'chief',
      location: 'Ashen Camp',
      description: 'Guides young warriors through the rite of passage.',
    }));
    expect(entities).toHaveLength(1);
    expect(entities?.[0].name).toBe('Tribal Leader');
    expect(entities?.[0].role).toBe('chief');
    expect(entities?.[0].text).toContain('rite of passage');
  });

  test('accepts a single-key wrapper around a name-keyed map', () => {
    const entities = parseCollectionFile(JSON.stringify({
      characters: {
        'Tribal Leader': { role: 'chief' },
        'Young Apprentice': { role: 'warrior' },
      },
    }));
    expect(entities?.map((e) => e.name)).toEqual(['Tribal Leader', 'Young Apprentice']);
  });

  test('reads name from title or id fallbacks', () => {
    const entities = parseCollectionFile(JSON.stringify([{ title: 'Riverhollow' }, { id: 'zone-2' }]));
    expect(entities?.map((e) => e.name)).toEqual(['Riverhollow', 'zone-2']);
  });

  test('returns null for non-JSON, scalars, and unnamed entries (freeform fallback)', () => {
    expect(parseCollectionFile('Once upon a time in the caves…')).toBeNull();
    expect(parseCollectionFile('42')).toBeNull();
    expect(parseCollectionFile('[1, 2, 3]')).toBeNull();
    expect(parseCollectionFile(JSON.stringify([{ hp: 20 }]))).toBeNull();
  });

  test('assigns normalized difficulty and buckets within the file', () => {
    const entities = parseCollectionFile(mobsArray);
    const [rat, troll, wyrm] = entities ?? [];
    expect(rat.difficulty).toBe(0);
    expect(wyrm.difficulty).toBe(1);
    expect(troll.difficulty).toBeGreaterThan(0);
    expect(troll.difficulty).toBeLessThan(1);
    expect(rat.difficultyBucket).toBe('early');
    expect(troll.difficultyBucket).toBe('mid');
    expect(wyrm.difficultyBucket).toBe('late');
  });

  test('leaves difficulty undefined when no stats are recognized', () => {
    const entities = parseCollectionFile(JSON.stringify([
      { name: 'Riverhollow', region: 'west', description: 'A sleepy village.' },
    ]));
    expect(entities?.[0].difficulty).toBeUndefined();
    expect(entities?.[0].difficultyBucket).toBeUndefined();
  });

  test('keeps npc role and builds a readable text representation', () => {
    const entities = parseCollectionFile(JSON.stringify([
      { name: 'Elder Maren', role: 'quest_giver', location: 'Riverhollow', description: 'Keeper of the old shrine.' },
    ]));
    const maren = entities?.[0];
    expect(maren?.role).toBe('quest_giver');
    expect(maren?.text).toContain('Elder Maren (quest_giver)');
    expect(maren?.text).toContain('location: Riverhollow');
    expect(maren?.text).toContain('Keeper of the old shrine.');
    expect(maren?.fields).toMatchObject({ location: 'Riverhollow' });
  });

  test('formats nested drops arrays into the text', () => {
    const entities = parseCollectionFile(mobsArray);
    expect(entities?.[1].text).toContain('drops: item Troll Hide, chance 0.4');
  });
});

describe('parseCollectionFile — markdown shape', () => {
  const mobsMarkdown = `## Goblin Scout
Zone: Whispering Caves (early game)
Stats: HP 30, ATK 5, DEF 2
Drops: rusty dagger (common), goblin ear
Notes: cowardly, roams in packs of 3-5

## Ember Drake
Zone: Cinder Peaks (late game)
Stats: HP 900, ATK 60, DEF 35
Territorial; nests hold unhatched eggs.
`;

  test('explodes ## headings into named entities', () => {
    const entities = parseCollectionFile(mobsMarkdown);
    expect(entities).toHaveLength(2);
    expect(entities?.map((e) => e.name)).toEqual(['Goblin Scout', 'Ember Drake']);
  });

  test('parses stat pair lines and infers difficulty across the doc', () => {
    const [scout, drake] = parseCollectionFile(mobsMarkdown) ?? [];
    expect(scout.difficulty).toBe(0);
    expect(scout.difficultyBucket).toBe('early');
    expect(drake.difficulty).toBe(1);
    expect(drake.difficultyBucket).toBe('late');
  });

  test('keeps key/value fields and free prose as description', () => {
    const [scout, drake] = parseCollectionFile(mobsMarkdown) ?? [];
    expect(scout.fields).toMatchObject({ zone: 'Whispering Caves (early game)' });
    expect(scout.text).toContain('drops: rusty dagger (common), goblin ear');
    expect(drake.fields.description).toBe('Territorial; nests hold unhatched eggs.');
  });

  test('reads a Role: line as the entity role (npc docs)', () => {
    const entities = parseCollectionFile(`## Tribal Leader
Role: quest giver
Location: Ashen Camp
Motivation: guides young warriors through the rite of passage
`);
    expect(entities?.[0].name).toBe('Tribal Leader');
    expect(entities?.[0].role).toBe('quest giver');
    expect(entities?.[0].text).toContain('Tribal Leader (quest giver)');
  });

  test('numeric-only values become numbers (Level: 14 feeds stats)', () => {
    const entities = parseCollectionFile(`## Wolf\nLevel: 14\n\n## Pup\nLevel: 2\n`);
    expect(entities?.[0].difficultyBucket).toBe('late');
    expect(entities?.[1].difficultyBucket).toBe('early');
  });

  test('text without headings still falls back to freeform (null)', () => {
    expect(parseCollectionFile('Just some lore prose.\nNo headings here.')).toBeNull();
  });
});

describe('extractStats', () => {
  test('reads flat and nested stat keys with alias support', () => {
    expect(extractStats({ hp: 10, atk: 5 })).toEqual({ hp: 10, attack: 5 });
    expect(extractStats({ stats: { health: 30, def: 8, lvl: 3 } })).toEqual({ hp: 30, defense: 8, level: 3 });
    expect(extractStats({ base_hp: 12, base_melee_attack: 4 })).toEqual({ hp: 12 });
  });

  test('ignores non-numeric values', () => {
    expect(extractStats({ hp: 'high', level: NaN })).toEqual({});
  });
});

describe('scoreDifficulty', () => {
  test('constant stat across the file contributes 0.5', () => {
    const scores = scoreDifficulty([{ hp: 100 }, { hp: 100 }]);
    expect(scores).toEqual([0.5, 0.5]);
  });

  test('entities missing all stats get undefined', () => {
    const scores = scoreDifficulty([{ hp: 10 }, {}]);
    expect(scores[1]).toBeUndefined();
  });
});

describe('bucketOf', () => {
  test('splits at thirds', () => {
    expect(bucketOf(0)).toBe('early');
    expect(bucketOf(0.4)).toBe('mid');
    expect(bucketOf(0.9)).toBe('late');
    expect(bucketOf(1)).toBe('late');
  });
});
