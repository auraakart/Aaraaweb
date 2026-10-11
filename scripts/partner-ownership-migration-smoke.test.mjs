import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const script = fileURLToPath(new URL('../services/api/scripts/partner-ownership-migration-smoke.mjs', import.meta.url));
function fixture(mode, optedIn = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-psql-adapter-'));
  const log = path.join(dir, 'calls.jsonl');
  fs.writeFileSync(path.join(dir, 'psql'), `#!/usr/bin/env node
const fs = require('node:fs');
const sql = fs.readFileSync(0, 'utf8');
const p = process.env;
const operation = sql.startsWith('CREATE DATABASE') ? 'create' : sql.startsWith('DROP DATABASE') ? 'drop' : sql.includes('Conflicting fixture') ? 'failure' : 'verify';
fs.appendFileSync(p.V5_ADAPTER_LOG, JSON.stringify({operation,host:p.PGHOST,port:p.PGPORT,user:p.PGUSER,password:p.PGPASSWORD,database:p.PGDATABASE})+'\\n');
if (operation === 'failure') { process.stderr.write(p.V5_ADAPTER_MODE === 'unexpected' ? 'unexpected SQL failure' : 'ERROR: duplicate key value violates unique constraint "Partner_slug_key"'); process.exit(1); }
`, { mode: 0o700 });
  try {
    const env = { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, DATABASE_URL: 'postgresql://fixture%40user:fixture%3Apassword@db.fixture.invalid:5544/fixture_db', V5_ADAPTER_LOG: log, V5_ADAPTER_MODE: mode };
    delete env.AARAAGATE_PARTNER_MIGRATION_CI;
    if (optedIn) env.AARAAGATE_PARTNER_MIGRATION_CI = '1';
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(row => JSON.parse(row)) : [];
    return { result, calls };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('psql receives decoded host credentials and distinct database names, then cleans up', () => {
  const { result, calls } = fixture('reserved');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls.map(c => c.operation), ['create','failure','verify','drop']);
  for (const call of calls) {
    assert.equal(call.host, 'db.fixture.invalid');
    assert.equal(call.port, '5544');
    assert.equal(call.user, 'fixture@user');
    assert.equal(call.password, 'fixture:password');
    assert.equal(call.database.includes('://'), false);
  }
  assert.equal(calls[0].database, 'fixture_db');
  assert.equal(calls[3].database, 'fixture_db');
  assert.match(calls[1].database, /^v5_upgrade_[a-f0-9]{32}$/);
  assert.equal(calls[1].database, calls[2].database);
});
test('unexpected upgrade failure is fatal and still drops the temporary database', () => {
  const { result, calls } = fixture('unexpected');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected reserved-slug conflict did not occur/);
  assert.deepEqual(calls.map(c => c.operation), ['create','failure','drop']);
});
test('no disposable opt-in prevents all database commands', () => {
  const { result, calls } = fixture('reserved', false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Requires disposable DATABASE_URL/);
  assert.deepEqual(calls, []);
});
