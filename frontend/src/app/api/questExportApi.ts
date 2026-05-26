import api from './axiosInstance';

export type Format =
  | 'questflow-json'
  | 'questflow-yaml'
  | 'unity-asset'
  | 'unreal-datatable'
  | 'godot-tres';

export interface ExportFile {
  path: string;
  content: string;
}

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
): Promise<{ filename: string; files: ExportFile[] }> {
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
  const filename = match?.[1] ?? `questline_${format}.zip`;

  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
