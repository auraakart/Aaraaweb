import { readFileSync, writeFileSync } from 'node:fs';

const path = 'docs/architecture/V5-TENANT-ACCESS-INVENTORY.md';
const inventory = JSON.parse(readFileSync('docs/architecture/v5-tenant-access-inventory.json', 'utf8'));
const s = inventory.summary;
const rows = [
  ['Tables, including SQL-only tables', s.tables],
  ['API runtime/script source files', s.sourceFilesScanned],
  ['Migration SQL files', s.migrationFilesScanned],
  ['Database access sites', s.accessSites],
  ['Raw SQL / ORM sites', `${s.rawSqlSites} / ${s.ormSites}`],
  ['Controller route handlers', s.routeHandlers],
  ['Unsafe runtime SQL calls discovered', s.runtimeUnsafeSqlSites],
  ['Unsafe disposable performance-seed calls', s.unsafeSqlSites - s.runtimeUnsafeSqlSites],
  ['Recognized SQL utility sites', s.utilitySqlSites],
  ['Indirect SQL expressions requiring manual resolution', s.unresolvedSqlSites],
  ['Runtime calls to `withTenantContext`', s.runtimeTenantContextCalls],
  ['RLS enable/force/policy statements in migrations', s.migrationPolicySignals],
];
if (rows.some(([, value]) => value === undefined)) throw new Error('Tenant inventory summary is incomplete');
const table = '| Coverage | Count |\n| --- | ---: |\n' + rows.map(([label, value]) => `| ${label} | ${value} |`).join('\n');
const source = readFileSync(path, 'utf8');
const pattern = /\| Coverage \| Count \|\n\| --- \| ---: \|\n(?:\|[^\n]*\|\n?)+/;
if (!pattern.test(source)) throw new Error('Tenant inventory summary table is missing');
const updated = source.replace(pattern, table + '\n');
if (process.argv.includes('--write')) writeFileSync(path, updated);
else if (source !== updated) {
  console.error('Tenant summary is stale. Run node scripts/sync-tenant-access-summary.mjs --write');
  process.exitCode = 1;
} else console.log('Tenant access summary matches the generated inventory.');
