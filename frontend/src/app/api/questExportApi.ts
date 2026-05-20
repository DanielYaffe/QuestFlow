import api from './axiosInstance';

export type Format =
  | 'questflow-json'
  | 'questflow-yaml'
  | 'unity-asset'
  | 'unreal-datatable'
  | 'godot-tres';

export const FORMAT_OPTIONS: { id: Format; label: string }[] = [
  { id: 'questflow-json',   label: 'QuestFlow JSON' },
  { id: 'questflow-yaml',   label: 'QuestFlow YAML' },
  { id: 'unity-asset',      label: 'Unity ScriptableObject (.asset)' },
  { id: 'unreal-datatable', label: 'Unreal DataTable (.json)' },
  { id: 'godot-tres',       label: 'Godot Resource (.tres)' },
];

export async function previewExport(
  questlineId: string,
  format: Format,
): Promise<{ filename: string; content: string }> {
  const { data } = await api.get(`/questlines/${questlineId}/export/preview`, {
    params: { format },
  });
  return data;
}

export async function downloadExport(
  questlineId: string,
  format: Format,
): Promise<void> {
  const response = await api.get(`/questlines/${questlineId}/export`, {
    params: { format },
    responseType: 'blob',
  });

  const disposition: string = response.headers['content-disposition'] ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `questline${getExtension(format)}`;

  const url = URL.createObjectURL(new Blob([response.data]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getExtension(format: Format): string {
  const map: Record<Format, string> = {
    'questflow-json':   '.json',
    'questflow-yaml':   '.yaml',
    'unity-asset':      '.asset',
    'unreal-datatable': '.json',
    'godot-tres':       '.tres',
  };
  return map[format];
}

export interface PushToGithubPayload {
  format: Format;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  filePath?: string;
  commitMessage?: string;
}

export async function pushToGithub(
  questlineId: string,
  payload: PushToGithubPayload,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    `/questlines/${questlineId}/push-to-github`,
    payload,
  );
  return data;
}
