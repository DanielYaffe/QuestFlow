import { randomInt } from 'crypto';
import { getEndpoint } from '../../config/manifest';
import { runWorkflow } from './runpodClient';
import { ComposedImagePrompt } from './imagePromptComposer';
import { IWorkflowPatchMap } from '../../models/spriteStyleModel';

// ---------------------------------------------------------------------------
// Workflows are stored server-side as templates and only ever patched here —
// prompt, seed, dimensions, sampler, LoRA name and strength. Raw workflow JSON
// is never accepted from a client: ComfyUI custom nodes execute arbitrary
// Python, so a client-supplied workflow is remote code execution on the worker
// plus an unbounded GPU bill.
//
// Model names patched in must match the filenames baked into the image byte for
// byte, which is what manifest validation guarantees before we get here.
// ---------------------------------------------------------------------------

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

  return w;
}

/**
 * Runs a style's workflow on the RunPod endpoint that has its checkpoint baked
 * in. Background removal is not part of this — it runs on CPU in the worker
 * after the image comes back (see services/generation/backgroundRemover.ts).
 */
export async function generateWithStyle(
  composed: ComposedImagePrompt,
  workflowTemplate: Record<string, unknown>,
  patchMap: IWorkflowPatchMap,
  endpointKey: string,
): Promise<Buffer> {
  const endpoint = getEndpoint(endpointKey);
  const patched = patchWorkflow(workflowTemplate, composed, patchMap);
  const images = await runWorkflow(endpoint.endpoint_id, patched, `style:${endpointKey}`);
  return images[0];
}
