import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const gate = fileURLToPath(new URL('./check-dependency-risk-budget.mjs', import.meta.url));
const cleanCounts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const cases = [
  ['clean completed audit', { metadata: { vulnerabilities: cleanCounts } }, 0, 0],
  ['registry error', { error: { code: 'REGISTRY_UNAVAILABLE' } }, 1, 1],
  ['missing metadata', {}, 0, 1],
  ['incomplete counts', { metadata: { vulnerabilities: { high: 0 } } }, 0, 1],
  ['invalid counts', { metadata: { vulnerabilities: { ...cleanCounts, moderate: '0' } } }, 0, 1],
  ['failed audit with zero counts', { metadata: { vulnerabilities: cleanCounts } }, 1, 1],
  ['moderate advisory', { metadata: { vulnerabilities: { ...cleanCounts, moderate: 1 } } }, 1, 1],
  ['high advisory', { metadata: { vulnerabilities: { ...cleanCounts, high: 1 } } }, 1, 1],
  ['critical advisory', { metadata: { vulnerabilities: { ...cleanCounts, critical: 1 } } }, 1, 1],
];

for (const [name, report, auditExit, expectedExit] of cases) {
  test(name, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aaraagate-audit-gate-'));
    try {
      // Exercise the actual CLI boundary with a deterministic audit executable.
      fs.writeFileSync(path.join(directory, 'pnpm'), `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(report))});\nprocess.exit(${auditExit});\n`, { mode: 0o755 });
      const result = spawnSync(process.execPath, [gate], {
        encoding: 'utf8', env: { ...process.env, PATH: directory + path.delimiter + process.env.PATH },
      });
      assert.equal(result.status, expectedExit, result.stdout + result.stderr);
      if (expectedExit !== 0) assert.ok(!result.stdout.includes('Dependency risk budget: PASS'));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
