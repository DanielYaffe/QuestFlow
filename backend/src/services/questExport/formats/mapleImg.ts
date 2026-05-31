import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { CanonicalExport, FormatModule } from '../types';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(__dirname, '../../../../..');
const projectPath = path.join(repoRoot, 'tools', 'maple-exporter', 'MapleQuestExporter.csproj');
const exePath = path.join(repoRoot, 'tools', 'maple-exporter', 'bin', 'Debug', 'net48', 'MapleQuestExporter.exe');

async function ensureExporterBuilt(): Promise<void> {
  try {
    await fs.access(exePath);
  } catch {
    await execFileAsync('dotnet', ['build', projectPath], { cwd: repoRoot, windowsHide: true });
  }
}

async function runExporter(payload: CanonicalExport): Promise<{ img: Buffer; xml: string }> {
  await ensureExporterBuilt();

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'questflow-maple-'));
  const inputPath = path.join(tempDir, 'quest.json');
  const outputPath = path.join(tempDir, 'quest.img');
  const xmlPath = path.join(tempDir, 'quest.xml');

  try {
    await fs.writeFile(inputPath, JSON.stringify(payload, null, 2), 'utf8');
    await execFileAsync(
      exePath,
      ['export', '--input', inputPath, '--output', outputPath, '--xml-preview', xmlPath],
      { cwd: repoRoot, windowsHide: true },
    );

    const [img, xml] = await Promise.all([
      fs.readFile(outputPath),
      fs.readFile(xmlPath, 'utf8'),
    ]);
    return { img, xml };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const mapleImg: FormatModule = {
  id:        'maple-img',
  label:     'MapleStory IMG',
  extension: '.img',
  mimeType:  'application/octet-stream',
  render: async (payload: CanonicalExport): Promise<Buffer> => {
    const { img } = await runExporter(payload);
    return img;
  },
  preview: async (payload: CanonicalExport): Promise<string> => {
    const { xml } = await runExporter(payload);
    return xml;
  },
};

export default mapleImg;
