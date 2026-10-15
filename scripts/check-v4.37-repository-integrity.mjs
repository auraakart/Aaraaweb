import fs from 'node:fs';

const fail = (message) => {
  console.error(`V4.37 repository integrity: ${message}`);
  process.exitCode = 1;
};

const required = [
  'apps/admin',
  'apps/resident',
  'apps/guard',
  'services/api',
  'packages/types',
  'packages/api-client',
  'packages/config',
  'docs/CURRENT-CAPABILITY-INDEX.md',
  'docs/AARAAGATE-V4.37-PROGRAM.md',
];

for (const path of required) {
  if (!fs.existsSync(path)) fail(`missing required path: ${path}`);
}

for (const retired of ['apps/security', 'apps/web']) {
  if (fs.existsSync(retired)) fail(`retired application boundary reintroduced: ${retired}`);
}

const adminPackage = JSON.parse(fs.readFileSync('apps/admin/package.json', 'utf8'));
const groupedSuites = ['test:core', 'test:finance-governance', 'test:operations', 'test:ui-contracts'];
for (const suite of groupedSuites) {
  if (!adminPackage.scripts?.[suite]) fail(`missing grouped Admin regression suite: ${suite}`);
}
const expectedComposition = groupedSuites.map((suite) => `pnpm ${suite}`).join(' && ');
if (adminPackage.scripts?.test !== expectedComposition) {
  fail('Admin test command must compose the four named regression suites');
}

const adminConsole = 'apps/admin/app/admin-console.tsx';
if (fs.existsSync(adminConsole)) {
  const bytes = fs.statSync(adminConsole).size;
  const ceiling = 60000;
  if (bytes > ceiling) fail(`admin-console.tsx is ${bytes} bytes; ceiling is ${ceiling}. Extract responsibilities instead of growing the file.`);
}

const readme = fs.readFileSync('README.md', 'utf8');
for (const branch of ['main', 'staging', 'develop']) {
  if (!readme.includes(`${branch}`)) fail(`README branch model is missing ${branch}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('V4.37 repository integrity checks passed.');
