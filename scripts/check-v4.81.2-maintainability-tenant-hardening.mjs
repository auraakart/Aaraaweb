import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const major = (value) => Number(String(value).match(/\d+/)?.[0]);

const root = json('package.json');
const api = json('services/api/package.json');
const admin = json('apps/admin/package.json');

assert.equal(root.version, '4.81.2', 'Root release identity must be V4.81.2.');
assert.equal(api.version, root.version, 'API release identity must match root.');
assert.equal(admin.version, root.version, 'Admin release identity must match root.');
for (const pubspec of ['apps/resident/pubspec.yaml', 'apps/guard/pubspec.yaml']) {
  assert.ok(read(pubspec).includes('version: 4.81.2+48102'), pubspec + ' must use V4.81.2 build identity.');
}

const nestMajors = [
  api.dependencies['@nestjs/common'],
  api.dependencies['@nestjs/core'],
  api.dependencies['@nestjs/platform-express'],
].map(major);
assert.equal(new Set(nestMajors).size, 1, 'NestJS common/core/platform packages must stay on one coordinated major.');
assert.equal(
  major(api.dependencies['@prisma/client']),
  major(api.devDependencies.prisma),
  'Prisma client and CLI must stay on one coordinated major.',
);
assert.equal(api.devDependencies.eslint, '^10.11.0');
assert.equal(admin.devDependencies.eslint, '^10.11.0');
assert.equal(api.devDependencies['typescript-eslint'], '^8.71.0');
assert.equal(admin.devDependencies['typescript-eslint'], '^8.71.0');

const aiService = read('services/api/src/ai-operations/ai-assistant.service.ts');
const occurrenceCount = (source, token) => source.split(token).length - 1;
assert.equal(
  occurrenceCount(aiService, "export { residentIntentRoutingText } from './ai-assistant.policy';"),
  1,
  'AI routing compatibility export must appear exactly once.',
);
assert.equal(
  occurrenceCount(aiService, 'type AiAssistantToolDefinition,'),
  1,
  'AI tool-definition type import must appear exactly once.',
);

for (const path of [
  'services/api/src/amenities/amenity-analytics.query.ts',
  'services/api/src/ai-operations/ai-assistant.policy.ts',
  'services/api/src/billing/payment-webhook.processor.ts',
  'apps/resident/lib/data/resident_data_loading.dart',
  'apps/guard/lib/screens/guard_operations_components.dart',
]) {
  assert.ok(fs.existsSync(path), 'V4.81.2 extraction boundary missing: ' + path);
}

const complexity = read('scripts/check-complexity-boundaries.mjs');
for (const token of [
  "amenities/amenities.service.ts', 1230",
  "ai-operations/ai-assistant.service.ts', 740",
  "billing/billing.service.ts', 550",
  "resident_data_controller.dart', 900",
  "guard_operations_screen.dart', 380",
]) assert.ok(complexity.includes(token), 'Tightened complexity budget missing: ' + token);

const tenantIntegration = read('services/api/src/prisma/prisma.tenant-context.integration.spec.ts');
for (const token of ['current_setting', 'insideA', 'insideB', 'afterA', 'afterB', 'not-a-society-uuid']) {
  assert.ok(tenantIntegration.includes(token), 'Tenant integration evidence missing: ' + token);
}

const apiCoverage = read('services/api/vitest.risk-coverage.config.ts');
for (const token of ['statements: 45', 'statements: 25', 'statements: 35', 'statements: 30']) {
  assert.ok(apiCoverage.includes(token), 'Raised API risk threshold missing: ' + token);
}
const flutterCoverage = read('scripts/check-flutter-risk-coverage.mjs');
for (const token of [
  "'lib/data/resident_data_controller.dart': 40",
  "'lib/screens/gate_screen.dart': 80",
  "'lib/screens/billing_screen.dart': 50",
  "'lib/screens/home_screen.dart': 50",
  "'lib/guard_controller.dart': 35",
  "'lib/data/models/guard_boundary_models.dart': 45",
]) assert.ok(flutterCoverage.includes(token), 'Raised Flutter risk threshold missing: ' + token);

const hygiene = read('scripts/cleanup-merged-branches.mjs');
assert.ok(hygiene.includes('retained after fresh canonical reconciliation'), 'Retention must be revalidated against canonical content.');
const hygieneWorkflow = read('.github/workflows/branch-hygiene.yml');
assert.ok(hygieneWorkflow.includes('echo "dry_run=false" >> "$GITHUB_OUTPUT"'), 'Scheduled/protected cleanup path must support real safe deletion.');

const nextConfig = read('apps/admin/next.config.mjs');
assert.ok(nextConfig.includes('eslint:{ignoreDuringBuilds:true}'), 'Admin build must avoid duplicate build-time lint.');
const ci = read('.github/workflows/ci.yml');
assert.ok(ci.includes('pnpm --filter @aaraagate/admin lint'), 'Explicit Admin lint gate must remain in CI.');

assert.ok(fs.existsSync('SECURITY.md'), 'SECURITY.md is required.');
assert.ok(fs.existsSync('.github/CODEOWNERS'), 'CODEOWNERS is required.');
const evidence = read('docs/AARAAGATE-V4.81.2-MAINTAINABILITY-TENANT-HARDENING.md');
for (const token of ['RLS remains disabled', 'NestJS 12 must be upgraded as a coordinated', 'Prisma 7 client and CLI must be upgraded together', 'repository visibility']) {
  assert.ok(evidence.includes(token), 'V4.81.2 evidence missing: ' + token);
}

console.log('V4.81.2 maintainability, dependency and tenant-confidence hardening: PASS');
