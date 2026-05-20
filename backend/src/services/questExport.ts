import QuestlineModel from '../models/questlineModel';

export type Format =
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

const EXTENSIONS: Record<Format, string> = {
  'questflow-json':   'json',
  'questflow-yaml':   'yaml',
  'unity-asset':      'asset',
  'unreal-datatable': 'json',
  'godot-tres':       'tres',
};

const MIME_TYPES: Record<Format, string> = {
  'questflow-json':   'application/json',
  'questflow-yaml':   'application/x-yaml',
  'unity-asset':      'application/x-yaml',
  'unreal-datatable': 'application/json',
  'godot-tres':       'text/plain',
};

// TODO: replace this stub with the real serialization modules once the export service is implemented.
// Contract: (questlineId, format) → { filename, content, mimeType }
export async function exportQuestline(questlineId: string, format: Format): Promise<ExportResult> {
  const questline = await QuestlineModel.findById(questlineId).lean();
  if (!questline) throw new Error('Questline not found');

  const slug = (questline.title ?? 'questline').replace(/\s+/g, '-').toLowerCase();
  const filename = `${slug}.${EXTENSIONS[format]}`;
  const content = JSON.stringify(questline, null, 2);

  return { filename, content, mimeType: MIME_TYPES[format] };
}
