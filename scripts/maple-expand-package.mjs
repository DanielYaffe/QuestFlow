#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function usage() {
  console.error('Usage: node scripts/maple-expand-package.mjs --input maple-build.json --output ./maple-build');
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function assertSafeRelativePath(filePath) {
  const normalized = path.normalize(filePath);
  if (path.isAbsolute(normalized) || normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
    throw new Error(`Unsafe package path: ${filePath}`);
  }
  return normalized;
}

async function main() {
  const input = readArg('--input');
  const output = readArg('--output');
  if (!input || !output) {
    usage();
    process.exitCode = 1;
    return;
  }

  const raw = await import('node:fs/promises').then((fs) => fs.readFile(input, 'utf8'));
  const pkg = JSON.parse(raw);
  if (!pkg?.manifest || !Array.isArray(pkg.files)) {
    throw new Error('Input is not a QuestFlow Maple asset package.');
  }

  await mkdir(output, { recursive: true });
  for (const file of pkg.files) {
    const relativePath = assertSafeRelativePath(file.path);
    const target = path.join(output, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    const content = file.encoding === 'base64'
      ? Buffer.from(file.content, 'base64')
      : String(file.content);
    await writeFile(target, content);
  }

  console.log(`Expanded ${pkg.files.length} files to ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
