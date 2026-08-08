import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import { config } from '../config';
import { loadManifest, validateStyleAgainstManifest, getEndpoint, getManifestSource } from '../manifest';

const VALID = {
  version: 'v1',
  built_at: '2026-08-04T19:56:03Z',
  endpoints: {
    'sdxl-lora': {
      image: 'org/comfy-sdxl-lora:v1',
      checkpoint: 'sdxl_base.safetensors',
      loras: ['pixel_style.safetensors', 'outline.safetensors'],
      endpoint_id: 'abc123',
    },
    illustrious: {
      image: 'org/comfy-illustrious:v1',
      checkpoint: 'illustrious.safetensors',
      loras: [],
      endpoint_id: 'def456',
    },
    pixelart: {
      image: 'org/comfy-pixelart:v1',
      checkpoint: 'pixelart.safetensors',
      loras: [],
      endpoint_id: 'ghi789',
    },
  },
};

/** Loads a manifest object as though it were the bundled fallback file. */
async function loadFixture(manifest: unknown): Promise<void> {
  jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(manifest));
  await loadManifest();
}

describe('manifest', () => {
  beforeEach(() => {
    // Force the bundled-file path; the URL path is covered separately
    config.RUNPOD_MANIFEST_URL = '';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loading', () => {
    it('loads a valid manifest from the bundled file', async () => {
      await loadFixture(VALID);
      expect(getManifestSource()).toBe('bundled');
      expect(getEndpoint('sdxl-lora').endpoint_id).toBe('abc123');
    });

    // build.sh emits null because endpoints do not exist until created by hand.
    // Shipping that null is the realistic failure, so it must not boot.
    it('rejects a null endpoint_id', async () => {
      const withNull = {
        ...VALID,
        endpoints: { ...VALID.endpoints, pixelart: { ...VALID.endpoints.pixelart, endpoint_id: null } },
      };
      await expect(loadFixture(withNull)).rejects.toThrow(/manifest/i);
    });

    it('rejects an empty endpoint_id', async () => {
      const withEmpty = {
        ...VALID,
        endpoints: { ...VALID.endpoints, pixelart: { ...VALID.endpoints.pixelart, endpoint_id: '' } },
      };
      await expect(loadFixture(withEmpty)).rejects.toThrow(/manifest/i);
    });

    // Copying manifest.example.json without filling it in must not boot
    it('rejects the placeholder endpoint_id from the example file', async () => {
      const withPlaceholder = {
        ...VALID,
        endpoints: {
          ...VALID.endpoints,
          pixelart: { ...VALID.endpoints.pixelart, endpoint_id: 'REPLACE_WITH_RUNPOD_ENDPOINT_ID' },
        },
      };
      await expect(loadFixture(withPlaceholder)).rejects.toThrow(/manifest/i);
    });

    it('rejects a manifest with no endpoints', async () => {
      await expect(loadFixture({ ...VALID, endpoints: {} })).rejects.toThrow(/manifest/i);
    });

    // Port 1 on loopback refuses immediately — a real failure through the real
    // https path, with no DNS lookup to make the suite flaky.
    const UNREACHABLE = 'https://127.0.0.1:1/manifest.json';

    it('prefers the URL and falls back to the bundled file when it fails', async () => {
      config.RUNPOD_MANIFEST_URL = UNREACHABLE;
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(VALID));

      await loadManifest();
      expect(getManifestSource()).toBe('bundled');
    });

    it('throws when neither the URL nor the bundled file yields a manifest', async () => {
      config.RUNPOD_MANIFEST_URL = UNREACHABLE;
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));

      await expect(loadManifest()).rejects.toThrow(/Could not load a valid RunPod manifest/);
    });

    // A bare `RUNPOD_MANIFEST_FALLBACK_PATH=` line used to parse as '' and
    // resolve to the package root, failing with an opaque EISDIR.
    it('falls back to the default path when the configured one is blank', async () => {
      expect(config.RUNPOD_MANIFEST_FALLBACK_PATH).not.toBe('');
    });
  });

  describe('validateStyleAgainstManifest', () => {
    beforeEach(async () => {
      await loadFixture(VALID);
    });

    it('accepts a checkpoint and LoRAs that match the endpoint', () => {
      expect(
        validateStyleAgainstManifest('sdxl-lora', 'sdxl_base.safetensors', ['pixel_style.safetensors']),
      ).toEqual([]);
    });

    it('accepts a LoRA-free style on a LoRA-free endpoint', () => {
      expect(validateStyleAgainstManifest('pixelart', 'pixelart.safetensors', [])).toEqual([]);
    });

    it('rejects an unknown endpoint', () => {
      const problems = validateStyleAgainstManifest('nope', 'sdxl_base.safetensors', []);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/Unknown endpoint "nope"/);
    });

    it('rejects a checkpoint the endpoint does not have baked in', () => {
      const problems = validateStyleAgainstManifest('illustrious', 'sdxl_base.safetensors', []);
      expect(problems[0]).toMatch(/illustrious\.safetensors" baked in/);
    });

    // The whole point of the endpoint split: the other images do not contain
    // the LoRA files at all, and ComfyUI only says so after the worker spins up.
    it.each(['illustrious', 'pixelart'])('rejects any LoRA on %s', (endpointKey) => {
      const checkpoint = endpointKey === 'illustrious' ? 'illustrious.safetensors' : 'pixelart.safetensors';
      const problems = validateStyleAgainstManifest(endpointKey, checkpoint, ['pixel_style.safetensors']);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/contains no LoRA files/);
    });

    it('rejects a LoRA that is not in the sdxl-lora image', () => {
      const problems = validateStyleAgainstManifest('sdxl-lora', 'sdxl_base.safetensors', ['ghost.safetensors']);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/"ghost\.safetensors" is not in the "sdxl-lora" image/);
    });

    it('reports every problem at once rather than the first', () => {
      const problems = validateStyleAgainstManifest('sdxl-lora', 'wrong.safetensors', ['ghost.safetensors']);
      expect(problems).toHaveLength(2);
    });
  });
});
