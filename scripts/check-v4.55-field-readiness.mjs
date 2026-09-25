import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const requireTokens = (label, source, tokens) => {
  const missing = tokens.filter((token) => !source.includes(token));
  if (missing.length) {
    console.error(`${label} missing: ${missing.join(', ')}`);
    process.exit(1);
  }
};
const forbidTokens = (label, source, tokens) => {
  const present = tokens.filter((token) => source.includes(token));
  if (present.length) {
    console.error(`${label} contains deprecated tokens: ${present.join(', ')}`);
    process.exit(1);
  }
};

const root = JSON.parse(read('package.json'));
const api = JSON.parse(read('services/api/package.json'));
const admin = JSON.parse(read('apps/admin/package.json'));
if (root.version !== '4.55.0' || api.version !== '4.55.0' || admin.version !== '4.55.0') {
  console.error('Root/API/Admin release identity is not V4.55.0.');
  process.exit(1);
}

for (const pubspec of ['apps/resident/pubspec.yaml', 'apps/guard/pubspec.yaml']) {
  const source = read(pubspec);
  requireTokens(pubspec, source, ['version: 4.55.0+45500', "flutter: '>=3.47.0'"]);
}

const ci = read('.github/workflows/ci.yml');
requireTokens('V4.55 CI', ci, [
  "flutter-version: '3.47.0'",
  'Risk-weighted API behavioural regression gate',
  'Risk-weighted Resident behavioural regression gate',
  'Risk-weighted Guard behavioural regression gate',
  'node scripts/check-secret-patterns.mjs',
]);

for (const workflow of [
  '.github/workflows/resident-demo-apk.yml',
  '.github/workflows/resident-release-aab.yml',
]) {
  const source = read(workflow);
  requireTokens(workflow, source, ["flutter-version: '3.47.0'"]);
  forbidTokens(workflow, source, [
    "flutter-version: '3.32.8'",
    "flutter-version: '3.24.0'",
    "sed -i 's/cardTheme: CardTheme(/cardTheme: CardThemeData(/'",
  ]);
}

const release = read('.github/workflows/release-readiness.yml');
requireTokens('Hosted main gate', release, [
  'environment: staging',
  'Enforce hosted staging acceptance for exact main candidate',
  'AARAAGATE_STAGING_API_BASE_URL',
  'hosted-staging-smoke.sh',
]);

for (const path of [
  '.github/dependabot.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/supply-chain-security.yml',
  'scripts/check-secret-patterns.mjs',
  'scripts/generate-v4.55-sbom.mjs',
  'docs/AARAAGATE-V4.55-FIELD-READINESS-ENGINEERING-CONSOLIDATION.md',
  'docs/v4.55-pilot-readiness-evidence.json',
]) {
  if (!fs.existsSync(path)) {
    console.error(`V4.55 required asset missing: ${path}`);
    process.exit(1);
  }
}

requireTokens('CodeQL', read('.github/workflows/codeql.yml'), [
  'github/codeql-action/init@v4',
  'github/codeql-action/analyze@v4',
]);
requireTokens('Supply chain', read('.github/workflows/supply-chain-security.yml'), [
  'Generate CycloneDX SBOM',
  'pnpm audit --audit-level high',
  'check-secret-patterns.mjs',
]);
requireTokens('Dependabot', read('.github/dependabot.yml'), [
  'package-ecosystem: github-actions',
  'package-ecosystem: npm',
  'package-ecosystem: pub',
]);

const pilot = JSON.parse(read('docs/v4.55-pilot-readiness-evidence.json'));
if (pilot.fieldPilotStatus !== 'NOT_EXECUTED' || pilot.approver !== null || pilot.societyPilotIdentifier !== null) {
  console.error('V4.55 must not claim external pilot acceptance from repository evidence.');
  process.exit(1);
}

console.log('V4.55 field-readiness and engineering-consolidation controls are intact.');
