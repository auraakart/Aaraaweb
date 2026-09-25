import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const must = (label, source, tokens) => {
  const missing = tokens.filter((token) => !source.includes(token));
  if (missing.length) {
    console.error(`${label} missing: ${missing.join(', ')}`);
    process.exit(1);
  }
};

const root = JSON.parse(read('package.json'));
const api = JSON.parse(read('services/api/package.json'));
const admin = JSON.parse(read('apps/admin/package.json'));
if (root.version !== '4.55.1' || api.version !== '4.55.1' || admin.version !== '4.55.1') {
  console.error('Root/API/Admin release identity must be V4.55.1.');
  process.exit(1);
}
for (const file of ['apps/resident/pubspec.yaml', 'apps/guard/pubspec.yaml']) {
  must(file, read(file), ['version: 4.55.1+45501', "flutter: '>=3.47.0'"]);
}

const coverageConfig = read('services/api/vitest.risk-coverage.config.ts');
must('API risk coverage', coverageConfig, [
  "provider: 'v8'",
  'payment-availability.service.ts',
  'privacy-self.controller.ts',
  'access.service.ts',
  'session.service.ts',
  'household.service.ts',
  'ai-operations.service.ts',
  'statements: 90',
]);

const ci = read('.github/workflows/ci.yml');
must('CI coverage enforcement', ci, [
  'Install exact API coverage provider',
  'Risk-weighted API coverage gate',
  'Risk-weighted Resident coverage gate',
  'Risk-weighted Guard coverage gate',
  'Upload API risk coverage evidence',
  'Upload Flutter risk coverage evidence',
]);

const flutterCoverage = read('scripts/check-flutter-risk-coverage.mjs');
must('Flutter risk coverage policy', flutterCoverage, [
  'resident_data_controller.dart',
  'gate_screen.dart',
  'billing_screen.dart',
  'privacy_data_screen.dart',
  'home_screen.dart',
  'guard_controller.dart',
  'guard_boundary_models.dart',
]);

const branchCleanup = read('scripts/cleanup-merged-branches.mjs');
must('Branch hygiene convergence', branchCleanup, [
  'source tree is identical to',
  'treeEquivalent',
]);

must('V4.55.1 document', read('docs/AARAAGATE-V4.55.1-ENGINEERING-EVIDENCE-CLOSURE.md'), [
  'Risk-weighted coverage enforcement',
  'Branch-debt closure',
  'Productionization remains outside this sub-version.',
]);

console.log('V4.55.1 engineering evidence closure controls are intact.');
