import { randomInt } from 'crypto';
import { config } from '../../config/config';
import { ComposedImagePrompt } from './imagePromptComposer';
import { IWorkflowPatchMap } from '../../models/spriteStyleModel';

interface ComfyUIPromptResponse {
  prompt_id: string;
}

interface ComfyUIHistoryEntry {
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
  status: { completed: boolean; status_string: string };
}

type WorkflowNode = { inputs: Record<string, unknown>; class_type: string; _meta?: unknown };
type Workflow = Record<string, WorkflowNode>;

function patchWorkflow(
  template: Record<string, unknown>,
  composed: ComposedImagePrompt,
  patchMap: IWorkflowPatchMap,
): Workflow {
  const w = JSON.parse(JSON.stringify(template)) as Workflow;

  w[patchMap.checkpointNode].inputs['ckpt_name'] = composed.checkpoint;
  w[patchMap.positivePromptNode].inputs['text'] = composed.positive;
  w[patchMap.negativePromptNode].inputs['text'] = composed.negative;
  w[patchMap.dimensionsNode].inputs['width'] = composed.dimensions.width;
  w[patchMap.dimensionsNode].inputs['height'] = composed.dimensions.height;

  for (const nodeId of patchMap.seedNodes) {
    w[nodeId].inputs['seed'] = randomInt(0, 2 ** 32);
  }

  if (patchMap.samplerParamsNode) {
    const s = composed.sampler;
    w[patchMap.samplerParamsNode].inputs['steps'] = s.steps;
    w[patchMap.samplerParamsNode].inputs['cfg'] = s.cfg;
    w[patchMap.samplerParamsNode].inputs['sampler_name'] = s.sampler;
    w[patchMap.samplerParamsNode].inputs['scheduler'] = s.scheduler;
  }

  if (patchMap.loraNode) {
    composed.loras.forEach((lora, i) => {
      w[patchMap.loraNode!].inputs[`lora_${i + 2}`] = {
        on: true,
        lora: lora.filename,
        strength: lora.strength,
        strengthTwo: lora.strengthClip,
      };
    });
  }

  // Inject fallback SaveImage for workflows whose primary save node may produce empty outputs
  if (patchMap.fallbackSaveImageSource) {
    w['100'] = {
      inputs: {
        filename_prefix: 'questflow_fallback',
        images: [patchMap.fallbackSaveImageSource, 0],
      },
      class_type: 'SaveImage',
      _meta: { title: 'SaveImage Fallback' },
    };
  }

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

export async function generateWithStyle(
  composed: ComposedImagePrompt,
  workflowTemplate: Record<string, unknown>,
  patchMap: IWorkflowPatchMap,
): Promise<Buffer> {
  const patched = patchWorkflow(workflowTemplate, composed, patchMap);
  const promptId = await queuePrompt(patched);
  return pollForResult(promptId);
}
