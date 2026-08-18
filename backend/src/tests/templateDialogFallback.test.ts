import { describe, expect, test } from '@jest/globals';
import {
  buildFallbackDialogPages,
  identityItemKeyForField,
  promptItemKeyForField,
} from '../services/templateDialogFallback';

// The page shape that actually shipped: id first, then the page links, then the
// prose. Field order matters — picking "the first string field that isn't the
// id" lands on `next`.
const pagesField = {
  path: 'dialogue.start.pages',
  itemSchema: [
    { path: 'id', valueType: 'string' },
    { path: 'next', valueType: 'string' },
    { path: 'prev', valueType: 'string' },
    { path: 'yes', valueType: 'string' },
    { path: 'no', valueType: 'string' },
    { path: 'prompt', valueType: 'string' },
    { path: 'npcId', valueType: 'number' },
  ],
};

const node = { id: '3', title: 'The Northern Caves', body: 'A low growl echoes from the darkness.' };

// Every hint on a dialog page mentions "dialogue", including the ones for ids
// and page links — which is exactly why matching on that word misfires.
const templateDoc = {
  templateSchema: {
    generationContract: {
      relationshipHints: [
        { kind: 'sequence', from: 'dialogue.start.pages[].next', to: 'dialogue.start.pages[].id' },
        { kind: 'sequence', from: 'dialogue.start.pages[].prev', to: 'dialogue.start.pages[].id' },
      ],
      fieldHints: [
        { path: 'dialogue.start.pages[].id', meaning: 'Stable page identifier used by other page-link fields in the same start dialogue list.' },
        { path: 'dialogue.start.pages[].next', meaning: 'The next dialogue page to show.' },
        { path: 'dialogue.start.pages[].prompt', meaning: 'Player-facing text shown during quest start dialogue.' },
      ],
    },
  },
};

describe('fallback dialog pages', () => {
  test('puts the node body in the prompt field, not in a page link', () => {
    const [page] = buildFallbackDialogPages(templateDoc, pagesField, node);
    expect(page.prompt).toBe(node.body);
    expect(page.next).toBeUndefined();
    expect(page.prev).toBeUndefined();
    expect(page.id).toBe('3_dialogue_start_pages_page_1');
  });

  // The observed failure: with no usable hints, schema order chose `next`, and
  // `prompt` was then stamped empty.
  test('still finds the prompt field with no hints at all', () => {
    const [page] = buildFallbackDialogPages({}, pagesField, node);
    expect(page.prompt).toBe(node.body);
    expect(page.next).toBeUndefined();
  });

  test('never writes the body onto the row identity', () => {
    const idOnly = {
      path: 'pages',
      itemSchema: [{ path: 'id', valueType: 'string' }, { path: 'next', valueType: 'string' }],
    };
    const [page] = buildFallbackDialogPages({}, idOnly, node);
    expect(page?.id).toBe('3_pages_page_1');
    expect(page?.next).toBeUndefined();
  });

  test('a hint cannot select a page link as the prompt field', () => {
    const misleading = {
      templateSchema: {
        generationContract: {
          fieldHints: [
            { path: 'dialogue.start.pages[].next', meaning: 'Player-facing next dialogue page.' },
          ],
        },
      },
    };
    expect(promptItemKeyForField(misleading, pagesField, 'id')).toBe('prompt');
  });

  test('falls back to a differently named prose field', () => {
    const custom = {
      path: 'conversation.lines',
      itemSchema: [
        { path: 'lineId', valueType: 'string' },
        { path: 'goTo', valueType: 'string' },
        { path: 'spokenText', valueType: 'string' },
      ],
    };
    const hints = {
      templateSchema: {
        generationContract: {
          fieldHints: [
            { path: 'conversation.lines[].spokenText', meaning: 'Text shown to the player.', generationUse: 'player-facing' },
          ],
        },
      },
    };
    expect(promptItemKeyForField(hints, custom, 'lineId')).toBe('spokenText');
  });

  test('returns no page when the row has no field that can hold prose', () => {
    const numeric = {
      path: 'pages',
      itemSchema: [{ path: 'npcId', valueType: 'number' }, { path: 'delay', valueType: 'number' }],
    };
    expect(buildFallbackDialogPages({}, numeric, node)).toEqual([]);
  });

  test('identity comes from relationship hints when present', () => {
    expect(identityItemKeyForField(templateDoc, pagesField)).toBe('id');
  });

  test('identity prefers a field named id over schema order', () => {
    const reordered = {
      path: 'pages',
      itemSchema: [{ path: 'caption', valueType: 'string' }, { path: 'id', valueType: 'string' }],
    };
    expect(identityItemKeyForField({}, reordered)).toBe('id');
  });
});
