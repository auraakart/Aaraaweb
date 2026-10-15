import { readFile } from 'node:fs/promises';

const fail = (message) => { throw new Error(`V2 pilot acceptance plan: ${message}`); };
const plan = JSON.parse(await readFile('docs/v2-pilot-acceptance-plan.json', 'utf8'));
const requiredPersonas = ['ACCOUNTANT_TREASURER', 'COMMITTEE'];
const requiredDomains = ['V2-FIN', 'V2-ANL'];
const scenarioStatuses = new Set(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED']);
const signOffStatuses = new Set(['NOT_SIGNED', 'SIGNED', 'REJECTED']);

if (plan.schemaVersion !== 'aaraagate.v2.pilot-acceptance.v1') fail('unexpected schemaVersion');
if (plan.phase !== 'V2.4') fail('phase must be V2.4');
if (!Array.isArray(plan.scenarios) || plan.scenarios.length < 6) fail('at least 6 acceptance scenarios are required');

for (const persona of requiredPersonas) {
  if (!plan.participants || !Array.isArray(plan.participants[persona])) fail(`participants.${persona} must be an array`);
  if (!plan.signOff || !plan.signOff[persona]) fail(`signOff.${persona} is required`);
  if (!signOffStatuses.has(plan.signOff[persona].status)) fail(`signOff.${persona} has invalid status`);
  if (!Array.isArray(plan.signOff[persona].evidence)) fail(`signOff.${persona}.evidence must be an array`);
  if (plan.signOff[persona].status === 'SIGNED' && plan.signOff[persona].evidence.length === 0) fail(`${persona} cannot be SIGNED without evidence`);
}

const ids = new Set();
const coveredPersonas = new Set();
const coveredDomains = new Set();
for (const scenario of plan.scenarios) {
  if (ids.has(scenario.id)) fail(`duplicate scenario ${scenario.id}`);
  ids.add(scenario.id);
  if (!scenarioStatuses.has(scenario.status)) fail(`${scenario.id} has invalid status ${scenario.status}`);
  if (!Array.isArray(scenario.personas) || scenario.personas.length === 0) fail(`${scenario.id} has no personas`);
  if (!Array.isArray(scenario.domains) || scenario.domains.length === 0) fail(`${scenario.id} has no domains`);
  for (const persona of scenario.personas) coveredPersonas.add(persona);
  for (const domain of scenario.domains) coveredDomains.add(domain);
  if (!Array.isArray(scenario.requiredEvidence) || scenario.requiredEvidence.length < 2) fail(`${scenario.id} must define at least two evidence items`);
  if (!Array.isArray(scenario.evidence)) fail(`${scenario.id} evidence must be an array`);
  if (scenario.status === 'PASS' && scenario.evidence.length < scenario.requiredEvidence.length) fail(`${scenario.id} cannot PASS without required evidence`);
}

for (const persona of requiredPersonas) if (!coveredPersonas.has(persona)) fail(`missing persona coverage ${persona}`);
for (const domain of requiredDomains) if (!coveredDomains.has(domain)) fail(`missing domain coverage ${domain}`);

const started = plan.scenarios.some((scenario) => scenario.status !== 'NOT_RUN');
if (started) {
  if (!plan.pilotSociety || typeof plan.pilotSociety !== 'string') fail('pilotSociety is required once acceptance starts');
  for (const persona of requiredPersonas) {
    if (plan.participants[persona].length === 0) fail(`${persona} requires at least one named participant once acceptance starts`);
  }
}

if (plan.status === 'COMPLETE') {
  if (plan.scenarios.some((scenario) => scenario.status !== 'PASS')) fail('plan cannot be COMPLETE until every scenario passes');
  for (const persona of requiredPersonas) if (plan.signOff[persona].status !== 'SIGNED') fail(`plan cannot be COMPLETE until ${persona} signs off`);
}

console.log(`V2 pilot acceptance plan OK: ${ids.size} scenarios across ${requiredPersonas.length} personas and ${requiredDomains.length} domains.`);
