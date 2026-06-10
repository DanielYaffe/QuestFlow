import api from './axiosInstance';

export interface GitSettings {
  hasToken: boolean;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  defaultFilePath: string;
}

export interface UpdateGitSettingsPayload {
  token?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export async function getGitSettings(): Promise<GitSettings> {
  const { data } = await api.get<GitSettings>('/users/me/git-settings');
  return data;
}

export async function updateGitSettings(payload: UpdateGitSettingsPayload): Promise<GitSettings> {
  const { data } = await api.put<GitSettings>('/users/me/git-settings', payload);
  return data;
}
