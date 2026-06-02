import JSZip from 'jszip';
import QuestlineModel from '../../models/questlineModel';
import CustomFormatModel from '../../models/customFormatModel';
import { buildExportPayload } from './buildExportPayload';
import { formats } from './formats';
import { renderCustomFormat, CustomFormatSpec } from './renderCustomFormat';
import { Format, ExportResult, FormatModule } from './types';

export type { Format, ExportResult, ExportFile } from './types';
export { formats } from './formats';

/**
 * Resolve a format id to a FormatModule. Built-in ids hit the static registry;
 * `custom:<id>` ids load the owned CustomFormat and wrap it in a module.
 */
export async function resolveFormat(format: string, userId?: string): Promise<FormatModule> {
  if (format.startsWith('custom:')) {
    const id = format.slice('custom:'.length);
    const cf = await CustomFormatModel.findById(id);
    if (!cf) throw new Error('Custom format not found');
    if (userId && cf.ownerId !== userId) throw new Error('Forbidden');

    const spec: CustomFormatSpec = {
      name:            cf.name,
      extension:       cf.extension,
      fileNamePattern: cf.fileNamePattern,
      example:         cf.example,
      bindings:        cf.bindings ?? {},
    };

    return {
      id:        format as Format,
      label:     cf.name,
      extension: 'zip',
      mimeType:  'application/zip',
      render:    (payload) => renderCustomFormat(payload, spec),
    };
  }

  const formatModule = formats[format as Format];
  if (!formatModule) throw new Error(`Unknown format: ${format}`);
  return formatModule;
}

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
  format: string,
  userId?: string,
): Promise<ExportResult> {
  const formatModule = await resolveFormat(format, userId);

  const questline = await QuestlineModel.findById(questlineId);
  if (!questline) {
    throw new Error('Questline not found');
  }

  const payload  = buildExportPayload(questline);
  const files    = formatModule.render(payload);
  const titleSlug = slugifyTitle(questline.title);
  const formatSlug = format.startsWith('custom:')
    ? `custom-${slugifyTitle(formatModule.label)}`
    : format;
  const filename  = `${titleSlug}_${formatSlug}.zip`;

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return { filename, files, zipBuffer, mimeType: 'application/zip' };
}
