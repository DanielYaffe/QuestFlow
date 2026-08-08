import { config } from '../../config/config';

// ---------------------------------------------------------------------------
// RunPod Serverless transport.
//
// Submit to /run and poll /status/{job_id}. Deliberately not /runsync: a cold
// start plus generation can exceed the client timeout, and /runsync returns
// IN_PROGRESS past roughly 90 seconds anyway, so the polling path is needed
// regardless.
// ---------------------------------------------------------------------------

const TERMINAL_STATES = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'] as const;
type TerminalState = (typeof TERMINAL_STATES)[number];

// Exceeding RunPod's 10 MB /run payload cap fails the job *after* generation
// finishes — we pay for the GPU and get nothing. Warn well before that.
const PAYLOAD_WARN_BYTES = 5 * 1024 * 1024;

export interface RunPodImage {
  filename: string;
  type: string;
  data: string;
}

export interface RunPodOutput {
  images: RunPodImage[];
}

type WorkflowInput = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTerminal(status: string): status is TerminalState {
  return (TERMINAL_STATES as readonly string[]).includes(status);
}

function endpointUrl(endpointId: string, path: string): string {
  return `${config.RUNPOD_API_BASE.replace(/\/$/, '')}/${endpointId}${path}`;
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.RUNPOD_API_KEY}`,
  };
}

/** Submits a workflow and returns the RunPod job id. Does not wait for it. */
export async function submitJob(endpointId: string, workflow: WorkflowInput): Promise<string> {
  const body = JSON.stringify({ input: { workflow } });

  const response = await fetch(endpointUrl(endpointId, '/run'), {
    method: 'POST',
    headers: authHeaders(),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RunPod /run failed on ${endpointId} (${response.status}): ${text}`);
  }

  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.id !== 'string') {
    throw new Error(`RunPod /run on ${endpointId} returned no job id: ${JSON.stringify(data)}`);
  }
  return data.id;
}

function describeFailure(endpointId: string, jobId: string, status: TerminalState, payload: Record<string, unknown>): string {
  const detail = typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.output ?? payload);

  switch (status) {
    case 'FAILED':
      return `RunPod job ${jobId} on ${endpointId} FAILED: ${detail}`;
    case 'CANCELLED':
      return `RunPod job ${jobId} on ${endpointId} was CANCELLED before it produced output`;
    case 'TIMED_OUT':
      // Two very different causes, diagnosed differently: raise the endpoint's
      // execution timeout vs. add workers / raise the queue TTL.
      return `RunPod job ${jobId} on ${endpointId} TIMED_OUT — either the worker exceeded its execution timeout or the job's TTL expired while still queued`;
    default:
      return `RunPod job ${jobId} on ${endpointId} ended in ${status}`;
  }
}

/**
 * Polls until the job reaches a terminal state, then returns its output.
 * Throws with a state-specific message on any of the four failure states.
 */
export async function pollJob(endpointId: string, jobId: string): Promise<RunPodOutput> {
  const started = Date.now();
  const deadline = started + config.RUNPOD_JOB_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, config.RUNPOD_POLL_INTERVAL_MS));

    const response = await fetch(endpointUrl(endpointId, `/status/${jobId}`), {
      headers: authHeaders(),
    });

    if (!response.ok) {
      // Transient 5xx while a worker is spinning up is normal — keep polling
      // rather than failing a job we have already paid to start.
      continue;
    }

    const text = await response.text();
    const payload: unknown = JSON.parse(text);
    if (!isRecord(payload) || typeof payload.status !== 'string') continue;

    const status = payload.status;
    if (!isTerminal(status)) continue;

    if (status !== 'COMPLETED') {
      throw new Error(describeFailure(endpointId, jobId, status, payload));
    }

    const bytes = Buffer.byteLength(text, 'utf8');
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[runpod] job ${jobId} on ${endpointId} COMPLETED in ${seconds}s, response ${bytes} bytes`);
    if (bytes > PAYLOAD_WARN_BYTES) {
      console.warn(
        `[runpod] response for job ${jobId} is ${(bytes / 1024 / 1024).toFixed(1)} MB — approaching RunPod's 10 MB cap. Move to bucket upload (output type "s3_url") before this becomes an incident.`,
      );
    }

    if (!isRecord(payload.output)) {
      throw new Error(`RunPod job ${jobId} completed but returned no output`);
    }
    const images = payload.output.images;
    if (!Array.isArray(images)) {
      throw new Error(`RunPod job ${jobId} completed but output.images was not a list`);
    }

    return { images: images.filter(isRunPodImage) };
  }

  throw new Error(
    `RunPod job ${jobId} on ${endpointId} did not finish within ${config.RUNPOD_JOB_TIMEOUT_MS / 1000}s (client-side deadline)`,
  );
}

function isRunPodImage(value: unknown): value is RunPodImage {
  return isRecord(value) && typeof value.type === 'string' && typeof value.data === 'string';
}

/**
 * Decodes a completed job's images. `type` is "base64" today and "s3_url" if we
 * later configure bucket upload, so branch on it rather than assuming — that
 * keeps the switch a config change.
 */
export async function extractImages(output: RunPodOutput): Promise<Buffer[]> {
  return Promise.all(
    output.images.map(async (image) => {
      if (image.type === 's3_url') {
        const response = await fetch(image.data);
        if (!response.ok) {
          throw new Error(`Failed to download generated image from ${image.data} (${response.status})`);
        }
        return Buffer.from(await response.arrayBuffer());
      }

      if (image.type === 'base64') {
        // The worker may or may not include a data: prefix
        const base64 = image.data.replace(/^data:image\/\w+;base64,/, '');
        return Buffer.from(base64, 'base64');
      }

      throw new Error(`Unknown RunPod image type "${image.type}" — expected "base64" or "s3_url"`);
    }),
  );
}

/** Submit, wait, and return the decoded images for a workflow. */
export async function runWorkflow(
  endpointId: string,
  workflow: WorkflowInput,
  label: string,
): Promise<Buffer[]> {
  const jobId = await submitJob(endpointId, workflow);
  console.log(`[runpod] submitted ${label} → endpoint ${endpointId}, job ${jobId}`);

  const output = await pollJob(endpointId, jobId);
  const buffers = await extractImages(output);

  if (buffers.length === 0) {
    throw new Error(`RunPod job ${jobId} completed but produced no images`);
  }
  return buffers;
}
