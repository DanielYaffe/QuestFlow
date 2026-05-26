import { readFileSync } from 'fs';
import { join } from 'path';
import { randomInt } from 'crypto';
import { config } from '../../config/config';
import { ComposedImagePrompt } from './imagePromptComposer';

interface ComfyUIPromptResponse {
  prompt_id: string;
}

interface ComfyUIHistoryEntry {
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
  status: { completed: boolean; status_string: string };
}

type WorkflowNode = { inputs: Record<string, unknown>; class_type: string; _meta?: unknown };
type Workflow = Record<string, WorkflowNode>;

function loadWorkflow(): Workflow {
  const workflowPath = join(__dirname, 'workflows', 'sdxl_power_lora.json');
  return JSON.parse(readFileSync(workflowPath, 'utf-8')) as Workflow;
}

function patchWorkflow(composed: ComposedImagePrompt): Workflow {
  const w = JSON.parse(JSON.stringify(loadWorkflow())) as Workflow;

  w['1'].inputs['ckpt_name'] = composed.checkpoint;

  // lora_1 is DMD2, baked into the template — style loras start at lora_2
  composed.loras.forEach((lora, i) => {
    const key = `lora_${i + 2}`;
    w['2'].inputs[key] = {
      on: true,
      lora: lora.filename,
      strength: lora.strength,
      strengthTwo: lora.strengthClip,
    };
  });

  w['3'].inputs['text'] = composed.positive;
  w['4'].inputs['text'] = composed.negative;
  w['5'].inputs['width'] = composed.dimensions.width;
  w['5'].inputs['height'] = composed.dimensions.height;
  w['6'].inputs['seed'] = randomInt(0, 2 ** 32);
  w['6'].inputs['steps'] = composed.sampler.steps;
  w['6'].inputs['cfg'] = composed.sampler.cfg;
  w['6'].inputs['sampler_name'] = composed.sampler.sampler;
  w['6'].inputs['scheduler'] = composed.sampler.scheduler;

  // Fallback SaveImage: guarantees a history output if easy imageRemBg's Save
  // sink produces empty outputs (observed intermittently). pollForResult iterates
  // all node outputs so it picks up whichever node actually writes the image.
  w['100'] = {
    inputs: { filename_prefix: 'questflow_fallback', images: ['9', 0] },
    class_type: 'SaveImage',
    _meta: { title: 'SaveImage Fallback' },
  };

  return w;
}

async function queuePrompt(workflow: Workflow): Promise<string> {
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

export async function generateWithStyle(composed: ComposedImagePrompt): Promise<Buffer> {
  const patched = patchWorkflow(composed);
  const promptId = await queuePrompt(patched);
  return pollForResult(promptId);
}
