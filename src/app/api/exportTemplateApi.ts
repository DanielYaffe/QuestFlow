import api from './axiosInstance';

export interface ExportTemplate {
  _id: string;
  name: string;
  engine: string;
  isBuiltIn: boolean;
  structure: object;
}

export async function getTemplates(): Promise<ExportTemplate[]> {
  const { data } = await api.get('/export-templates');
  return data;
}

export async function saveTemplate(
  name: string,
  engine: string,
  structure: object,
): Promise<ExportTemplate> {
  const { data } = await api.post('/export-templates', { name, engine, structure });
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/export-templates/${id}`);
}
