import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/authMiddleware';
import ExportTemplateModel from '../models/exportTemplateModel';
import TemplateKbMappingModel from '../models/templateKbMappingModel';
import { ownsGame } from '../services/gameService';
import {
  normalizeMappingEntries,
  proposeTemplateKbMappings,
  sampleKbFields,
  upsertTemplateKbMappings,
} from '../services/templateKbMappingService';
import { TemplateSchema } from '../services/exportTemplates/templateParser';

function getGameId(req: AuthRequest): string {
  return typeof req.query.gameId === 'string'
    ? req.query.gameId
    : typeof req.body?.gameId === 'string'
      ? req.body.gameId
      : '';
}

async function loadOwnedTemplate(req: AuthRequest, res: Response) {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const templateId = req.params.id;
  if (!mongoose.isValidObjectId(templateId)) {
    res.status(400).json({ error: 'Invalid template id' });
    return null;
  }
  const template = await ExportTemplateModel.findOne({
    _id: templateId,
    $or: [{ isBuiltIn: true }, { ownerId: userId }],
  }).lean();
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return null;
  }
  return template;
}

async function assertOwnedGame(req: AuthRequest, res: Response): Promise<string | null> {
  const userId = req.user?._id;
  const gameId = getGameId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (!mongoose.isValidObjectId(gameId)) {
    res.status(400).json({ error: 'Valid gameId is required' });
    return null;
  }
  if (!(await ownsGame(String(userId), gameId))) {
    res.status(403).json({ error: 'Game not found or not owned by you' });
    return null;
  }
  return gameId;
}

function toDto(doc: any) {
  return {
    _id: doc?._id?.toString?.() ?? '',
    ownerId: doc?.ownerId ?? '',
    gameId: doc?.gameId ?? '',
    templateId: doc?.templateId ?? '',
    entries: doc?.entries ?? [],
    analyzedAt: doc?.analyzedAt,
    updatedAt: doc?.updatedAt,
  };
}

function mergeWithExisting(existingEntries: any[], proposedEntries: any[]) {
  const keep = existingEntries.filter((entry) => entry?.status === 'validated' || entry?.status === 'disabled');
  const used = new Set(keep.map((entry) => `${entry.templatePath}:${entry.kbType}:${entry.kbFieldPath}`));
  const proposals = proposedEntries.filter((entry) => {
    const key = `${entry.templatePath}:${entry.kbType}:${entry.kbFieldPath}`;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });
  return [...keep, ...proposals];
}

export async function listTemplateKbMappings(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    const template = await loadOwnedTemplate(req, res);
    if (!template || !userId) return;
    const gameId = await assertOwnedGame(req, res);
    if (!gameId) return;

    const mapping = await TemplateKbMappingModel.findOne({
      ownerId: String(userId),
      gameId,
      templateId: template._id.toString(),
    }).lean();
    res.json(toDto(mapping ?? { ownerId: String(userId), gameId, templateId: template._id.toString(), entries: [] }));
  } catch (error) {
    console.error('[templateKbMapping] list error:', error);
    res.status(500).json({ error: 'Failed to load template KB mappings' });
  }
}

export async function analyzeTemplateKbMappings(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    const template = await loadOwnedTemplate(req, res);
    if (!template || !userId) return;
    const gameId = await assertOwnedGame(req, res);
    if (!gameId) return;

    const proposed = await proposeTemplateKbMappings({
      ownerId: String(userId),
      gameId,
      templateId: template._id.toString(),
      templateName: template.name,
      schema: template.templateSchema as TemplateSchema,
    });
    const existing = await TemplateKbMappingModel.findOne({
      ownerId: String(userId),
      gameId,
      templateId: template._id.toString(),
    }).lean();
    const mapping = await upsertTemplateKbMappings({
      ownerId: String(userId),
      gameId,
      templateId: template._id.toString(),
      entries: mergeWithExisting(existing?.entries ?? [], proposed),
    });
    res.json(toDto(mapping));
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(502).json({ error: 'AI returned malformed mapping JSON' });
      return;
    }
    console.error('[templateKbMapping] analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze template KB mappings' });
  }
}

export async function saveTemplateKbMappings(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    const template = await loadOwnedTemplate(req, res);
    if (!template || !userId) return;
    const gameId = await assertOwnedGame(req, res);
    if (!gameId) return;

    const samples = await sampleKbFields(gameId);
    const entries = normalizeMappingEntries(
      req.body?.entries,
      template.templateSchema as TemplateSchema,
      samples,
      'validated',
    );
    const mapping = await upsertTemplateKbMappings({
      ownerId: String(userId),
      gameId,
      templateId: template._id.toString(),
      entries,
    });
    res.json(toDto(mapping));
  } catch (error) {
    console.error('[templateKbMapping] save error:', error);
    res.status(400).json({ error: 'Failed to save template KB mappings' });
  }
}

export async function deleteTemplateKbMappings(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    const template = await loadOwnedTemplate(req, res);
    if (!template || !userId) return;
    const gameId = await assertOwnedGame(req, res);
    if (!gameId) return;
    await TemplateKbMappingModel.deleteOne({
      ownerId: String(userId),
      gameId,
      templateId: template._id.toString(),
    });
    res.json({ message: 'Template KB mappings deleted' });
  } catch (error) {
    console.error('[templateKbMapping] delete error:', error);
    res.status(500).json({ error: 'Failed to delete template KB mappings' });
  }
}
