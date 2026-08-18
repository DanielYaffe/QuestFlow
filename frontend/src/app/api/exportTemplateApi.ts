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
    fieldHints?: Array<{
      path: string;
      meaning: string;
      generationUse: string;
    }>;
    relationshipHints?: Array<{
      kind: 'reference' | 'branch' | 'sequence' | 'state' | 'other';
      from: string;
      to: string;
      meaning: string;
    }>;
    generationHints?: string[];
    userExamples?: string[];
  };
}

export type TemplateKbMappingStatus = 'proposed' | 'validated' | 'disabled';

export interface TemplateKbMappingEntry {
  templatePath: string;
  kbType: string;
  kbFieldPath: string;
  valueType: 'string' | 'number' | 'boolean' | 'array' | 'object';
  purpose: string;
  status: TemplateKbMappingStatus;
  confidence: number;
  explanation: string;
}

export interface TemplateKbMapping {
  _id: string;
  ownerId: string;
  gameId: string;
  templateId: string;
  entries: TemplateKbMappingEntry[];
  analyzedAt?: string;
  updatedAt?: string;
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
  /** Template paths the author marked must-fill, incl. "arr[].item" form. */
  requiredFieldPaths?: string[];
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
  templateSchema?: Partial<TemplateSchema>;
  skipAnalysis?: boolean;
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

export async function analyzeExportTemplate(id: string, templateSchema?: Partial<TemplateSchema>): Promise<ExportTemplate> {
  const { data } = await api.post<ExportTemplate>(`/export-templates/${id}/analyze`, templateSchema ? { templateSchema } : {});
  return data;
}

export async function fetchTemplateKbMappings(templateId: string, gameId: string): Promise<TemplateKbMapping> {
  const { data } = await api.get<TemplateKbMapping>(`/export-templates/${templateId}/kb-mappings`, {
    params: { gameId },
  });
  return data;
}

export async function analyzeTemplateKbMappings(templateId: string, gameId: string): Promise<TemplateKbMapping> {
  const { data } = await api.post<TemplateKbMapping>(`/export-templates/${templateId}/kb-mappings/analyze`, { gameId });
  return data;
}

export async function saveTemplateKbMappings(
  templateId: string,
  gameId: string,
  entries: TemplateKbMappingEntry[],
): Promise<TemplateKbMapping> {
  const { data } = await api.put<TemplateKbMapping>(`/export-templates/${templateId}/kb-mappings`, { gameId, entries });
  return data;
}

/** Replace the set of fields that must be filled on every quest node. */
export async function saveRequiredFieldPaths(id: string, paths: string[]): Promise<ExportTemplate> {
  const { data } = await api.put(`/export-templates/${id}/required-fields`, { paths });
  return data;
}

export async function deleteExportTemplate(id: string): Promise<void> {
  await api.delete(`/export-templates/${id}`);
}
