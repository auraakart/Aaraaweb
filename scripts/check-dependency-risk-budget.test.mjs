import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { dependencyCompatibilityErrors } from './lib/dependency-compatibility.mjs';

const gate = fileURLToPath(new URL('./check-dependency-risk-budget.mjs', import.meta.url));
const cleanCounts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const repository = new URL('../', import.meta.url);
const manifest = (file) => JSON.parse(fs.readFileSync(new URL(file, repository), 'utf8'));
const manifests = [manifest('package.json'), manifest('apps/admin/package.json'), manifest('services/api/package.json')];
const sharpGate = new URL('./check-v4.83-automation-convenience-adoption.mjs', import.meta.url).href;

for (const [name, edit] of [
  ['missing patched snapshot', "content.replace(/^ {2}sharp@0\\.35\\.5\\(@types\\/node@[^)]+\\):$/m, '')"],
  ['mismatched snapshot reference', "content.replaceAll('sharp: 0.35.5(@types/node@', 'sharp: 0.35.5(@types/other@')"],
  ['unpatched sharp', "content.replaceAll('sharp@0.35.5', 'sharp@0.35.4').replaceAll('sharp: 0.35.5', 'sharp: 0.35.4')"],
]) {
  test(`sharp security gate rejects ${name} after Node-type migration`, () => {
    const code = `import fs from 'node:fs';
      const read = fs.readFileSync;
      fs.readFileSync = function(file, ...args) {
        const content = read.call(this, file, ...args);
        return file === 'pnpm-lock.yaml' ? ${edit} : content;
      };
      await import(${JSON.stringify(sharpGate)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', cwd: fileURLToPath(repository),
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Patched sharp snapshot|snapshot reference|sharp 0\.35\.4/);
  });
}

test('current dependency cohort passes and later reviewed-major lint versions are allowed', () => {
  assert.deepEqual(dependencyCompatibilityErrors(...manifests), []);
  const [root, admin, api] = structuredClone(manifests);
  for (const pkg of [admin, api]) {
    pkg.devDependencies.eslint = '^10.13.1';
    pkg.devDependencies['typescript-eslint'] = '^8.72.0';
  }
  assert.deepEqual(dependencyCompatibilityErrors(root, admin, api), []);
});

for (const [name, mutate, expected] of [
  ['future Node APIs on a Node 22 runtime', ([, admin]) => { admin.devDependencies['@types/node'] = '^26.6.5'; }, 'Node types'],
  ['older Admin Node types', ([, admin]) => { admin.devDependencies['@types/node'] = '^20.17.0'; }, 'Node types'],
  ['broad runtime range', ([root]) => { root.engines.node = '>=22'; }, 'supported Node'],
  ['React DOM upgrade without React', ([, admin]) => { admin.dependencies['react-dom'] = `${Number.parseInt(admin.dependencies.react)+1}.0.0`; }, 'React and React DOM'],
  ['React types upgrade without runtime', ([, admin]) => { admin.devDependencies['@types/react-dom'] = `^${Number.parseInt(admin.dependencies.react)+1}.0.0`; }, '@types/react-dom'],
  ['Next 16 without its React cohort', ([, admin]) => { admin.dependencies.next='16.4.0'; admin.dependencies.react=admin.dependencies['react-dom']='18.3.1'; admin.devDependencies['@types/react']=admin.devDependencies['@types/react-dom']='^18.3.0'; }, 'Next 16'],
  ['divergent workspace linters', ([,, api]) => { api.devDependencies.eslint = '^10.11.0'; }, 'declarations must match'],
  ['ESLint downgrade', ([, admin, api]) => { for (const pkg of [admin, api]) pkg.devDependencies.eslint = '^10.10.0'; }, 'minimum version'],
  ['unreviewed lint major', ([, admin, api]) => { for (const pkg of [admin, api]) pkg.devDependencies.eslint = '^11.0.0'; }, 'reviewed major'],
  ['parser downgrade', ([, admin, api]) => { for (const pkg of [admin, api]) pkg.devDependencies['typescript-eslint'] = '^8.70.9'; }, 'minimum version'],
  ['unbounded lint declaration', ([, admin, api]) => { for (const pkg of [admin, api]) pkg.devDependencies.eslint = '>=10.11.0'; }, 'reviewed major'],
]) {
  test(`rejects ${name}`, () => {
    const changed = structuredClone(manifests);
    mutate(changed);
    assert.ok(dependencyCompatibilityErrors(...changed).some(error => error.includes(expected)));
  });
}

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
