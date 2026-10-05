import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const root = json('package.json');
const api = json('services/api/package.json');
const admin = json('apps/admin/package.json');

assert.equal(root.version, '4.81.4', 'Root release identity must be V4.81.4.');
assert.equal(api.version, root.version, 'API release identity must match root.');
assert.equal(admin.version, root.version, 'Admin release identity must match root.');
for (const pubspec of ['apps/resident/pubspec.yaml', 'apps/guard/pubspec.yaml']) {
  assert.ok(read(pubspec).includes('version: 4.81.4+48104'), pubspec + ' must use V4.81.4 build identity.');
}

const privacy = read('apps/resident/lib/screens/privacy_data_screen.dart');
assert.ok(
  privacy.includes("api.get('/api/v1/privacy/self/context').catchError((_) => null)"),
  'Optional privacy context metadata must not block request-history loading.',
);

const privacyTests = read('apps/resident/test/privacy_data_screen_test.dart');
for (const token of [
  'privacy request list remains available when optional context metadata fails',
  'privacy retry reuses the same request key after an uncertain submission',
  'correction request requires details and submits the reviewed text',
]) {
  assert.ok(privacyTests.includes(token), 'Focused privacy recovery coverage missing: ' + token);
}

const flutterCoverage = read('scripts/check-flutter-risk-coverage.mjs');
assert.ok(
  flutterCoverage.includes("'lib/screens/privacy_data_screen.dart': 35"),
  'Resident privacy risk-coverage floor must be at least 35%.',
);

const dependabot = read('.github/dependabot.yml');
for (const token of [
  'nestjs-major:',
  '"@nestjs/common"',
  '"@nestjs/core"',
  '"@nestjs/platform-express"',
  'prisma-major:',
  '"prisma"',
  '"@prisma/client"',
  'update-types:',
  '- "major"',
]) {
  assert.ok(dependabot.includes(token), 'Coordinated dependency-major policy missing: ' + token);
}

const prior = read('scripts/check-v4.81.3-main-validation-reuse.mjs');
assert.ok(
  prior.includes('compareVersion(current, [4, 81, 3]) >= 0'),
  'V4.81.3 invariant must remain forward-compatible.',
);
assert.ok(
  !prior.includes("assert.equal(root.version, '4.81.3')"),
  'Historical V4.81.3 invariant must not freeze later release identities.',
);

const evidence = read('docs/AARAAGATE-V4.81.4-PRIVACY-DEPENDENCY-HARDENING.md');
for (const token of [
  'privacy context fetch non-blocking',
  'same request key',
  '20% to 35%',
  'Dependabot now groups',
  'does **not** upgrade to NestJS 12 or Prisma 7',
  'Main remains unchanged until explicit owner approval',
]) {
  assert.ok(evidence.includes(token), 'V4.81.4 evidence missing: ' + token);
}

console.log('V4.81.4 privacy recovery and dependency-cohort hardening: PASS');
