import { describe, expect, test } from '@jest/globals';
import { chunkText } from '../services/chunk';

describe('chunkText', () => {
  test('returns empty array for empty/whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  test('returns a single chunk for short text', () => {
    const chunks = chunkText('one two three');
    expect(chunks).toEqual(['one two three']);
  });

  test('splits long text into overlapping chunks', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`);
    const chunks = chunkText(words.join(' '), 400, 60);

    expect(chunks.length).toBeGreaterThan(1);
    // First chunk holds the first 400 words
    expect(chunks[0].split(' ')).toHaveLength(400);
    expect(chunks[0].startsWith('w0 ')).toBe(true);
    // Second chunk starts 340 words in (400 - 60 overlap)
    expect(chunks[1].startsWith('w340 ')).toBe(true);
    // Every word makes it into some chunk (no data loss at the tail)
    expect(chunks[chunks.length - 1].endsWith('w999')).toBe(true);
  });

  test('normalizes arbitrary whitespace between words', () => {
    const chunks = chunkText('alpha\n\nbeta\t gamma');
    expect(chunks).toEqual(['alpha beta gamma']);
  });
});
