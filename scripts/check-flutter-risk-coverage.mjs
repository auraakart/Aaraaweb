import fs from 'node:fs';
import path from 'node:path';

const [lcovPath, profile] = process.argv.slice(2);
if (!lcovPath || !profile) {
  console.error('usage: node scripts/check-flutter-risk-coverage.mjs <lcov.info> <resident|guard>');
  process.exit(2);
}

const policies = {
  resident: {
    'lib/data/resident_data_controller.dart': 30,
    'lib/screens/gate_screen.dart': 20,
    'lib/screens/billing_screen.dart': 30,
    'lib/screens/privacy_data_screen.dart': 30,
    'lib/screens/home_screen.dart': 10,
  },
  guard: {
    'lib/guard_controller.dart': 30,
    'lib/data/models/guard_boundary_models.dart': 20,
  },
};

const policy = policies[profile];
if (!policy) {
  console.error(`Unknown Flutter coverage profile: ${profile}`);
  process.exit(2);
}

const source = fs.readFileSync(lcovPath, 'utf8');
const records = source.split('end_of_record').map((block) => block.trim()).filter(Boolean);
const summaries = new Map();

for (const record of records) {
  const lines = record.split('\n');
  const sf = lines.find((line) => line.startsWith('SF:'))?.slice(3);
  if (!sf) continue;
  const normalized = sf.replaceAll('\\', '/');
  const lf = Number(lines.find((line) => line.startsWith('LF:'))?.slice(3) ?? 0);
  const lh = Number(lines.find((line) => line.startsWith('LH:'))?.slice(3) ?? 0);
  for (const target of Object.keys(policy)) {
    if (normalized.endsWith(target)) summaries.set(target, { lf, lh, source: normalized });
  }
}

let failed = false;
const result = {};
for (const [target, minimum] of Object.entries(policy)) {
  const summary = summaries.get(target);
  if (!summary || summary.lf <= 0) {
    console.error(`Coverage target missing from LCOV: ${target}`);
    failed = true;
    continue;
  }
  const percent = (summary.lh / summary.lf) * 100;
  result[target] = { minimum, linesFound: summary.lf, linesHit: summary.lh, percent: Number(percent.toFixed(2)) };
  if (percent + Number.EPSILON < minimum) {
    console.error(`${target}: ${percent.toFixed(2)}% line coverage is below ${minimum}%`);
    failed = true;
  }
}

const evidenceDir = path.join(path.dirname(lcovPath), 'risk-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(
  path.join(evidenceDir, `${profile}-risk-coverage.json`),
  JSON.stringify({ profile, generatedAt: new Date().toISOString(), result }, null, 2) + '\n',
);

console.log(JSON.stringify({ profile, result }, null, 2));
if (failed) process.exit(1);
