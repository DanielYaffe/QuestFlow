import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import sharp from 'sharp';

jest.mock('../../../config/config', () => ({
  config: {
    PIXELLAB_API_KEY: 'test-key',
    PIXELLAB_API_URL: 'https://pixellab.test/v2',
  },
}));

import {
  submitAnimateWithText,
  waitForBackgroundJob,
  prepareFrameForPixelLab,
  getBalance,
  normalizeFrameCount,
  PixelLabError,
  PIXELLAB_MAX_DIMENSION,
  PIXELLAB_PIXEL_BUDGET,
} from '../pixellabService';

type FetchResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
type FetchFn = (url: string, init?: RequestInit) => Promise<FetchResponse>;
type FetchMock = jest.Mock<FetchFn>;

function mockFetchOnce(fetchMock: FetchMock, status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = jest.fn<FetchFn>();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('submitAnimateWithText', () => {
  it('builds the v3 payload and returns the background job id', async () => {
    mockFetchOnce(fetchMock, 200, { background_job_id: 'job-123', status: 'processing' });

    const frame = Buffer.from('fake-png');
    const jobId = await submitAnimateWithText({ firstFrame: frame, action: 'walking', frameCount: 8 });

    expect(jobId).toBe('job-123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://pixellab.test/v2/animate-with-text-v3');
    if (!init) throw new Error('fetch called without init');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.action).toBe('walking');
    expect(body.frame_count).toBe(8);
    expect(body.first_frame).toEqual({
      type: 'base64',
      base64: frame.toString('base64'),
      format: 'png',
    });
  });

  it('flags billing errors so the UI can explain them', async () => {
    mockFetchOnce(fetchMock, 402, { detail: 'Insufficient credits' });

    await expect(
      submitAnimateWithText({ firstFrame: Buffer.from('x'), action: 'run', frameCount: 4 }),
    ).rejects.toMatchObject({ name: 'PixelLabError', isBillingError: true });
  });
});

describe('waitForBackgroundJob', () => {
  it('polls until completed and decodes result images (with or without data-URL prefix)', async () => {
    const png = Buffer.from('png-bytes');
    mockFetchOnce(fetchMock, 200, { id: 'j', status: 'processing', created_at: 'now' });
    mockFetchOnce(fetchMock, 200, {
      id: 'j',
      status: 'completed',
      created_at: 'now',
      last_response: {
        images: [
          { type: 'base64', base64: png.toString('base64') },
          { type: 'base64', base64: `data:image/png;base64,${png.toString('base64')}` },
        ],
      },
    });

    const frames = await waitForBackgroundJob('j', { intervalMs: 1 });
    expect(frames).toHaveLength(2);
    expect(frames[0].equals(png)).toBe(true);
    expect(frames[1].equals(png)).toBe(true);
  });

  it('throws the failure detail on failed jobs', async () => {
    mockFetchOnce(fetchMock, 200, {
      id: 'j',
      status: 'failed',
      created_at: 'now',
      last_response: { detail: 'model exploded' },
    });

    await expect(waitForBackgroundJob('j', { intervalMs: 1 })).rejects.toThrow('model exploded');
  });

  it('times out when the job never settles', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'j', status: 'processing', created_at: 'now' }),
    });

    await expect(
      waitForBackgroundJob('j', { intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toThrow(/timed out/);
  });
});

describe('getBalance', () => {
  it('parses credits and subscription generations', async () => {
    mockFetchOnce(fetchMock, 200, {
      credits: { type: 'usd', usd: 1.5 },
      subscription: { type: 'generations', status: 'trial', plan: null, generations: 33, total: 40 },
    });

    const balance = await getBalance();
    expect(balance).toEqual({ usd: 1.5, generationsLeft: 33, generationsTotal: 40, plan: 'trial' });
  });
});

describe('prepareFrameForPixelLab', () => {
  async function makePng(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();
  }

  it('keeps small PNGs untouched', async () => {
    const src = await makePng(64, 64);
    const prepared = await prepareFrameForPixelLab(src, 8);
    expect(prepared.width).toBe(64);
    expect(prepared.height).toBe(64);
    expect(prepared.buffer).toBe(src);
  });

  it('downscales anything over the max dimension', async () => {
    const src = await makePng(512, 256);
    const prepared = await prepareFrameForPixelLab(src, 1);
    expect(Math.max(prepared.width, prepared.height)).toBeLessThanOrEqual(PIXELLAB_MAX_DIMENSION);
    expect(prepared.width % 2).toBe(0);
    expect(prepared.height % 2).toBe(0);
    const meta = await sharp(prepared.buffer).metadata();
    expect(meta.width).toBe(prepared.width);
  });

  it('respects the pixel budget for high frame counts', async () => {
    const src = await makePng(256, 256);
    const prepared = await prepareFrameForPixelLab(src, 16);
    expect(prepared.width * prepared.height * 16).toBeLessThanOrEqual(PIXELLAB_PIXEL_BUDGET);
  });
});

describe('normalizeFrameCount', () => {
  it('clamps to 4-16 and forces even counts', () => {
    expect(normalizeFrameCount(undefined)).toBe(8);
    expect(normalizeFrameCount(3)).toBe(4);
    expect(normalizeFrameCount(7)).toBe(6);
    expect(normalizeFrameCount(16)).toBe(16);
    expect(normalizeFrameCount(99)).toBe(16);
  });
});

describe('PixelLabError', () => {
  it('is a named error', () => {
    const err = new PixelLabError('boom', 500);
    expect(err.name).toBe('PixelLabError');
    expect(err.statusCode).toBe(500);
    expect(err.isBillingError).toBe(false);
  });
});
