import api from './axiosInstance';

export type TemplateFormat = 'json' | 'yaml' | 'xml';
export type TemplateFieldShape =
  | 'scalar'
  | 'date'
  | 'object'
  | 'array'
  | 'objectRows'
  | 'scalarList'
  | 'conditionGroup'
  | 'conditionList'
  | 'mixedList';

export interface TemplateFieldSummary {
  path: string;
  templatePath?: string;
  label: string;
  kind: 'text' | 'number' | 'boolean' | 'array' | 'object';
  valueType?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  control?: 'text' | 'number' | 'checkbox' | 'json' | 'rows' | 'dialogFlow' | 'date';
  shape?: TemplateFieldShape;
  gameplayRole?: string;
  fillSource?: string;
  description?: string;
  defaultValue?: unknown;
  itemSchema?: Array<{
    path: string;
    label: string;
    valueType: 'string' | 'number' | 'boolean';
    required: boolean;
  }>;
}

export interface TemplateSchema {
  version: number;
  summary: string;
  editableFields: TemplateFieldSummary[];
  generationContract?: {
    requirementRoles: string[];
    rewardRoles: string[];
    dialogRoles: string[];
    promptSummary: string;
  };
}

export interface ExportTemplate {
  _id: string;
  name: string;
  description: string;
  rawTemplate: string;
  acceptedInputFormat: TemplateFormat;
  defaultOutputFormat: TemplateFormat;
  targetScope: 'quest-node';
  isBuiltIn: boolean;
  structure: unknown;
  templateAst?: unknown;
  fieldSchema: TemplateFieldSummary[];
  templateSchema?: TemplateSchema;
  schemaSummary?: {
    requirementFields: string[];
    rewardFields: string[];
    dialogFields: string[];
    structureSummary: string;
  };
  analysisStatus?: 'pending' | 'ready' | 'fallback' | 'failed';
  analysisError?: string;
  analyzedAt?: string;
  inferredAiGuidance: {
    objectiveFields: string[];
    rewardFields: string[];
    structureSummary: string;
  };
  output: {
    extension: string;
    mimeType: string;
    mode: TemplateFormat;
  };
}

export interface SaveExportTemplatePayload {
  name: string;
  description?: string;
  rawTemplate: string;
  inputFormat?: TemplateFormat;
  defaultOutputFormat?: TemplateFormat;
}

export async function fetchExportTemplates(): Promise<ExportTemplate[]> {
  const { data } = await api.get<ExportTemplate[]>('/export-templates');
  return data;
}

export async function createExportTemplate(payload: SaveExportTemplatePayload): Promise<ExportTemplate> {
  const { data } = await api.post<ExportTemplate>('/export-templates', payload);
  return data;
}

export async function updateExportTemplate(id: string, payload: SaveExportTemplatePayload): Promise<ExportTemplate> {
  const { data } = await api.put<ExportTemplate>(`/export-templates/${id}`, payload);
  return data;
}

export async function analyzeExportTemplate(id: string): Promise<ExportTemplate> {
  const { data } = await api.post<ExportTemplate>(`/export-templates/${id}/analyze`);
  return data;
}

export async function deleteExportTemplate(id: string): Promise<void> {
  await api.delete(`/export-templates/${id}`);
}
