import api from './axiosInstance';

export interface ProjectGitSettings {
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  ownerId: string;
  git?: ProjectGitSettings;
  createdAt: string;
  updatedAt: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const { data } = await api.get('/projects');
  return data;
}

export async function createProject(name: string, description = ''): Promise<Project> {
  const { data } = await api.post('/projects', { name, description });
  return data;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'description' | 'git'>>,
): Promise<Project> {
  const { data } = await api.put(`/projects/${id}`, patch);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export async function duplicateProject(id: string, name?: string): Promise<Project> {
  const { data } = await api.post(`/projects/${id}/duplicate`, name ? { name } : {});
  return data;
}
