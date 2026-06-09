import api from './axiosInstance';

export interface ProjectRecord {
  _id: string;
  name: string;
  description: string;
  defaultThemeId: string;
  defaultExportFormat: string;
  isInbox: boolean;
  questlineCount?: number;
  characterCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  defaultThemeId?: string;
  defaultExportFormat?: string;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const { data } = await api.get<ProjectRecord[]>('/projects');
  return data;
}

export async function getProject(id: string): Promise<ProjectRecord> {
  const { data } = await api.get<ProjectRecord>(`/projects/${id}`);
  return data;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectRecord> {
  const { data } = await api.post<ProjectRecord>('/projects', input);
  return data;
}

export async function updateProject(
  id: string,
  patch: Partial<CreateProjectInput>,
): Promise<ProjectRecord> {
  const { data } = await api.put<ProjectRecord>(`/projects/${id}`, patch);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}
