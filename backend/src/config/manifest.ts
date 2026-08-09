import fs from 'fs/promises';
import path from 'path';
import http from 'http';
import https from 'https';
import { z } from 'zod';
import { config } from './config';

// ---------------------------------------------------------------------------
// Build-time model manifest.
//
// RunPod serverless workers expose only RunPod's own endpoints — ComfyUI runs
// on 127.0.0.1:8188 *inside* the container and is unreachable from here. There
// is no /object_info to query, so model availability is fixed when the images
// are built and shipped to us as this file.
//
// Every generation request is validated against it before we submit anything:
// a bad checkpoint or LoRA name should be a 400 from us, not a job we paid a
// GPU cold start for and that fails inside ComfyUI with "lora not found".
// ---------------------------------------------------------------------------

// LoRAs are baked into the sdxl-lora image only; the other images do not
// contain the files at all.
export const LORA_ENDPOINT_KEY = 'sdxl-lora';

const endpointSchema = z.object({
  image: z.string().min(1),
  checkpoint: z.string().min(1),
  loras: z.array(z.string().min(1)),
  // build.sh emits `"endpoint_id": null` because endpoints do not exist until
  // they are created by hand. Rejecting null here turns "someone forgot step 3"
  // into a boot failure instead of a paid-for job failing at 3am. The same goes
  // for the placeholder in manifest.example.json — copying the example and not
  // filling it in must not produce a backend that boots and then fails on every
  // generation.
  endpoint_id: z
    .string()
    .min(1, 'endpoint_id must be filled in after creating the RunPod endpoint')
    .refine(
      (v) => !v.startsWith('REPLACE_'),
      'endpoint_id is still the placeholder from manifest.example.json — fill in the real RunPod endpoint ID',
    ),
});

const manifestSchema = z.object({
  version: z.string().min(1),
  built_at: z.string().min(1),
  endpoints: z.record(z.string().min(1), endpointSchema).refine(
    (endpoints) => Object.keys(endpoints).length > 0,
    'manifest lists no endpoints',
  ),
});

export type ManifestEndpoint = z.infer<typeof endpointSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export type ManifestSource = 'url' | 'bundled';

let cached: { manifest: Manifest; source: ManifestSource } | null = null;

function describe(manifest: Manifest, source: ManifestSource): string {
  const keys = Object.keys(manifest.endpoints).join(', ');
  return `version=${manifest.version} built_at=${manifest.built_at} source=${source} endpoints=[${keys}]`;
}

/**
 * Deliberately node:http(s) rather than global fetch.
 *
 * The manifest usually lives in the same self-hosted MinIO bucket as our
 * images, behind the same self-signed cert that s3Helper already tolerates via
 * MINIO_REJECT_UNAUTHORIZED. Global fetch ignores https.Agent, so it has no way
 * to honour that setting — and reports the rejection as a bare "fetch failed".
 */
function getJson(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    // Only relax verification for the host we already relax it for
    const isMinio = Boolean(config.MINIO_ENDPOINT) && url.startsWith(config.MINIO_ENDPOINT);
    const agent = parsed.protocol === 'https:'
      ? new https.Agent({ rejectUnauthorized: isMinio ? config.MINIO_REJECT_UNAUTHORIZED : true })
      : undefined;

    const request = client.get(url, { agent, timeout: 10_000 }, (response) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`responded ${status} ${response.statusMessage ?? ''}`.trim()));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    });

    request.on('timeout', () => request.destroy(new Error('timed out after 10s')));
    request.on('error', reject);
  });
}

async function fetchFromUrl(url: string): Promise<Manifest> {
  return manifestSchema.parse(JSON.parse(await getJson(url)));
}

async function readBundled(relativePath: string): Promise<Manifest> {
  // Paths are relative to the backend package root, not to dist/ or src/
  const absolute = path.resolve(__dirname, '../..', relativePath);
  const raw = await fs.readFile(absolute, 'utf8');
  return manifestSchema.parse(JSON.parse(raw));
}

/** Node buries the real network reason in `cause`; "fetch failed" alone is useless. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) return `${err.message} (${cause.message})`;
  return err.message;
}

/**
 * Loads the manifest into the module cache. Prefers the hosted URL so a model
 * change can ship without a backend deploy, and falls back to the file bundled
 * with this build so a flaky bucket cannot stop the backend from starting.
 *
 * Throws if neither yields a valid manifest — running without one means every
 * job is unvalidated, which is worse than not starting.
 */
export async function loadManifest(): Promise<Manifest> {
  const errors: string[] = [];

  if (config.RUNPOD_MANIFEST_URL) {
    try {
      const manifest = await fetchFromUrl(config.RUNPOD_MANIFEST_URL);
      cached = { manifest, source: 'url' };
      console.log(`[manifest] loaded ${describe(manifest, 'url')}`);
      return manifest;
    } catch (err) {
      const message = describeError(err);
      errors.push(`url (${config.RUNPOD_MANIFEST_URL}): ${message}`);
      console.warn(`[manifest] URL load failed, falling back to bundled file — ${message}`);
    }
  }

  try {
    const manifest = await readBundled(config.RUNPOD_MANIFEST_FALLBACK_PATH);
    cached = { manifest, source: 'bundled' };
    console.log(`[manifest] loaded ${describe(manifest, 'bundled')}`);
    return manifest;
  } catch (err) {
    errors.push(`bundled (${config.RUNPOD_MANIFEST_FALLBACK_PATH}): ${describeError(err)}`);
  }

  throw new Error(`Could not load a valid RunPod manifest. Tried:\n  - ${errors.join('\n  - ')}`);
}

/** Re-reads the manifest so a model change does not require a redeploy. */
export async function reloadManifest(): Promise<Manifest> {
  cached = null;
  return loadManifest();
}

export function getManifest(): Manifest {
  if (!cached) {
    throw new Error('Manifest not loaded — loadManifest() must run during boot');
  }
  return cached.manifest;
}

export function getManifestSource(): ManifestSource {
  if (!cached) {
    throw new Error('Manifest not loaded — loadManifest() must run during boot');
  }
  return cached.source;
}

export function getEndpoint(endpointKey: string): ManifestEndpoint {
  const endpoint = getManifest().endpoints[endpointKey];
  if (!endpoint) {
    const known = Object.keys(getManifest().endpoints).join(', ');
    throw new Error(`Unknown endpoint "${endpointKey}" — manifest ${getManifest().version} has: ${known}`);
  }
  return endpoint;
}

export function listEndpointKeys(): string[] {
  return Object.keys(getManifest().endpoints);
}

/**
 * Checks a style's model choices against what is actually baked into the image
 * behind its endpoint. Returns human-readable problems; empty means valid.
 */
export function validateStyleAgainstManifest(
  endpointKey: string,
  checkpointFilename: string,
  loraFilenames: string[],
): string[] {
  const manifest = getManifest();
  const endpoint = manifest.endpoints[endpointKey];

  if (!endpoint) {
    const known = Object.keys(manifest.endpoints).join(', ');
    return [`Unknown endpoint "${endpointKey}". Available: ${known}`];
  }

  const problems: string[] = [];

  if (checkpointFilename !== endpoint.checkpoint) {
    problems.push(
      `Endpoint "${endpointKey}" has "${endpoint.checkpoint}" baked in — it cannot load "${checkpointFilename}"`,
    );
  }

  if (loraFilenames.length > 0 && endpointKey !== LORA_ENDPOINT_KEY) {
    problems.push(
      `Endpoint "${endpointKey}" contains no LoRA files — only "${LORA_ENDPOINT_KEY}" can use LoRAs`,
    );
  } else {
    for (const lora of loraFilenames) {
      if (!endpoint.loras.includes(lora)) {
        problems.push(`LoRA "${lora}" is not in the "${endpointKey}" image (manifest ${manifest.version})`);
      }
    }
  }

  return problems;
}
