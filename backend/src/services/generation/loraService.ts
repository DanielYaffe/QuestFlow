import { readFileSync } from 'fs';
import { join } from 'path';
import { randomInt } from 'crypto';
import { config } from '../../config/config';

const DEFAULT_NEGATIVE =
  '(low quality, worst quality:1.4), blurry, 3d render, realistic, photographic, smooth gradients, messy pixels, human face, human hands, symmetrical body, flesh, bright happy colors, out of frame, cropped.';

export interface LoraGenerationOptions {
  positivePrompt: string;
  negativePrompt?: string;
  loraName: string;        // filename in ComfyUI's models/loras/ folder
  triggerWord: string;     // prepended to positive prompt (e.g. "cbstyle")
  width?: number;
  height?: number;
}

export interface BaseGenerationOptions {
  positivePrompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

interface ComfyUIPromptResponse {
  prompt_id: string;
}

interface ComfyUIHistoryEntry {
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
  status: { completed: boolean; status_string: string };
}

function loadWorkflow(name: string): Record<string, unknown> {
  const workflowPath = join(__dirname, 'workflows', `${name}.json`);
  return JSON.parse(readFileSync(workflowPath, 'utf-8'));
}

type WorkflowNode = { inputs: Record<string, unknown>; class_type: string; _meta?: unknown };
type Workflow = Record<string, WorkflowNode>;

function patchLoraWorkflow(
  workflow: Record<string, unknown>,
  opts: LoraGenerationOptions,
): Workflow {
  const w = JSON.parse(JSON.stringify(workflow)) as Workflow;

  const positive = `${opts.triggerWord}, ${opts.positivePrompt}`;
  const negative = opts.negativePrompt || DEFAULT_NEGATIVE;

  w['2'].inputs['lora_name'] = opts.loraName;
  w['3'].inputs['text'] = positive;
  w['4'].inputs['text'] = negative;
  if (opts.width)  w['5'].inputs['width']  = opts.width;
  if (opts.height) w['5'].inputs['height'] = opts.height;
  w['6'].inputs['seed'] = randomInt(0, 2 ** 32);

  return w;
}

function patchBaseWorkflow(
  workflow: Record<string, unknown>,
  opts: BaseGenerationOptions,
): Workflow {
  const w = JSON.parse(JSON.stringify(workflow)) as Workflow;

  w['3'].inputs['text'] = opts.positivePrompt;
  w['4'].inputs['text'] = opts.negativePrompt || DEFAULT_NEGATIVE;
  if (opts.width)  w['5'].inputs['width']  = opts.width;
  if (opts.height) w['5'].inputs['height'] = opts.height;
  w['6'].inputs['seed'] = randomInt(0, 2 ** 32);

  return w;
}

async function queuePrompt(workflow: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${config.COMFYUI_ENDPOINT}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ComfyUI /prompt failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as ComfyUIPromptResponse;
  return data.prompt_id;
}

async function pollForResult(promptId: string, timeoutMs = 120_000): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_500));

    const response = await fetch(`${config.COMFYUI_ENDPOINT}/history/${promptId}`);
    if (!response.ok) continue;

    const history = (await response.json()) as Record<string, ComfyUIHistoryEntry>;
    const entry = history[promptId];

    if (!entry?.status?.completed) continue;

    for (const nodeOutput of Object.values(entry.outputs)) {
      const image = nodeOutput.images?.[0];
      if (!image) continue;

      const params = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder,
        type: image.type,
      });
      const imgResponse = await fetch(`${config.COMFYUI_ENDPOINT}/view?${params}`);
      if (!imgResponse.ok) throw new Error('Failed to fetch generated image from ComfyUI');

      return Buffer.from(await imgResponse.arrayBuffer());
    }

    throw new Error('ComfyUI job completed but no image found in output');
  }

  throw new Error(`ComfyUI generation timed out after ${timeoutMs / 1000}s`);
}

export async function generateWithLora(opts: LoraGenerationOptions): Promise<Buffer> {
  const workflowName = opts.loraName.replace(/\.safetensors$/, '').replace(/[^a-z0-9_-]/gi, '_');

  let workflow: Record<string, unknown>;
  try {
    workflow = loadWorkflow(workflowName);
  } catch {
    workflow = loadWorkflow('cbstyle');
  }

  const patched = patchLoraWorkflow(workflow, opts);
  const promptId = await queuePrompt(patched);
  return pollForResult(promptId);
}

export async function generateBase(opts: BaseGenerationOptions): Promise<Buffer> {
  const workflow = loadWorkflow('base');
  const patched = patchBaseWorkflow(workflow, opts);
  const promptId = await queuePrompt(patched);
  return pollForResult(promptId);
}
