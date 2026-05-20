import api from './axiosInstance';

export type ExportFormat =
  | 'questflow-json'
  | 'questflow-yaml'
  | 'unity-asset'
  | 'unreal-datatable'
  | 'godot-tres';

export interface ExportResult {
  filename: string;
  content: string;
  mimeType: string;
}

export interface PushToGithubPayload {
  format: ExportFormat;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  filePath?: string;
  commitMessage?: string;
}

export async function downloadExport(questlineId: string, format: ExportFormat): Promise<ExportResult> {
  const { data } = await api.get<ExportResult>(`/questlines/${questlineId}/export`, {
    params: { format },
  });
  return data;
}

export async function pushToGithub(questlineId: string, payload: PushToGithubPayload): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/questlines/${questlineId}/push-to-github`, payload);
  return data;
}
