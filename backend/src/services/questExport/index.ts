import JSZip from 'jszip';
import QuestlineModel from '../../models/questlineModel';
import { buildExportPayload } from './buildExportPayload';
import { formats } from './formats';
import { Format, ExportResult } from './types';

export type { Format, ExportResult, ExportFile } from './types';
export { formats } from './formats';

export async function zipFiles(
  files: import('./types').ExportFile[],
  filename: string,
): Promise<{ zipBuffer: Buffer; filename: string }> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { zipBuffer, filename };
}

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

  const payload  = buildExportPayload(questline);
  const files    = formatModule.render(payload);
  const titleSlug = slugifyTitle(questline.title);
  const filename  = `${titleSlug}_${format}.zip`;

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return { filename, files, zipBuffer, mimeType: 'application/zip' };
}
