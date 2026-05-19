import { Response } from 'express';
import { z } from 'zod';
import { exportQuestline, Format } from '../services/questExport';
import { QuestlineRequest } from '../middlewares/requireQuestlineOwnership';

const formatSchema = z.enum([
  'questflow-json',
  'questflow-yaml',
  'unity-asset',
  'unreal-datatable',
  'godot-tres',
]);

function parseFormat(raw: unknown): Format | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const result = formatSchema.safeParse(value);
  return result.success ? (result.data as Format) : null;
}

// GET /questlines/:id/export/preview?format=
export async function previewExport(req: QuestlineRequest, res: Response): Promise<void> {
  const format = parseFormat(req.query.format);
  if (!format) {
    res.status(400).json({ error: `Invalid format. Must be one of: ${formatSchema.options.join(', ')}` });
    return;
  }
  try {
    const result = await exportQuestline(String(req.params.id), format);
    res.json({ filename: result.filename, content: result.content });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
}

// GET /questlines/:id/export?format=
export async function downloadExport(req: QuestlineRequest, res: Response): Promise<void> {
  const format = parseFormat(req.query.format);
  if (!format) {
    res.status(400).json({ error: `Invalid format. Must be one of: ${formatSchema.options.join(', ')}` });
    return;
  }
  try {
    const result = await exportQuestline(String(req.params.id), format);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Type', result.mimeType);
    res.send(result.content);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
}
