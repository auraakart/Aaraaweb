import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../app/', import.meta.url);
const forbidden = [
  { label: 'native prompt', pattern: /(?:window\.)?prompt\s*\(/ },
  { label: 'native confirm', pattern: /(?:window\.)?confirm\s*\(/ },
  { label: 'native alert', pattern: /(?:window\.)?alert\s*\(/ },
];

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

const violations = [];
for (const file of await walk(root)) {
  const source = await readFile(file, 'utf8');
  for (const rule of forbidden) if (rule.pattern.test(source)) violations.push(`${file}: ${rule.label}`);
}
if (violations.length) {
  console.error('V4.34 Admin interaction consolidation failed:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('V4.34 Admin interaction consolidation passed.');
