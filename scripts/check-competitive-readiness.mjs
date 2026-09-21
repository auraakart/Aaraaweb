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
  ['V4.29','PRIVACY_SAFE_EVIDENCE_CAPTURE'],
  ['V4.30','COMPETITIVE_CLOSURE'],
  ['V4.31','MIGRATION_ONBOARDING_EXCELLENCE'],
  ['V4.32','INTEGRATION_READINESS'],
  ['V4.33','READINESS_RECONCILIATION'],
];
const repoStatuses = new Set(['PLANNED','IN_PROGRESS','COMPLETE','BLOCKED']);
const fieldStatuses = new Set(['NOT_APPLICABLE','PENDING_EXTERNAL','IN_PROGRESS','COMPLETE','BLOCKED']);

if (plan.schemaVersion !== 'aaraagate.competitive-readiness.v2') fail('unexpected schemaVersion');
if (plan.program !== 'V4.23-V4.33') fail('unexpected program');
if (plan.status !== 'REPOSITORY_READY_EXTERNAL_PENDING') fail('program must preserve the external-evidence boundary');
if (!/^[0-9a-f]{40}$/.test(plan.baseline ?? '')) fail('baseline must be an exact commit SHA');
if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.asOf ?? '')) fail('asOf must be YYYY-MM-DD');
if (!Array.isArray(plan.externalBoundary) || plan.externalBoundary.length < 4) fail('externalBoundary must remain explicit');
if (!Array.isArray(plan.cycles) || plan.cycles.length !== expected.length) fail(`exactly ${expected.length} cycles are required`);

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
  if (cycle.repositoryStatus !== 'COMPLETE') fail(`${id} repository closure is not reconciled`);
  if (!Array.isArray(cycle.requiredEvidence) || cycle.requiredEvidence.length < 3) fail(`${id} requires at least three evidence contracts`);
  if (cycle.requiredEvidence.some(x => typeof x !== 'string' || !x.trim())) fail(`${id} has invalid evidence contract`);
  if (i > 0 && (!Array.isArray(cycle.dependsOn) || !cycle.dependsOn.includes(expected[i-1][0]))) fail(`${id} must depend on ${expected[i-1][0]}`);
}

if (!plan.cycles[0].dependsOn?.includes('V4.22')) fail('V4.23 must preserve V4.22 as its dependency');
if (plan.cycles.some(c => c.fieldStatus === 'COMPLETE')) fail('field completion must not be claimed by repository-only reconciliation');
if (!plan.cycles.some(c => c.fieldStatus === 'PENDING_EXTERNAL')) fail('external evidence boundary must remain visible');

console.log(`Competitive readiness OK: ${seen.size} cycles reconciled through V4.33; repository complete, external evidence pending.`);
