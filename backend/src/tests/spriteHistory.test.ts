import { describe, expect, test } from '@jest/globals';
import {
  pushVersion,
  resolveIndex,
  selectVersion,
} from '../services/generation/spriteHistory';

const MAX = 5;

describe('resolveIndex', () => {
  test('prefers the stored cursor when it is in range', () => {
    expect(resolveIndex(['a', 'b', 'c'], 'c', 1)).toBe(1);
  });

  test('falls back to the snapped key for records saved before the cursor existed', () => {
    expect(resolveIndex(['a', 'b', 'c'], 'b')).toBe(1);
  });

  test('falls back to the last candidate when the snapped key is unknown', () => {
    expect(resolveIndex(['a', 'b', 'c'], '')).toBe(2);
    expect(resolveIndex(['a', 'b', 'c'], 'gone')).toBe(2);
  });

  test('ignores an out-of-range or non-integer stored cursor', () => {
    expect(resolveIndex(['a', 'b'], 'a', 7)).toBe(0);
    expect(resolveIndex(['a', 'b'], 'a', -1)).toBe(0);
    expect(resolveIndex(['a', 'b'], 'a', 1.5)).toBe(0);
  });

  test('returns -1 for an empty history', () => {
    expect(resolveIndex([], '')).toBe(-1);
    expect(resolveIndex([], 'a', 0)).toBe(-1);
  });
});

describe('pushVersion', () => {
  test('appends and points the cursor at the new version', () => {
    expect(pushVersion(['a', 'b'], 1, 'c', MAX)).toEqual({ candidates: ['a', 'b', 'c'], index: 2 });
  });

  test('appends to an empty history', () => {
    expect(pushVersion([], -1, 'a', MAX)).toEqual({ candidates: ['a'], index: 0 });
  });

  test('discards the redo tail when editing after an undo', () => {
    // Undone back to 'b'; the new edit branches from there and 'c'/'d' are dropped.
    expect(pushVersion(['a', 'b', 'c', 'd'], 1, 'e', MAX)).toEqual({
      candidates: ['a', 'b', 'e'],
      index: 2,
    });
  });

  test('prunes the oldest entries at the cap and shifts the cursor down', () => {
    expect(pushVersion(['a', 'b', 'c', 'd', 'e'], 4, 'f', MAX)).toEqual({
      candidates: ['b', 'c', 'd', 'e', 'f'],
      index: 4,
    });
  });

  test('prunes an over-long legacy history down to the cap in one push', () => {
    const long = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(pushVersion(long, 6, 'h', MAX)).toEqual({
      candidates: ['d', 'e', 'f', 'g', 'h'],
      index: 4,
    });
  });
});

describe('selectVersion', () => {
  test('returns the key at the requested index', () => {
    expect(selectVersion(['a', 'b', 'c'], 0)).toBe('a');
    expect(selectVersion(['a', 'b', 'c'], 2)).toBe('c');
  });

  test('rejects out-of-range and non-integer indexes', () => {
    expect(() => selectVersion(['a', 'b'], 2)).toThrow();
    expect(() => selectVersion(['a', 'b'], -1)).toThrow();
    expect(() => selectVersion(['a', 'b'], 0.5)).toThrow();
    expect(() => selectVersion([], 0)).toThrow();
  });
});

describe('undo / redo round trip', () => {
  test('walking back and forward lands on the same versions', () => {
    let state = pushVersion([], -1, 'generated', MAX);
    state = pushVersion(state.candidates, state.index, 'resized', MAX);
    state = pushVersion(state.candidates, state.index, 'bg-removed', MAX);
    expect(state).toEqual({ candidates: ['generated', 'resized', 'bg-removed'], index: 2 });

    // Undo twice.
    expect(selectVersion(state.candidates, state.index - 1)).toBe('resized');
    expect(selectVersion(state.candidates, state.index - 2)).toBe('generated');

    // Redo from the bottom.
    expect(selectVersion(state.candidates, 0 + 1)).toBe('resized');

    // A fresh edit from the undone position drops what came after.
    expect(pushVersion(state.candidates, 0, 'snapped', MAX)).toEqual({
      candidates: ['generated', 'snapped'],
      index: 1,
    });
  });
});
