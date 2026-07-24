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

export interface TestGitConnectionPayload {
  token?: string;
  repoOwner: string;
  repoName: string;
  branch?: string;
}

export async function testGitConnection(
  payload: TestGitConnectionPayload,
): Promise<{ ok: true; message: string }> {
  const { data } = await api.post<{ ok: true; message: string }>(
    '/users/me/git-settings/test',
    payload,
  );
  return data;
}
