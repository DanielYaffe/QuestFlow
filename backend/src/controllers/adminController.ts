import { Response } from 'express';
import { z, ZodType } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';
import { isHttpError } from '../utils/httpError';
import * as styleAdmin from '../services/admin/spriteStyleAdminService';
import * as registryAdmin from '../services/admin/modelRegistryAdminService';
import * as userAdmin from '../services/admin/userAdminService';
import { getInstalledModels } from '../services/admin/comfyModelService';

function handleError(res: Response, err: unknown, context: string): void {
  if (isHttpError(err)) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(`[adminController] ${context}:`, err);
  res.status(500).json({ error: `Failed to ${context}` });
}

function param(req: AuthRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function parseBody<T>(schema: ZodType<T>, req: AuthRequest, res: Response): T | undefined {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: z.flattenError(parsed.error).fieldErrors });
    return undefined;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Workflow presets
// ---------------------------------------------------------------------------

export function getWorkflowPresets(_req: AuthRequest, res: Response) {
  res.json(styleAdmin.listPresets());
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export async function getStyles(_req: AuthRequest, res: Response) {
  try {
    res.json(await styleAdmin.listStyles());
  } catch (err) {
    handleError(res, err, 'list styles');
  }
}

export async function createStyle(req: AuthRequest, res: Response) {
  const input = parseBody(styleAdmin.createStyleSchema, req, res);
  if (!input) return;
  try {
    const result = await styleAdmin.createStyle(input);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'create style');
  }
}

export async function updateStyle(req: AuthRequest, res: Response) {
  const input = parseBody(styleAdmin.updateStyleSchema, req, res);
  if (!input) return;
  try {
    const result = await styleAdmin.updateStyle(param(req, 'styleId'), input);
    res.json(result);
  } catch (err) {
    handleError(res, err, 'update style');
  }
}

export async function setDefaultStyle(req: AuthRequest, res: Response) {
  try {
    res.json(await styleAdmin.setDefaultStyle(param(req, 'styleId')));
  } catch (err) {
    handleError(res, err, 'set default style');
  }
}

const reorderSchema = z.object({ styleIds: z.array(z.string().min(1)).min(1) });

export async function reorderStyles(req: AuthRequest, res: Response) {
  const input = parseBody(reorderSchema, req, res);
  if (!input) return;
  try {
    await styleAdmin.reorderStyles(input.styleIds);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 'reorder styles');
  }
}

export async function deleteStyle(req: AuthRequest, res: Response) {
  try {
    await styleAdmin.deleteStyle(param(req, 'styleId'));
    res.status(204).send();
  } catch (err) {
    handleError(res, err, 'delete style');
  }
}

// ---------------------------------------------------------------------------
// Checkpoint registry
// ---------------------------------------------------------------------------

export async function getCheckpoints(_req: AuthRequest, res: Response) {
  try {
    res.json(await registryAdmin.listCheckpoints());
  } catch (err) {
    handleError(res, err, 'list checkpoints');
  }
}

export async function createCheckpoint(req: AuthRequest, res: Response) {
  const input = parseBody(registryAdmin.createCheckpointSchema, req, res);
  if (!input) return;
  try {
    res.status(201).json(await registryAdmin.createCheckpoint(input));
  } catch (err) {
    handleError(res, err, 'create checkpoint');
  }
}

export async function updateCheckpoint(req: AuthRequest, res: Response) {
  const input = parseBody(registryAdmin.updateCheckpointSchema, req, res);
  if (!input) return;
  try {
    res.json(await registryAdmin.updateCheckpoint(param(req, 'filename'), input));
  } catch (err) {
    handleError(res, err, 'update checkpoint');
  }
}

export async function deleteCheckpoint(req: AuthRequest, res: Response) {
  try {
    await registryAdmin.deleteCheckpoint(param(req, 'filename'));
    res.status(204).send();
  } catch (err) {
    handleError(res, err, 'delete checkpoint');
  }
}

// ---------------------------------------------------------------------------
// LoRA registry
// ---------------------------------------------------------------------------

export async function getLoras(_req: AuthRequest, res: Response) {
  try {
    res.json(await registryAdmin.listLoras());
  } catch (err) {
    handleError(res, err, 'list loras');
  }
}

export async function createLora(req: AuthRequest, res: Response) {
  const input = parseBody(registryAdmin.createLoraSchema, req, res);
  if (!input) return;
  try {
    res.status(201).json(await registryAdmin.createLora(input));
  } catch (err) {
    handleError(res, err, 'create lora');
  }
}

export async function updateLora(req: AuthRequest, res: Response) {
  const input = parseBody(registryAdmin.updateLoraSchema, req, res);
  if (!input) return;
  try {
    res.json(await registryAdmin.updateLora(param(req, 'filename'), input));
  } catch (err) {
    handleError(res, err, 'update lora');
  }
}

export async function deleteLora(req: AuthRequest, res: Response) {
  try {
    await registryAdmin.deleteLora(param(req, 'filename'));
    res.status(204).send();
  } catch (err) {
    handleError(res, err, 'delete lora');
  }
}

// ---------------------------------------------------------------------------
// User roles
// ---------------------------------------------------------------------------

export async function getUsers(_req: AuthRequest, res: Response) {
  try {
    res.json(await userAdmin.listUsers());
  } catch (err) {
    handleError(res, err, 'list users');
  }
}

export async function setUserRole(req: AuthRequest, res: Response) {
  const input = parseBody(userAdmin.setRoleSchema, req, res);
  if (!input) return;
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    res.json(await userAdmin.setUserRole(req.user._id, param(req, 'userId'), input.role));
  } catch (err) {
    handleError(res, err, 'update user role');
  }
}

// ---------------------------------------------------------------------------
// ComfyUI installed models
// ---------------------------------------------------------------------------

export async function getComfyModels(_req: AuthRequest, res: Response) {
  try {
    res.json(await getInstalledModels());
  } catch (err) {
    handleError(res, err, 'fetch ComfyUI models');
  }
}
