import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import { config } from '../../../config/config';
import { loadManifest } from '../../../config/manifest';
import { styleUnavailability, isStyleRunnable, isStyleOfferable } from '../styleAvailability';

const MANIFEST = {
  version: 'v1',
  built_at: '2026-08-04T19:56:03Z',
  endpoints: {
    'sdxl-lora': {
      image: 'org/comfy-sdxl-lora:v1',
      checkpoint: 'sdxl_base.safetensors',
      loras: ['pixel_style.safetensors'],
      endpoint_id: 'abc123',
    },
    pixelart: {
      image: 'org/comfy-pixelart:v1',
      checkpoint: 'pixelart.safetensors',
      loras: [],
      endpoint_id: 'ghi789',
    },
  },
};

const runnableStyle = {
  endpointKey: 'sdxl-lora',
  checkpointFilename: 'sdxl_base.safetensors',
  loras: [{ loraFilename: 'pixel_style.safetensors' }],
};

// A LoRA dropped from the image on the next rebuild — the realistic breakage
const brokenStyle = {
  endpointKey: 'sdxl-lora',
  checkpointFilename: 'sdxl_base.safetensors',
  loras: [{ loraFilename: 'removed_in_v2.safetensors' }],
};

describe('styleAvailability', () => {
  beforeEach(async () => {
    config.RUNPOD_MANIFEST_URL = '';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(MANIFEST));
    await loadManifest();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports no problems for a style the manifest can run', () => {
    expect(styleUnavailability(runnableStyle)).toEqual([]);
    expect(isStyleRunnable(runnableStyle)).toBe(true);
  });

  it('explains why a style cannot run', () => {
    const reasons = styleUnavailability(brokenStyle);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/removed_in_v2\.safetensors" is not in the "sdxl-lora" image/);
    expect(isStyleRunnable(brokenStyle)).toBe(false);
  });

  it('treats an endpoint missing from the manifest as unavailable', () => {
    // What the legacy migration parks unmatched styles on
    expect(isStyleRunnable({ ...runnableStyle, endpointKey: 'unassigned' })).toBe(false);
  });

  describe('isStyleOfferable', () => {
    // isActive is admin intent, runnability is manifest fact. Both must hold,
    // and neither is allowed to imply the other.
    it('offers a style that is both enabled and runnable', () => {
      expect(isStyleOfferable({ ...runnableStyle, isActive: true })).toBe(true);
    });

    it('does not offer a runnable style the admin switched off', () => {
      expect(isStyleOfferable({ ...runnableStyle, isActive: false })).toBe(false);
    });

    it('does not offer an enabled style the manifest cannot run', () => {
      expect(isStyleOfferable({ ...brokenStyle, isActive: true })).toBe(false);
    });

    it('keeps the two states independent', () => {
      // Disabled AND broken: fixing only one of them must not make it offerable
      const both = { ...brokenStyle, isActive: false };
      expect(isStyleOfferable({ ...both, isActive: true })).toBe(false);
      expect(isStyleOfferable({ ...both, loras: runnableStyle.loras })).toBe(false);
    });
  });

  // The point of deriving rather than storing: a style broken by a bad manifest
  // comes back by itself once the manifest is fixed, with no admin action.
  it('becomes runnable again when the manifest regains the LoRA', async () => {
    expect(isStyleRunnable(brokenStyle)).toBe(false);

    const repaired = {
      ...MANIFEST,
      version: 'v2',
      endpoints: {
        ...MANIFEST.endpoints,
        'sdxl-lora': {
          ...MANIFEST.endpoints['sdxl-lora'],
          loras: ['pixel_style.safetensors', 'removed_in_v2.safetensors'],
        },
      },
    };
    jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(repaired));
    await loadManifest();

    expect(isStyleRunnable(brokenStyle)).toBe(true);
  });
});
