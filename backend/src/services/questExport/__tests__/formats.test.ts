import { describe, test, expect } from '@jest/globals';
import { makeFixture } from './fixtures';
import { formats } from '../formats';

const payload = makeFixture();

describe('Export format renderers', () => {
  (Object.keys(formats) as (keyof typeof formats)[]).forEach((formatId) => {
    const mod = formats[formatId];

    describe(mod.label, () => {
      test('extension is zip', () => {
        expect(mod.extension).toBe('zip');
      });

      test('renders a non-empty files array', () => {
        const files = mod.render(payload);
        expect(Array.isArray(files)).toBe(true);
        expect(files.length).toBeGreaterThan(0);
      });

      test('every file has a non-empty path and string content', () => {
        const files = mod.render(payload);
        for (const f of files) {
          expect(typeof f.path).toBe('string');
          expect(f.path.length).toBeGreaterThan(0);
          expect(typeof f.content).toBe('string');
          expect(f.content.length).toBeGreaterThan(0);
        }
      });

      test('includes a README.md', () => {
        const files = mod.render(payload);
        expect(files.some((f) => f.path === 'README.md')).toBe(true);
      });

      test('file paths and content match snapshot', () => {
        const files = mod.render(payload);
        expect(files.map((f) => f.path)).toMatchSnapshot('file paths');
        expect(files).toMatchSnapshot('file contents');
      });
    });
  });
});
