import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { config } from '../../../config/config';
import { submitJob, pollJob, extractImages, runWorkflow } from '../runpodClient';

const ENDPOINT = 'abc123';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function binaryResponse(bytes: Buffer, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

type FetchMock = jest.Mock<(url: string, init?: RequestInit) => Promise<Response>>;

/** Queues one response per call, in order. */
function mockFetchSequence(responses: Response[]): FetchMock {
  const mock = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();
  responses.forEach((r) => mock.mockResolvedValueOnce(r));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('runpodClient', () => {
  beforeEach(() => {
    // Keep the suite fast: the client sleeps one interval before each poll
    config.RUNPOD_POLL_INTERVAL_MS = 1;
    config.RUNPOD_JOB_TIMEOUT_MS = 500;
    config.RUNPOD_API_BASE = 'https://api.runpod.ai/v2';
    config.RUNPOD_API_KEY = 'test-key';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('submitJob', () => {
    it('posts the workflow and returns the job id', async () => {
      const mock = mockFetchSequence([jsonResponse({ id: 'job-1', status: 'IN_QUEUE' })]);

      const jobId = await submitJob(ENDPOINT, { '1': { class_type: 'X', inputs: {} } });

      expect(jobId).toBe('job-1');
      const [url, init] = mock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.runpod.ai/v2/abc123/run');
      expect(JSON.parse(String(init.body))).toEqual({
        input: { workflow: { '1': { class_type: 'X', inputs: {} } } },
      });
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    });

    it('throws when the endpoint rejects the submission', async () => {
      mockFetchSequence([jsonResponse({ error: 'nope' }, false, 401)]);
      await expect(submitJob(ENDPOINT, {})).rejects.toThrow(/RunPod \/run failed on abc123 \(401\)/);
    });

    it('throws when no job id comes back', async () => {
      mockFetchSequence([jsonResponse({ status: 'IN_QUEUE' })]);
      await expect(submitJob(ENDPOINT, {})).rejects.toThrow(/returned no job id/);
    });
  });

  describe('pollJob', () => {
    it('polls through IN_QUEUE and IN_PROGRESS to COMPLETED', async () => {
      mockFetchSequence([
        jsonResponse({ status: 'IN_QUEUE' }),
        jsonResponse({ status: 'IN_PROGRESS' }),
        jsonResponse({
          status: 'COMPLETED',
          output: { images: [{ filename: 'a.png', type: 'base64', data: 'AAA' }] },
        }),
      ]);

      const output = await pollJob(ENDPOINT, 'job-1');
      expect(output.images).toHaveLength(1);
      expect(output.images[0].filename).toBe('a.png');
    });

    // All four terminal failure states are diagnosed differently, so they must
    // not collapse into one generic message.
    it('reports FAILED with the endpoint error', async () => {
      mockFetchSequence([jsonResponse({ status: 'FAILED', error: 'lora not found' })]);
      await expect(pollJob(ENDPOINT, 'job-1')).rejects.toThrow(/FAILED: lora not found/);
    });

    it('reports CANCELLED distinctly', async () => {
      mockFetchSequence([jsonResponse({ status: 'CANCELLED' })]);
      await expect(pollJob(ENDPOINT, 'job-1')).rejects.toThrow(/was CANCELLED before it produced output/);
    });

    it('reports TIMED_OUT with both of its causes', async () => {
      mockFetchSequence([jsonResponse({ status: 'TIMED_OUT' })]);
      await expect(pollJob(ENDPOINT, 'job-1')).rejects.toThrow(
        /TIMED_OUT — either the worker exceeded its execution timeout or the job's TTL expired/,
      );
    });

    it('keeps polling through a transient non-ok status response', async () => {
      mockFetchSequence([
        jsonResponse({}, false, 502),
        jsonResponse({
          status: 'COMPLETED',
          output: { images: [{ filename: 'a.png', type: 'base64', data: 'AAA' }] },
        }),
      ]);

      const output = await pollJob(ENDPOINT, 'job-1');
      expect(output.images).toHaveLength(1);
    });

    it('gives up at the client-side deadline', async () => {
      const mock = jest
        .fn<(url: string, init?: RequestInit) => Promise<Response>>()
        .mockResolvedValue(jsonResponse({ status: 'IN_PROGRESS' }));
      global.fetch = mock as unknown as typeof fetch;

      await expect(pollJob(ENDPOINT, 'job-1')).rejects.toThrow(/did not finish within 0\.5s/);
    });

    it('throws when a completed job carries no images list', async () => {
      mockFetchSequence([jsonResponse({ status: 'COMPLETED', output: {} })]);
      await expect(pollJob(ENDPOINT, 'job-1')).rejects.toThrow(/output\.images was not a list/);
    });
  });

  describe('extractImages', () => {
    it('decodes base64 images', async () => {
      const [buffer] = await extractImages({
        images: [{ filename: 'a.png', type: 'base64', data: Buffer.from('hello').toString('base64') }],
      });
      expect(buffer.toString()).toBe('hello');
    });

    // The worker's documented example includes the data: prefix
    it('tolerates a data: URI prefix on base64 data', async () => {
      const encoded = Buffer.from('hello').toString('base64');
      const [buffer] = await extractImages({
        images: [{ filename: 'a.png', type: 'base64', data: `data:image/png;base64,${encoded}` }],
      });
      expect(buffer.toString()).toBe('hello');
    });

    // Switching to bucket upload must stay a config change, not a code change
    it('downloads s3_url images', async () => {
      mockFetchSequence([binaryResponse(Buffer.from('remote-bytes'))]);
      const [buffer] = await extractImages({
        images: [{ filename: 'a.png', type: 's3_url', data: 'https://bucket.example/a.png' }],
      });
      expect(buffer.toString()).toBe('remote-bytes');
    });

    it('handles a multi-image list', async () => {
      const buffers = await extractImages({
        images: [
          { filename: 'a.png', type: 'base64', data: Buffer.from('one').toString('base64') },
          { filename: 'b.png', type: 'base64', data: Buffer.from('two').toString('base64') },
        ],
      });
      expect(buffers.map((b) => b.toString())).toEqual(['one', 'two']);
    });

    it('rejects an unrecognised image type', async () => {
      await expect(
        extractImages({ images: [{ filename: 'a.png', type: 'webhook', data: 'x' }] }),
      ).rejects.toThrow(/Unknown RunPod image type "webhook"/);
    });
  });

  describe('runWorkflow', () => {
    it('submits, polls, and decodes in one call', async () => {
      mockFetchSequence([
        jsonResponse({ id: 'job-1' }),
        jsonResponse({
          status: 'COMPLETED',
          output: { images: [{ filename: 'a.png', type: 'base64', data: Buffer.from('img').toString('base64') }] },
        }),
      ]);

      const buffers = await runWorkflow(ENDPOINT, {}, 'style:pixelart');
      expect(buffers[0].toString()).toBe('img');
    });

    it('throws when a job completes with an empty image list', async () => {
      mockFetchSequence([
        jsonResponse({ id: 'job-1' }),
        jsonResponse({ status: 'COMPLETED', output: { images: [] } }),
      ]);

      await expect(runWorkflow(ENDPOINT, {}, 'style:pixelart')).rejects.toThrow(/produced no images/);
    });
  });
});
