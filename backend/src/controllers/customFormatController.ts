import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import CustomFormatModel, { IBindingRule } from '../models/customFormatModel';
import { renderOne, sampleContext, CustomFormatSpec } from '../services/questExport/renderCustomFormat';

interface DraftBody {
  name?: string;
  extension?: string;
  fileNamePattern?: string;
  example?: unknown;
  bindings?: Record<string, IBindingRule>;
}

function toSummary(cf: InstanceType<typeof CustomFormatModel>) {
  return {
    id:              cf._id.toString(),
    name:            cf.name,
    extension:       cf.extension,
    fileNamePattern: cf.fileNamePattern,
    example:         cf.example,
    bindings:        cf.bindings ?? {},
  };
}

// GET /custom-formats
export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    const items = await CustomFormatModel.find({ ownerId: req.user?._id }).sort({ updatedAt: -1 });
    res.json(items.map(toSummary));
  } catch {
    res.status(500).json({ error: 'Failed to load custom formats' });
  }
}

// POST /custom-formats
export async function create(req: AuthRequest, res: Response): Promise<void> {
  const { name, extension, fileNamePattern, example, bindings } = req.body as DraftBody;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  try {
    const cf = await CustomFormatModel.create({
      ownerId:         req.user?._id,
      name:            name.trim(),
      extension:       (extension || 'json').replace(/^\.+/, ''),
      fileNamePattern: fileNamePattern || '{{id}}',
      example:         example ?? {},
      bindings:        bindings ?? {},
    });
    res.status(201).json(toSummary(cf));
  } catch {
    res.status(500).json({ error: 'Failed to create custom format' });
  }
}

// DELETE /custom-formats/:id
export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cf = await CustomFormatModel.findById(req.params.id);
    if (!cf) { res.status(404).json({ error: 'Not found' }); return; }
    if (cf.ownerId !== req.user?._id) { res.status(403).json({ error: 'Forbidden' }); return; }
    await cf.deleteOne();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete custom format' });
  }
}

// POST /custom-formats/preview-sample — render a draft against a synthetic quest
export async function previewSample(req: AuthRequest, res: Response): Promise<void> {
  const { name, extension, fileNamePattern, example, bindings } = req.body as DraftBody;
  const spec: CustomFormatSpec = {
    name:            name || 'Custom',
    extension:       extension || 'json',
    fileNamePattern: fileNamePattern || '{{id}}',
    example:         example ?? {},
    bindings:        bindings ?? {},
  };
  try {
    const { fileName, content } = renderOne(spec, sampleContext());
    res.json({ fileName, content });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Preview failed' });
  }
}
