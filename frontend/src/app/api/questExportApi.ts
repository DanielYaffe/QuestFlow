import api from './axiosInstance';

export type Format =
  | 'questflow-json'
  | 'questflow-yaml'
  | 'template-json'
  | 'template-yaml'
  | 'template-xml';

export const FORMAT_OPTIONS: { id: Format; label: string }[] = [
  { id: 'questflow-json',   label: 'QuestFlow JSON' },
  { id: 'questflow-yaml',   label: 'QuestFlow YAML' },
  { id: 'template-yaml',    label: 'Quest Template YAML' },
  { id: 'template-json',    label: 'Quest Template JSON' },
  { id: 'template-xml',     label: 'Quest Template XML' },
];

export async function previewExport(
  questlineId: string,
  format: Format,
  options: { templateId?: string; nodeIds?: string[] } = {},
): Promise<{ filename: string; content: string; files?: { filename: string; content: string }[] }> {
  const { data } = await api.get(`/questlines/${questlineId}/export/preview`, {
    params: { format, templateId: options.templateId, nodeIds: options.nodeIds?.join(',') },
  });
  return data;
}

export async function downloadExport(
  questlineId: string,
  format: Format,
  options: { templateId?: string; nodeIds?: string[] } = {},
): Promise<void> {
  const response = await api.get(`/questlines/${questlineId}/export`, {
    params: { format, templateId: options.templateId, nodeIds: options.nodeIds?.join(',') },
    responseType: 'blob',
  });

  const disposition: string = response.headers['content-disposition'] ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `questline${getExtension(format)}`;
  const blob = new Blob([response.data]);

  // Prefer the File System Access API when available: it shows a "Save As"
  // dialog so the user can overwrite an existing file directly.
  if (typeof (window as any).showSaveFilePicker === 'function') {
    const handle = await (window as any).showSaveFilePicker({ suggestedName: filename });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  // Fallback for browsers without File System Access API: anchor-based download.
  // The browser controls naming — if a file with the same name already exists
  // it will append (1), (2), etc. automatically.
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function getExtension(format: Format): string {
  const map: Record<Format, string> = {
    'questflow-json':   '.json',
    'questflow-yaml':   '.yaml',
    'template-json':    '.json',
    'template-yaml':    '.yaml',
    'template-xml':     '.xml',
  };
  return map[format];
}

export interface PushToGithubPayload {
  format: Format;
  templateId?: string;
  nodeIds?: string[];
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
