import { describe, test, expect } from '@jest/globals';
import { makeFixture } from './fixtures';
import { formats } from '../formats';

const payload = makeFixture();

describe('Export format renderers', () => {
  (Object.keys(formats) as (keyof typeof formats)[]).forEach((formatId) => {
    const mod = formats[formatId];

    describe(mod.label, () => {
      test('filename extension matches format', () => {
        expect(mod.extension).toMatchSnapshot();
      });

      test('renders content matching snapshot', async () => {
        const content = await mod.render(payload);
        expect(Buffer.isBuffer(content) ? `<Buffer length=${content.length}>` : content).toMatchSnapshot();
      });

      test('content is non-empty string or buffer', async () => {
        const content = await mod.render(payload);
        expect(typeof content === 'string' || Buffer.isBuffer(content)).toBe(true);
        expect(content.length).toBeGreaterThan(0);
      });
    });
  });
});
