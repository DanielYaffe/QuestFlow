import { Response } from 'express';
import ExportTemplateModel from '../models/exportTemplateModel';
import { AuthRequest } from '../middlewares/authMiddleware';

export async function getAll(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  try {
    const templates = await ExportTemplateModel.find({
      $or: [{ isBuiltIn: true }, { ownerId: userId }],
    }).sort({ isBuiltIn: -1, createdAt: 1 });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
}

export async function create(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { name, engine, structure } = req.body as {
    name?: string;
    engine?: string;
    structure?: object;
  };
  if (!name || !structure) {
    res.status(400).json({ error: 'name and structure are required' });
    return;
  }
  try {
    const template = await ExportTemplateModel.create({
      ownerId: userId,
      name,
      engine: engine ?? 'custom',
      isBuiltIn: false,
      structure,
    });
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save template' });
  }
}

export async function deleteTemplate(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  try {
    const template = await ExportTemplateModel.findById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (template.isBuiltIn) {
      res.status(403).json({ error: 'Cannot delete built-in templates' });
      return;
    }
    if (template.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await ExportTemplateModel.findByIdAndDelete(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
}
