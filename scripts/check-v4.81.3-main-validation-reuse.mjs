import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const root = json('package.json');
const api = json('services/api/package.json');
const admin = json('apps/admin/package.json');
assert.equal(root.version, '4.81.3');
assert.equal(api.version, root.version);
assert.equal(admin.version, root.version);
for (const pubspec of ['apps/resident/pubspec.yaml', 'apps/guard/pubspec.yaml']) {
  assert.ok(read(pubspec).includes('version: 4.81.3+48103'));
}

const ci = read('.github/workflows/ci.yml');
for (const token of [
  'push:',
  'branches: [main]',
  'git fetch origin staging --no-tags',
  'MAIN_TREE="$(git rev-parse \'HEAD^{tree}\')"',
  'STAGING_TREE="$(git rev-parse \'refs/remotes/origin/staging^{tree}\')"',
  'if [ "$MAIN_TREE" = "$STAGING_TREE" ]; then',
  'Exact staging tree already passed protected pre-main validation; duplicate full suites skipped.',
  'Main tree differs from current staging; falling back to full validation.',
]) assert.ok(ci.includes(token), 'Main validation-reuse control missing: ' + token);

const reuseBlock = ci.slice(
  ci.indexOf('if [ "${{ github.event_name }}" = "push" ] && [ "${{ github.ref }}" = "refs/heads/main" ]; then'),
  ci.indexOf('BASE_SHA="${{ github.event.pull_request.base.sha }}"'),
);
for (const output of [
  'run_api=false',
  'run_admin=false',
  'run_flutter=false',
  'run_resident=false',
  'run_guard=false',
  'run_dependency_audit=false',
]) assert.ok(reuseBlock.includes(output), 'Promotion reuse must skip duplicate suite: ' + output);
for (const output of [
  'run_api=true',
  'run_admin=true',
  'run_flutter=true',
  'run_resident=true',
  'run_guard=true',
  'run_dependency_audit=true',
]) assert.ok(reuseBlock.includes(output), 'Promotion mismatch must retain fail-safe full validation: ' + output);

assert.ok(ci.includes('pull_request:\n    branches: [develop, main]'), 'Pre-main PR validation must remain active.');
assert.ok(ci.includes('name: Repository structure'), 'Lightweight post-main repository gate must remain active.');

const postMain = read('.github/workflows/post-main-health.yml');
assert.ok(postMain.includes('Staging source differs from promoted main.'), 'Post-main health must fail closed on staging/main source drift.');
assert.ok(!postMain.includes('Develop source differs from promoted main.'), 'Develop drift must not block a valid promoted main release.');
assert.ok(postMain.includes('DEVELOP_ALIGNMENT="different-tree"'), 'Develop divergence must remain visible as evidence.');
assert.ok(postMain.includes("releaseSourceEquivalence:'staging-main-ok'"), 'Post-main evidence must record staging/main release equivalence.');

const evidence = read('docs/AARAAGATE-V4.81.3-MAIN-VALIDATION-REUSE.md');
for (const token of ['exact staging tree', 'fail-safe full validation', 'Develop may advance', 'does not weaken']) {
  assert.ok(evidence.includes(token), 'V4.81.3 evidence missing: ' + token);
}

console.log('V4.81.3 main validation reuse and post-main concurrency hardening: PASS');
