import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));

const root = json('package.json');
const api = json('services/api/package.json');
const admin = json('apps/admin/package.json');

assert.equal(root.version, '4.81.5');
assert.equal(api.version, root.version);
assert.equal(admin.version, root.version);
for (const pubspec of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']) {
  assert.ok(read(pubspec).includes('version: 4.81.5+48105'));
}

for (const path of [
  'services/api/src/amenities/amenity-booking-creator.ts',
  'services/api/src/ai-operations/ai-society-insights.ts',
  'services/api/src/billing/payment-order.service.ts',
  'apps/resident/lib/data/resident_guest_invite_coordinator.dart',
  '.github/branch-superseded.json',
  'scripts/check-dependency-risk-budget.mjs',
  'scripts/lib/source-contract-bundles.mjs',
  'scripts/check-source-contract-extraction-resilience.mjs',
  'docs/REPOSITORY-GOVERNANCE.md',
]) assert.ok(fs.existsSync(path), 'V4.81.5 artifact missing: ' + path);

const amenities = read('services/api/src/amenities/amenities.service.ts');
assert.ok(amenities.includes('this.bookingCreator.createBooking('));
const ai = read('services/api/src/ai-operations/ai-assistant.service.ts');
assert.ok(ai.includes('this.insights = new AiSocietyInsights(prisma)'));
assert.ok(ai.includes('this.insights.societyFinance('));
const billing = read('services/api/src/billing/billing.service.ts');
assert.ok(billing.includes('this.paymentOrders.createPayment('));
const resident = read('apps/resident/lib/data/resident_data_controller.dart');
assert.ok(resident.includes('_guestInvites.run('));

const complexity = read('scripts/check-complexity-boundaries.mjs');
for (const token of [
  "['services/api/src/amenities/amenities.service.ts', 1050]",
  "['services/api/src/ai-operations/ai-assistant.service.ts', 580]",
  "['services/api/src/billing/billing.service.ts', 425]",
  "['apps/resident/lib/data/resident_data_controller.dart', 850]",
  "['apps/guard/lib/screens/guard_operations_screen.dart', 360]",
]) assert.ok(complexity.includes(token), 'Complexity budget missing: ' + token);

const flutterCoverage = read('scripts/check-flutter-risk-coverage.mjs');
assert.ok(flutterCoverage.includes("'lib/data/resident_data_controller.dart': 42"));
assert.ok(flutterCoverage.includes("'lib/guard_controller.dart': 38"));

const apiCoverage = read('services/api/vitest.risk-coverage.config.ts');
for (const token of ['statements: 30','branches: 28','statements: 35','branches: 32']) {
  assert.ok(apiCoverage.includes(token), 'API risk floor missing: ' + token);
}

const extractionGuard = read('scripts/check-source-contract-extraction-resilience.mjs');
assert.ok(extractionGuard.includes('source-contract-bundles.mjs'));
assert.ok(read('scripts/check-stable-domain-invariants.mjs').includes('check-source-contract-extraction-resilience.mjs'));

const cleanup = read('scripts/cleanup-merged-branches.mjs');
assert.ok(cleanup.includes("const preservePattern = /^(backup|recovery|archive|snapshot)"));
assert.ok(cleanup.includes("supersededPath = '.github/branch-superseded.json'"));
assert.ok(cleanup.includes('exactExplicitSupersession'));

const superseded = json('.github/branch-superseded.json');
assert.equal(superseded.branches.length, 7);
assert.ok(superseded.branches.every((entry) => /^[0-9a-f]{40}$/.test(entry.sha)));

const rootPackage = json('package.json');
for (const [name, expected] of Object.entries({
  'proxy-addr': '2.0.8',
  'source-map-js': '1.2.2',
  'multer': '2.4.0',
  'minimatch@10.2.6>brace-expansion': '5.0.12',
  'gaxios@6.7.1>uuid': '11.1.1',
})) {
  assert.equal(rootPackage.pnpm?.overrides?.[name], expected, 'Dependency security override mismatch: ' + name);
}
const lock = read('pnpm-lock.yaml');
for (const token of ['proxy-addr@2.0.8:', 'source-map-js@1.2.2:', 'brace-expansion@5.0.12:', 'multer@2.4.0:', 'uuid@11.1.1:']) {
  assert.ok(lock.includes(token), 'Patched dependency lock evidence missing: ' + token);
}
const dependencyBudget = read('scripts/check-dependency-risk-budget.mjs');
assert.ok(dependencyBudget.includes('if (moderate > 0)'), 'Dependency risk budget must fail on moderate findings.');

const ci = read('.github/workflows/ci.yml');
assert.ok(ci.includes('node scripts/check-dependency-risk-budget.mjs'));

const v4814 = read('scripts/check-v4.81.4-privacy-dependency-hardening.mjs');
assert.ok(v4814.includes('compareVersion(current, [4, 81, 4]) >= 0'));
assert.ok(!v4814.includes("assert.equal(root.version, '4.81.4'"));

const evidence = read('docs/AARAAGATE-V4.81.5-MAINTAINABILITY-HYGIENE.md');
for (const token of ['Hotspot decomposition','Branch hygiene closure','moderate: no increase','one governed staging release commit','remains unchanged until explicit owner approval']) {
  assert.ok(evidence.includes(token), 'V4.81.5 evidence missing: ' + token);
}

console.log('V4.81.5 maintainability, hygiene and governance closure: PASS');
