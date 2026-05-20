import QuestlineModel from '../../models/questlineModel';
import { buildExportPayload } from './buildExportPayload';
import { formats } from './formats';
import { Format, ExportResult } from './types';

export type { Format, ExportResult } from './types';
export { formats } from './formats';

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'questline';
}

export async function exportQuestline(
  questlineId: string,
  format: Format,
): Promise<ExportResult> {
  const formatModule = formats[format];
  if (!formatModule) {
    throw new Error(`Unknown format: ${format}`);
  }

  const questline = await QuestlineModel.findById(questlineId);
  if (!questline) {
    throw new Error('Questline not found');
  }

  const payload = buildExportPayload(questline);
  const content = formatModule.render(payload);
  const filename = `${slugifyTitle(questline.title)}${formatModule.extension}`;

  return { filename, content, mimeType: formatModule.mimeType };
}
