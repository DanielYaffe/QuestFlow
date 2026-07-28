import { config } from '../../config/config';

export interface ComfyInstalledModels {
  reachable: boolean;
  checkpoints: string[];
  loras: string[];
  samplers: string[];
  schedulers: string[];
}

// /object_info/<NodeClass> → { <NodeClass>: { input: { required: { <field>: [[...options]] } } } }
type ObjectInfoResponse = Record<string, { input?: { required?: Record<string, unknown> } }>;

function extractOptions(info: ObjectInfoResponse, nodeClass: string, field: string): string[] {
  const required = info[nodeClass]?.input?.required;
  if (!required) return [];
  const entry = required[field];
  if (!Array.isArray(entry) || !Array.isArray(entry[0])) return [];
  return entry[0].filter((v): v is string => typeof v === 'string');
}

async function fetchNodeOptions(nodeClass: string, field: string): Promise<string[]> {
  const response = await fetch(`${config.COMFYUI_ENDPOINT}/object_info/${nodeClass}`);
  if (!response.ok) {
    throw new Error(`ComfyUI /object_info/${nodeClass} responded ${response.status}`);
  }
  const info = (await response.json()) as ObjectInfoResponse;
  return extractOptions(info, nodeClass, field);
}

// Lists the model files actually present on the ComfyUI host, so the admin UI
// can offer dropdowns and styles can be validated before activation.
export async function getInstalledModels(): Promise<ComfyInstalledModels> {
  try {
    const [checkpoints, loras, samplers, schedulers] = await Promise.all([
      fetchNodeOptions('CheckpointLoaderSimple', 'ckpt_name'),
      fetchNodeOptions('LoraLoader', 'lora_name'),
      fetchNodeOptions('KSampler', 'sampler_name'),
      fetchNodeOptions('KSampler', 'scheduler'),
    ]);
    return { reachable: true, checkpoints, loras, samplers, schedulers };
  } catch (err) {
    console.error('[comfyModelService] ComfyUI unreachable:', err instanceof Error ? err.message : err);
    return { reachable: false, checkpoints: [], loras: [], samplers: [], schedulers: [] };
  }
}

// Returns warnings (not errors) — ComfyUI may legitimately be offline while
// editing styles; missing files only matter at generation time.
export async function validateModelFiles(
  checkpointFilename: string,
  loraFilenames: string[],
): Promise<string[]> {
  const installed = await getInstalledModels();
  if (!installed.reachable) {
    return ['ComfyUI is unreachable — could not verify model files exist'];
  }

  const warnings: string[] = [];
  if (!installed.checkpoints.includes(checkpointFilename)) {
    warnings.push(`Checkpoint "${checkpointFilename}" not found on ComfyUI host`);
  }
  for (const lora of loraFilenames) {
    if (!installed.loras.includes(lora)) {
      warnings.push(`LoRA "${lora}" not found on ComfyUI host`);
    }
  }
  return warnings;
}
