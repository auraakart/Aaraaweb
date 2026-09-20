import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app/migration/import-stager.tsx',import.meta.url),'utf8');
const xlsx=fs.readFileSync(new URL('../app/migration/xlsx.ts',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../app/migration/page.tsx',import.meta.url),'utf8');
for(const fragment of [
  '/migration/preview',
  '/migration/batches',
  'Preview never mutates operational society data',
  'Create dry-run batch',
  'row-level validation',
  'CSV or XLSX file',
  'parseXlsx(file)',
  'only canonical row data is sent',
]) if(!source.includes(fragment)) throw new Error(`Missing V4.27 import-staging contract: ${fragment}`);
for(const fragment of [
  'MAX_XLSX_BYTES=10*1024*1024',
  'MAX_WORKSHEET_ROWS=10001',
  "DecompressionStream('deflate-raw')",
  "required(files,'xl/workbook.xml')",
  "required(files,'xl/_rels/workbook.xml.rels')",
  'XLSX contains duplicate column headers',
  '__source_row',
]) if(!xlsx.includes(fragment)) throw new Error(`Missing V4.27 XLSX safety contract: ${fragment}`);
if(!page.includes('<MigrationImportStager')) throw new Error('Migration center must expose import staging.');
console.log('V4.27 migration CSV/XLSX staging regression passed');
