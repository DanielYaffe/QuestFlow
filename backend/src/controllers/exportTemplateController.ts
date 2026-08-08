import { Response } from 'express';
import ExportTemplateModel, { seedBuiltInExportTemplates } from '../models/exportTemplateModel';
import { AuthRequest } from '../middlewares/authMiddleware';
import { parseTemplate, TemplateFormat, TemplateSchema } from '../services/exportTemplates/templateParser';
import { analyzeTemplate } from '../services/exportTemplates/templateAnalysisService';

const MIME_BY_FORMAT: Record<TemplateFormat, string> = {
  json: 'application/json',
  yaml: 'application/x-yaml',
  xml: 'application/xml',
};

const EXT_BY_FORMAT: Record<TemplateFormat, string> = {
  json: '.json',
  yaml: '.yaml',
  xml: '.xml',
};

function normalizeFormat(raw: unknown): TemplateFormat | undefined {
  return raw === 'json' || raw === 'yaml' || raw === 'xml' ? raw : undefined;
}

function normalizeHintContext(raw: unknown): { generationContract?: Partial<TemplateSchema['generationContract']> } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const contract = (raw as { generationContract?: unknown }).generationContract;
  if (!contract || typeof contract !== 'object') return undefined;
  return { generationContract: contract as Partial<TemplateSchema['generationContract']> };
}

function toDto(template: any) {
  return {
    _id: template._id.toString(),
    ownerId: template.ownerId,
    name: template.name,
    engine: template.engine,
    isBuiltIn: template.isBuiltIn,
    description: template.description,
    rawTemplate: template.rawTemplate,
    acceptedInputFormat: template.acceptedInputFormat,
    targetScope: template.targetScope,
    defaultOutputFormat: template.defaultOutputFormat,
    structure: template.structure,
    templateAst: template.templateAst,
    fieldSchema: template.fieldSchema,
    templateSchema: template.templateSchema,
    schemaSummary: template.schemaSummary,
    analysisStatus: template.analysisStatus,
    analysisError: template.analysisError,
    analyzedAt: template.analyzedAt,
    inferredAiGuidance: template.inferredAiGuidance,
    output: template.output,
  };
}

export async function listExportTemplates(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    await seedBuiltInExportTemplates();
    const templates = await ExportTemplateModel.find({
      $or: [{ isBuiltIn: true }, { ownerId: userId }],
    }).sort({ isBuiltIn: -1, name: 1 });
    res.json(templates.map(toDto));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load templates' });
  }
}

export async function createExportTemplate(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  const {
    name,
    description,
    rawTemplate,
    inputFormat,
    defaultOutputFormat,
    templateSchema,
  } = req.body as {
    name?: string;
    description?: string;
    rawTemplate?: string;
    inputFormat?: TemplateFormat;
    defaultOutputFormat?: TemplateFormat;
    templateSchema?: unknown;
  };

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!name?.trim() || !rawTemplate?.trim()) {
    res.status(400).json({ error: 'Template name and content are required.' });
    return;
  }

  try {
    const parsed = parseTemplate(rawTemplate, normalizeFormat(inputFormat));
    const outputFormat = normalizeFormat(defaultOutputFormat) ?? parsed.format;
    const analysis = await analyzeTemplate(name.trim(), parsed, { existingSchema: normalizeHintContext(templateSchema) });
    const template = await ExportTemplateModel.create({
      ownerId: userId,
      name: name.trim(),
      description: description?.trim() ?? '',
      rawTemplate,
      acceptedInputFormat: parsed.format,
      defaultOutputFormat: outputFormat,
      structure: parsed.structure,
      templateAst: parsed.templateAst,
      fieldSchema: parsed.fieldSchema,
      templateSchema: analysis.templateSchema,
      schemaSummary: analysis.schemaSummary,
      analysisStatus: analysis.analysisStatus,
      analysisError: analysis.analysisError,
      analyzedAt: analysis.analyzedAt,
      inferredAiGuidance: analysis.inferredAiGuidance,
      output: {
        extension: EXT_BY_FORMAT[outputFormat],
        mimeType: MIME_BY_FORMAT[outputFormat],
        mode: outputFormat,
      },
    });
    res.status(201).json(toDto(template));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid template' });
  }
}

export async function updateExportTemplate(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    const template = await ExportTemplateModel.findById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (template.isBuiltIn || template.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const rawTemplate = typeof req.body.rawTemplate === 'string' ? req.body.rawTemplate : template.rawTemplate;
    const parsed = parseTemplate(rawTemplate, normalizeFormat(req.body.inputFormat) ?? template.acceptedInputFormat);
    const outputFormat = normalizeFormat(req.body.defaultOutputFormat) ?? template.defaultOutputFormat;
    const nextName = typeof req.body.name === 'string' ? req.body.name.trim() : template.name;
    const existingSchema = normalizeHintContext(req.body.templateSchema)
      ?? normalizeHintContext(template.templateSchema);
    const analysis = await analyzeTemplate(nextName, parsed, {
      existingSchema,
      skipAi: req.body.skipAnalysis === true,
    });

    template.name = nextName;
    template.description = typeof req.body.description === 'string' ? req.body.description.trim() : template.description;
    template.rawTemplate = rawTemplate;
    template.acceptedInputFormat = parsed.format;
    template.defaultOutputFormat = outputFormat;
    template.structure = parsed.structure;
    template.templateAst = parsed.templateAst;
    template.fieldSchema = parsed.fieldSchema;
    template.templateSchema = analysis.templateSchema;
    template.schemaSummary = analysis.schemaSummary;
    template.analysisStatus = analysis.analysisStatus;
    template.analysisError = analysis.analysisError;
    template.analyzedAt = analysis.analyzedAt;
    template.inferredAiGuidance = analysis.inferredAiGuidance;
    template.output = {
      extension: EXT_BY_FORMAT[outputFormat],
      mimeType: MIME_BY_FORMAT[outputFormat],
      mode: outputFormat,
    };
    await template.save();
    res.json(toDto(template));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid template' });
  }
}

export async function analyzeExportTemplate(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    const template = await ExportTemplateModel.findById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (template.isBuiltIn || template.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const parsed = parseTemplate(template.rawTemplate, template.acceptedInputFormat);
    const existingSchema = normalizeHintContext(req.body.templateSchema)
      ?? normalizeHintContext(template.templateSchema);
    const analysis = await analyzeTemplate(template.name, parsed, { forceAi: true, existingSchema });
    template.structure = parsed.structure;
    template.templateAst = parsed.templateAst;
    template.fieldSchema = parsed.fieldSchema;
    template.templateSchema = analysis.templateSchema;
    template.schemaSummary = analysis.schemaSummary;
    template.analysisStatus = analysis.analysisStatus;
    template.analysisError = analysis.analysisError;
    template.analyzedAt = analysis.analyzedAt;
    template.inferredAiGuidance = analysis.inferredAiGuidance;
    await template.save();
    res.json(toDto(template));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to analyze template' });
  }
}

export async function deleteExportTemplate(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  try {
    const template = await ExportTemplateModel.findById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    if (template.isBuiltIn || template.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await template.deleteOne();
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
}
