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

// ComfyUI-Easy-Use background removal — the class the CB pixel workflow has
// always used. image_output 'Hide' hands the cut-out downstream so the
// regular SaveImage node stays the single save path.
function buildRembgNode(imagesInput: unknown): WorkflowNode {
  return {
    inputs: {
      images: imagesInput,
      rem_mode: 'RMBG-1.4',
      image_output: 'Hide',
      save_prefix: 'questflow_rmbg',
    },
    class_type: 'easy imageRemBg',
    _meta: { title: 'Easy Image Remove Background' },
  };
}

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

  // Per-style background removal: splice a rembg node between the SaveImage
  // node and whatever feeds it, so any preset gets the same pipeline the CB
  // pixel style uses
  if (composed.removeBackground && patchMap.saveImageNode) {
    const saveNode = w[patchMap.saveImageNode];
    w['98'] = buildRembgNode(saveNode.inputs['images']);
    saveNode.inputs['images'] = ['98', 0];
  }

  // Legacy styles only: inject a fallback output for workflows whose primary
  // save node (baked-in rembg with image_output 'Save') may produce empty outputs
  if (patchMap.fallbackSaveImageSource) {
    w['100'] = {
      inputs: {
        images: [patchMap.fallbackSaveImageSource, 0],
      },
      class_type: 'PreviewImage',
      _meta: { title: 'Preview Fallback' },
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

// ---------------------------------------------------------------------------
// Image-input workflows (studio sprite tools). ComfyUI needs the input image
// uploaded to its server first; workflows then reference it by filename.
// ---------------------------------------------------------------------------

interface ComfyUIUploadResponse {
  name: string;
  subfolder?: string;
  type?: string;
}

async function uploadImageToComfy(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)], { type: 'image/png' }), filename);
  form.append('overwrite', 'true');

  const response = await fetch(`${config.COMFYUI_ENDPOINT}/upload/image`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ComfyUI /upload/image failed (${response.status}): ${text}`);
  }
  const data = (await response.json()) as ComfyUIUploadResponse;
  return data.name;
}

function buildRembgWorkflow(uploadedFilename: string): Workflow {
  return {
    '1': {
      inputs: { image: uploadedFilename, upload: 'image' },
      class_type: 'LoadImage',
      _meta: { title: 'Load Input' },
    },
    '2': buildRembgNode(['1', 0]),
    '3': {
      inputs: { images: ['2', 0] },
      class_type: 'PreviewImage',
      _meta: { title: 'Preview Output' },
    },
  };
}

/** Remove an image's background on the local ComfyUI instance. */
export async function removeBackgroundWithComfy(buffer: Buffer): Promise<Buffer> {
  const filename = `questflow_rembg_input_${Date.now()}.png`;
  const uploaded = await uploadImageToComfy(buffer, filename);
  const promptId = await queuePrompt(buildRembgWorkflow(uploaded));
  return pollForResult(promptId, 60_000);
}
