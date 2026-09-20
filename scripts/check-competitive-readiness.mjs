import { readFile } from 'node:fs/promises';

const fail = (message) => { throw new Error(`Competitive readiness: ${message}`); };
const plan = JSON.parse(await readFile('docs/competitive-readiness.json','utf8'));

const expected = [
  ['V4.23','EXPERIENCE_CONSOLIDATION'],
  ['V4.24','AI_ASSISTANT'],
  ['V4.25','PAYMENTS_ACCOUNTING'],
  ['V4.26','INTEGRATIONS'],
  ['V4.27','ONBOARDING_MIGRATION'],
  ['V4.28','PILOT_EVIDENCE'],
];
const repoStatuses = new Set(['PLANNED','IN_PROGRESS','COMPLETE','BLOCKED']);
const fieldStatuses = new Set(['NOT_APPLICABLE','PENDING_EXTERNAL','IN_PROGRESS','COMPLETE','BLOCKED']);

if (plan.schemaVersion !== 'aaraagate.competitive-readiness.v1') fail('unexpected schemaVersion');
if (plan.program !== 'V4.23-V4.28') fail('unexpected program');
if (!Array.isArray(plan.cycles) || plan.cycles.length !== expected.length) fail('exactly six cycles are required');

const seen = new Set();
for (let i=0;i<expected.length;i++) {
  const cycle = plan.cycles[i];
  const [id, area] = expected[i];
  if (cycle.id !== id) fail(`cycle order mismatch at ${i}: expected ${id}`);
  if (cycle.area !== area) fail(`${id} must map to ${area}`);
  if (seen.has(cycle.id)) fail(`duplicate cycle ${cycle.id}`);
  seen.add(cycle.id);
  if (!repoStatuses.has(cycle.repositoryStatus)) fail(`${id} invalid repositoryStatus`);
  if (!fieldStatuses.has(cycle.fieldStatus)) fail(`${id} invalid fieldStatus`);
  if (!Array.isArray(cycle.requiredEvidence) || cycle.requiredEvidence.length < 3) fail(`${id} requires at least three evidence contracts`);
  if (cycle.requiredEvidence.some(x => typeof x !== 'string' || !x.trim())) fail(`${id} has invalid evidence contract`);
  if (i > 0 && (!Array.isArray(cycle.dependsOn) || !cycle.dependsOn.includes(expected[i-1][0]))) {
    fail(`${id} must depend on ${expected[i-1][0]}`);
  }
  if (cycle.repositoryStatus === 'COMPLETE' && cycle.fieldStatus === 'COMPLETE' && cycle.requiredEvidence.length === 0) {
    fail(`${id} cannot be complete without evidence`);
  }
}

if (!plan.cycles[0].dependsOn?.includes('V4.22')) fail('V4.23 must preserve V4.22 completion as its dependency');
if (plan.cycles.slice(1).some(c => c.fieldStatus === 'COMPLETE' && c.repositoryStatus !== 'COMPLETE')) {
  fail('field completion cannot precede repository completion');
}

console.log(`Competitive readiness OK: ${seen.size} priority cycles sequenced from V4.23 through V4.28.`);
