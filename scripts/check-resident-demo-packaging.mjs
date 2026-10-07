import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const files = [
  'scripts/enrich-resident-demo-fixture.py',
  'scripts/enrich-resident-demo-fixture-premium.py',
  'apps/resident/lib/data/demo_resident_repository.dart',
  'apps/resident/lib/screens/services_screen.dart',
];

const root = mkdtempSync(join(tmpdir(), 'aaraagate-demo-packaging-'));
try {
  for (const path of files) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(path, target);
  }

  const result = spawnSync('python3', ['scripts/enrich-resident-demo-fixture-premium.py'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }

  const fixture = readFileSync(join(root, 'apps/resident/lib/data/demo_resident_repository.dart'), 'utf8');
  const screen = readFileSync(join(root, 'apps/resident/lib/screens/services_screen.dart'), 'utf8');
  const requiredFixture = [
    "'placementType': 'SPONSORED'",
    "'membershipTier': 'PREMIUM'",
    "'imageUrl':",
    "'offerTitle':",
    'CoolCare Services',
  ];
  const requiredScreen = [
    'Sponsored · paid placement',
    'Premium provider',
    'providerImage',
    'offerCount',
    'Society Trusted',
  ];

  for (const token of requiredFixture) {
    if (!fixture.includes(token)) throw new Error(`Demo fixture enrichment missing token: ${token}`);
  }
  for (const token of requiredScreen) {
    if (!screen.includes(token)) throw new Error(`Demo Services enrichment missing token: ${token}`);
  }

  console.log('Resident demo packaging enrichment dry-run passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
