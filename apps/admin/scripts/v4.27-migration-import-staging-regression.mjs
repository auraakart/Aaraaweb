import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app/migration/import-stager.tsx',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../app/migration/page.tsx',import.meta.url),'utf8');
for(const fragment of [
  '/migration/preview',
  '/migration/batches',
  'Preview never mutates operational society data',
  'Create dry-run batch',
  'row-level validation',
  'Direct XLSX upload is not enabled yet',
  'Quoted commas, quotes and line breaks are supported',
]) if(!source.includes(fragment)) throw new Error(`Missing V4.27 import-staging contract: ${fragment}`);
if(!page.includes('<MigrationImportStager')) throw new Error('Migration center must expose import staging.');
console.log('V4.27 migration import staging regression passed');
