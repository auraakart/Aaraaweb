import { readFile } from 'node:fs/promises';

const fail = (message) => { throw new Error(`V4.11 pilot readiness: ${message}`); };
const plan = JSON.parse(await readFile('docs/v4.11-pilot-readiness.json', 'utf8'));
const requiredDomains = ['GUARD','FINANCE','AI_ACTION_CENTRE','HELPDESK','RESIDENT','PILOT_OPERATIONS'];
const requiredSignOff = ['SECURITY_SUPERVISOR','ACCOUNTANT_TREASURER','SOCIETY_ADMIN','RELEASE_OWNER'];
const statuses = new Set(['PENDING_EXTERNAL','PASS','FAIL','BLOCKED']);
const signStatuses = new Set(['NOT_SIGNED','SIGNED','REJECTED']);

if (plan.schemaVersion !== 'aaraagate.v4.11.pilot-readiness.v1') fail('unexpected schemaVersion');
if (plan.phase !== 'V4.11') fail('phase must be V4.11');
if (!Array.isArray(plan.kpis) || plan.kpis.length < 8) fail('at least eight KPI definitions are required');
if (!plan.training || typeof plan.training !== 'object') fail('training plan is required');

const ids = new Set();
const domains = new Set();
for (const kpi of plan.kpis) {
  if (!kpi.id || ids.has(kpi.id)) fail(`duplicate or missing KPI id ${kpi.id ?? ''}`);
  ids.add(kpi.id);
  domains.add(kpi.domain);
  for (const key of ['owner','title','source','measurement','threshold','evidenceType']) {
    if (typeof kpi[key] !== 'string' || kpi[key].trim().length === 0) fail(`${kpi.id} missing ${key}`);
  }
  if (!statuses.has(kpi.status)) fail(`${kpi.id} has invalid status ${kpi.status}`);
  if (!Array.isArray(kpi.evidence)) fail(`${kpi.id}.evidence must be an array`);
  if (kpi.evidence.some((item) => typeof item !== 'string' || item.trim().length === 0)) fail(`${kpi.id}.evidence must contain only non-empty references`);
  if (kpi.status === 'PASS' && kpi.evidence.length === 0) fail(`${kpi.id} cannot PASS without evidence`);
  if (kpi.evidenceType === 'FIELD' && kpi.status === 'PASS' && !plan.pilotSociety) fail(`${kpi.id} cannot PASS field evidence without a pilotSociety`);
}
for (const domain of requiredDomains) if (!domains.has(domain)) fail(`missing KPI domain ${domain}`);

for (const role of ['GUARD','ACCOUNTANT','ADMIN_SUPPORT']) {
  if (!Array.isArray(plan.training[role]) || plan.training[role].length < 3) fail(`training.${role} requires at least three checklist items`);
}
for (const role of requiredSignOff) {
  const item = plan.signOff?.[role];
  if (!item || !signStatuses.has(item.status) || !Array.isArray(item.evidence)) fail(`invalid signOff.${role}`);
  if (item.evidence.some((value) => typeof value !== 'string' || value.trim().length === 0)) fail(`signOff.${role}.evidence must contain only non-empty references`);
  if (item.status === 'SIGNED' && item.evidence.length === 0) fail(`${role} cannot be SIGNED without evidence`);
}

if (!plan.pilotSociety) {
  if (plan.status !== 'REPOSITORY_READY_EXTERNAL_PENDING') fail('status must remain REPOSITORY_READY_EXTERNAL_PENDING before a pilot society is named');
  if (plan.kpis.some((kpi) => kpi.status !== 'PENDING_EXTERNAL')) fail('field KPI status must remain PENDING_EXTERNAL before a pilot society is named');
  if (plan.fieldEvidenceStatus !== 'NOT_STARTED') fail('fieldEvidenceStatus must remain NOT_STARTED before pilot execution');
}
if (plan.status === 'COMPLETE') {
  if (!plan.pilotSociety) fail('COMPLETE requires pilotSociety');
  if (plan.kpis.some((kpi) => kpi.status !== 'PASS')) fail('COMPLETE requires all KPIs PASS');
  for (const role of requiredSignOff) if (plan.signOff[role].status !== 'SIGNED') fail(`COMPLETE requires ${role} sign-off`);
}

console.log(`V4.11 pilot readiness OK: ${ids.size} KPIs across ${domains.size} domains; field evidence status ${plan.fieldEvidenceStatus}.`);
