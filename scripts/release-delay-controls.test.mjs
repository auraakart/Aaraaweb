import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { validatePromotion, checkRemotePromotion } from './check-staging-promotion-evidence.mjs';

const root = process.cwd();
const sha = 'a'.repeat(40);
const fixture = () => ({
  repository: 'example/community', stagingSha: sha, stagingTree: 'tree', candidateTree: 'tree',
  pr: { merged_at: '2026-10-08', merge_commit_sha: sha, base: { ref: 'staging' },
    head: { sha: 'b'.repeat(40), ref: 'release/v4.87.0-staging-candidate', repo: { full_name: 'example/community' } } },
  runs: [
    { id: 1, name: 'Staging smoke', path: '.github/workflows/staging-smoke.yml' },
    { id: 2, name: 'Backup restore smoke', path: '.github/workflows/backup-restore-smoke.yml' },
  ].map(run => ({ ...run, head_sha: 'b'.repeat(40), event: 'pull_request', status: 'completed', conclusion: 'success' })),
  jobsByRun: {
    1: [{ id: 10, name: 'Staging API smoke', status: 'completed', conclusion: 'success' }],
    2: [{ id: 20, name: 'PostgreSQL backup restore drill', status: 'completed', conclusion: 'success' }],
  },
});

test('accepts only the final protected staging tree with both exact-candidate smoke jobs', () => {
  assert.deepEqual(validatePromotion(fixture()), [1, 2]);
});
for (const [name, mutate] of [
  ['stale staging head', f => { f.pr.merge_commit_sha = 'c'.repeat(40); }],
  ['changed source tree', f => { f.candidateTree = 'different'; }],
  ['unmerged candidate', f => { f.pr.merged_at = null; }],
  ['fork evidence', f => { f.pr.head.repo.full_name = 'outside/community'; }],
  ['pending smoke', f => { f.runs[0].status = 'in_progress'; }],
  ['failed restore', f => { f.runs[1].conclusion = 'failure'; }],
  ['wrong tested commit', f => { f.runs[0].head_sha = 'c'.repeat(40); }],
  ['unrelated workflow', f => { f.runs[0].path = '.github/workflows/unrelated.yml'; }],
  ['missing database drill', f => { f.jobsByRun[2] = []; }],
  ['failed latest retry', f => { f.runs.push({ ...f.runs[0], id: 3, conclusion: 'failure' }); }],
]) test(`rejects ${name} before main preparation`, () => {
  const f = fixture(); mutate(f); assert.throws(() => validatePromotion(f));
});

test('detects staging moving during remote evidence verification', () => {
  const f = fixture(); let reads = 0;
  const api = endpoint => {
    if (endpoint.endsWith('/git/ref/heads/staging')) return { object: { sha: ++reads === 1 ? sha : 'c'.repeat(40) } };
    if (endpoint.includes('/git/commits/')) return { tree: { sha: 'tree' } };
    if (endpoint.includes('/pulls?')) return [f.pr];
    if (endpoint.includes('/actions/runs?')) return { workflow_runs: f.runs };
    if (endpoint.includes('/actions/runs/1/jobs')) return { jobs: f.jobsByRun[1] };
    if (endpoint.includes('/actions/runs/2/jobs')) return { jobs: f.jobsByRun[2] };
    throw new Error(endpoint);
  };
  assert.throws(() => checkRemotePromotion(f.repository, sha, api), /Staging moved while/);
});

function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), 'aaraagate-release-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Release fixture');
  writeFileSync(join(dir, 'product.txt'), 'old'); writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '4.87.1' })); git('add', '.'); git('commit', '-m', 'Baseline');
  git('branch', 'main'); git('branch', 'staging'); git('branch', 'develop');
  return { dir, git, run: (script, args = [], env = {}) => spawnSync('bash', [resolve(root, 'scripts', script), ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ...env },
  }) };
}

test('candidate captures main ancestry and exact develop tree without modifying the checkout', t => {
  const { dir, git, run } = repository(t);
  git('switch', 'main'); git('commit', '--allow-empty', '-m', 'Previous main release');
  const main = git('rev-parse', 'HEAD');
  git('switch', 'develop'); writeFileSync(join(dir, 'product.txt'), 'new');
  git('add', '.'); git('commit', '-m', 'Next product');
  const before = git('status', '--porcelain');
  const remote = join(dir, 'remote.git'); git('init', '--bare', remote); git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'main', 'staging', 'develop');
  const result = run('prepare-staging-candidate.sh', ['4.87.1']);
  assert.equal(result.status, 0, result.stderr);
  const candidate = git('rev-parse', 'release/v4.87.1-staging-candidate');
  assert.equal(git('rev-parse', `${candidate}^{tree}`), git('rev-parse', 'develop^{tree}'));
  assert.doesNotThrow(() => git('merge-base', '--is-ancestor', main, candidate));
  assert.doesNotThrow(() => git('merge-base', '--is-ancestor', 'origin/staging', candidate));
  assert.equal(git('status', '--porcelain'), before + (before ? '\n' : '') + '?? remote.git/');
  assert.notEqual(run('prepare-staging-candidate.sh', ['4.87.2']).status, 0);
  assert.equal(run('prepare-staging-candidate.sh', ['4.87.1']).status, 0);
  assert.equal(git('rev-parse', 'release/v4.87.1-staging-candidate'), candidate);
});

test('structural CI preflight never invokes pnpm or Flutter and rejects invalid modes', t => {
  const { dir, git, run } = repository(t);
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(dir, 'scripts')); writeFileSync(join(dir, 'scripts', 'example.sh'), '#!/bin/bash\ntrue\n');
  git('add', '.'); git('commit', '-m', 'Change');
  const bin = join(dir, 'bin'); mkdirSync(bin);
  for (const command of ['pnpm', 'flutter']) {
    const path = join(bin, command); writeFileSync(path, '#!/bin/sh\nexit 99\n'); chmodSync(path, 0o755);
  }
  const env = { PREFLIGHT_MODE: 'structural', PATH: `${bin}:${process.env.PATH}`, RUN_API: 'true', RUN_ADMIN: 'true', RUN_RESIDENT: 'true', RUN_GUARD: 'true' };
  assert.equal(run('mastermind-preflight.sh', [base, 'HEAD'], env).status, 0);
  assert.equal(run('mastermind-preflight.sh', [base, 'HEAD'], { ...env, PREFLIGHT_MODE: 'unknown' }).status, 2);
  writeFileSync(join(dir, 'scripts', 'example.sh'), '#!/bin/bash\nif\n');
  assert.notEqual(run('mastermind-preflight.sh', [base, 'HEAD'], env).status, 0);
});

test('publishing suspends old main before staging changes and fails closed if review lookup fails', t => {
  const { dir, git, run } = repository(t);
  const remote = join(dir, 'remote.git'); git('init', '--bare', remote); git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'main', 'staging', 'develop');
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const log = join(dir, 'operator.log');
  const gh = join(bin, 'gh');
  writeFileSync(gh, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.OPERATOR_LOG, args.join(' ') + '\\n');
if (args[0] === 'pr' && args[1] === 'list' && args.includes('main')) {
  if (process.env.FAIL_LOOKUP === 'true') process.exit(1);
  console.log('1135');
}
if (args[0] === 'pr' && args[1] === 'close') fs.writeFileSync(process.env.CLOSED_MARKER, 'closed');
`, { mode: 0o755 });
  const gitWrapper = join(bin, 'git');
  writeFileSync(gitWrapper, '#!/bin/bash\nif [ "$1" = push ]; then test -f "$CLOSED_MARKER" || exit 98; fi\nexec /usr/bin/git "$@"\n', { mode: 0o755 });
  const env = { PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'example/community', OPERATOR_LOG: log, CLOSED_MARKER: join(dir, 'closed') };
  const published = run('publish-staging-candidate.sh', ['4.87.1'], env);
  assert.equal(published.status, 0, published.stderr);
  assert.doesNotThrow(() => execFileSync('/usr/bin/git', ['rev-parse', 'refs/heads/release/v4.87.1-staging-candidate'], { cwd: remote }));
  assert.match(readFileSync(log, 'utf8'), /pr close 1135[\s\S]*pr create/);
  const failed = run('publish-staging-candidate.sh', ['4.87.1', 'release/v4.87.1-retry-staging-candidate'], { ...env, FAIL_LOOKUP: 'true' });
  assert.notEqual(failed.status, 0);
  assert.throws(() => execFileSync('/usr/bin/git', ['rev-parse', '--verify', 'refs/heads/release/v4.87.1-retry-staging-candidate'], { cwd: remote, stdio: 'pipe' }));
});

test('changed Flutter gate selects only added/modified tests for the requested app', t => {
  const { dir, git, run } = repository(t);
  const base = git('rev-parse', 'HEAD');
  for (const app of ['resident', 'guard']) {
    mkdirSync(join(dir, 'apps', app, 'test'), { recursive: true });
    writeFileSync(join(dir, 'apps', app, 'test', 'new_test.dart'), '// fixture');
  }
  git('add', '.'); git('commit', '-m', 'Widget tests');
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const flutter = join(bin, 'flutter');
  writeFileSync(flutter, '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\n'); chmodSync(flutter, 0o755);
  const result = run('run-changed-flutter-tests.sh', ['resident', base, 'HEAD'], { PATH: `${bin}:${process.env.PATH}` });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), [join(dir, 'apps/resident'), 'test', 'test/new_test.dart']);
  assert.match(run('run-changed-flutter-tests.sh', ['resident', 'HEAD', 'HEAD']).stdout, /No changed/);
  assert.equal(run('run-changed-flutter-tests.sh', ['other', base, 'HEAD']).status, 2);
});

test('workflow keeps full gates while preflight avoids repeated toolchain installation', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const preflight = ci.split('\n  mastermind-preflight:\n')[1].split('\n  api-validation-full:\n')[0];
  assert.match(preflight, /PREFLIGHT_MODE: structural/);
  assert.doesNotMatch(preflight, /Setup Flutter|Setup pnpm|pnpm install/);
  for (const token of ['Test resident app', 'Test guard app', 'Risk-weighted Resident coverage gate', 'Test API before coverage instrumentation', 'Test shared Admin component interactions and accessibility', 'All required merge gates passed.']) {
    assert.ok(ci.includes(token), token);
  }
});

for (const [name, env, expected, withDeps] of [
  ['ready runner skips system install', {}, 0, false],
  ['missing dependencies use fallback and verify launch again', { PROBE_FAIL_FIRST: 'true' }, 0, true],
  ['permanent launch failure cannot pass setup', { PROBE_FAIL_ALWAYS: 'true' }, 1, true],
]) test(`browser setup: ${name}`, t => {
  const { dir, run } = repository(t);
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const log = join(dir, 'browser.log');
  writeFileSync(join(bin, 'pnpm'), `#!/bin/bash
printf '%s\\n' "$*" >> "$BROWSER_LOG"
if [[ "$*" == *'exec node'* ]]; then
  if [ "\${PROBE_FAIL_ALWAYS:-false}" = true ]; then exit 1; fi
  if [ "\${PROBE_FAIL_FIRST:-false}" = true ] && [ ! -f "$PROBE_MARKER" ]; then touch "$PROBE_MARKER"; exit 1; fi
fi
`, { mode: 0o755 });
  const result = run('install-admin-browser-runtime.sh', [], {
    PATH: `${bin}:${process.env.PATH}`, BROWSER_LOG: log, PROBE_MARKER: join(dir, 'probe'), ...env,
  });
  assert.equal(result.status, expected, result.stderr);
  const commands = readFileSync(log, 'utf8');
  assert.equal(commands.includes('install --with-deps chromium'), withDeps);
  assert.equal((commands.match(/exec node/g) ?? []).length, withDeps ? 2 : 1);
});
