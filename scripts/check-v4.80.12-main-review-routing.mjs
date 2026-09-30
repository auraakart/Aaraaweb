import { readFileSync } from 'node:fs';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const expectIncludes = (text, needle, label) => {
  if (!text.includes(needle)) fail(`${label} is missing: ${needle}`);
};

const helper = readFileSync('scripts/open-main-release-pr.sh', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const routingDoc = readFileSync('docs/AARAAGATE-V4.80.10.5-MAIN-REVIEW-ROUTING.md', 'utf8');
const closureDoc = readFileSync('docs/AARAAGATE-V4.80.12-MAIN-REVIEW-ROUTING-HARDENING.md', 'utf8');

expectIncludes(helper, 'MAIN_RELEASE_REVIEWER:-ganeshcatch-ux', 'release helper');
expectIncludes(helper, '--base main', 'release helper');
expectIncludes(helper, '--head staging', 'release helper');
expectIncludes(helper, '--reviewer "$REVIEWER"', 'release helper');
expectIncludes(helper, '--add-reviewer "$REVIEWER"', 'release helper');
expectIncludes(helper, '--json reviewRequests', 'release helper');
if (/\bgh\s+pr\s+merge\b/.test(helper)) fail('release helper must never merge main');

expectIncludes(ci, 'test -f scripts/open-main-release-pr.sh', 'CI repository structure');
expectIncludes(ci, 'bash -n scripts/open-main-release-pr.sh', 'CI repository structure');
expectIncludes(ci, 'node scripts/check-v4.80.12-main-review-routing.mjs', 'CI repository structure');

expectIncludes(routingDoc, 'scripts/open-main-release-pr.sh <version>', 'V4.80.10.5 routing doc');
expectIncludes(routingDoc, 'ganeshcatch-ux', 'V4.80.10.5 routing doc');
expectIncludes(closureDoc, 'independent reviewer', 'V4.80.12 closure doc');
expectIncludes(closureDoc, 'does not approve or merge main', 'V4.80.12 closure doc');

console.log('V4.80.12 main review routing contract passed.');
