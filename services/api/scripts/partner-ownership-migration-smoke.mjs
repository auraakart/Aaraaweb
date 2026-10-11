// Full historical upgrade on a disposable PostgreSQL database; no production use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { migrationName, seedSql, verifyCutoverSql, verifyReplaySql, failureFixtureSql, verifyAtomicRollbackSql } from './fixtures/partner-ownership-fixture.mjs';
if (!process.env.DATABASE_URL || process.env.AARAAGATE_PARTNER_MIGRATION_CI !== '1') {
  throw new Error('Requires disposable DATABASE_URL and AARAAGATE_PARTNER_MIGRATION_CI=1.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
const adminUrl = new URL(process.env.DATABASE_URL);
const database = `v5_upgrade_${randomUUID().replaceAll('-', '')}`;
const fixtureUrl = new URL(adminUrl);
fixtureUrl.pathname = `/${database}`;
function execute(url, input, expectReservedSlugFailure = false) {
  const result = spawnSync('psql', ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--quiet'], {
    input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, PGDATABASE: url.toString() },
  });
  if (result.error) throw result.error;
  if (expectReservedSlugFailure) {
    if (result.status === 0 || !/duplicate key.*Partner_slug_key/.test(result.stderr)) throw new Error('Expected reserved-slug conflict did not occur.');
    return;
  }
  if (result.status !== 0) throw new Error(`PostgreSQL upgrade smoke failed: ${result.stderr}`);
}
try {
  execute(adminUrl, `CREATE DATABASE "${database}";`);
  const historical = fs.readdirSync(root).filter(name => name < migrationName && fs.existsSync(path.join(root, name, 'migration.sql'))).sort();
  const migration = fs.readFileSync(path.join(root, migrationName, 'migration.sql'), 'utf8');
  // One connection retains temporary reconciliation tables across migration replay.
  execute(fixtureUrl, [...historical.map(name => fs.readFileSync(path.join(root, name, 'migration.sql'), 'utf8')), failureFixtureSql, migration].join('\n'), true);
  const sql = [verifyAtomicRollbackSql, seedSql, migration, verifyCutoverSql, migration, verifyReplaySql].join('\n');
  execute(fixtureUrl, sql);
  console.log(`V5 partner ownership: ${historical.length} historical migrations, 64 tier/override/status fixtures, legacy insert, constraints, immutability, replay, atomic failure rollback and deletion passed.`);
} finally {
  execute(adminUrl, `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`);
}
