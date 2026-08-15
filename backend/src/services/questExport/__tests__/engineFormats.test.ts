import { describe, test, expect } from '@jest/globals';
import { makeFixture } from './fixtures';
import { engineFormats } from '../formats/engineFormats';

const payload = makeFixture();

describe('Engine export renderers (per node)', () => {
  (Object.keys(engineFormats) as (keyof typeof engineFormats)[]).forEach((formatId) => {
    const mod = engineFormats[formatId];

    describe(mod.label, () => {
      payload.nodes.forEach((node) => {
        describe(`node "${node.title}"`, () => {
          test('renders content matching snapshot', () => {
            const content = mod.renderNode(node, payload);
            expect(content).toMatchSnapshot();
          });

          test('content is non-empty string', () => {
            const content = mod.renderNode(node, payload);
            expect(typeof content).toBe('string');
            expect(content.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });
});
