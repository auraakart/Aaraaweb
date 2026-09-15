import { readFile } from 'node:fs/promises';
const fail=m=>{throw new Error(`V2 policy pilot plan: ${m}`)};
const plan=JSON.parse(await readFile('docs/v2-policy-pilot-plan.json','utf8'));
const requiredDomains=['V2-OCC','V2-GOV','V2-AMN','V2-COM'];
const statuses=new Set(['NOT_RUN','PASS','FAIL','BLOCKED']);
if(plan.schemaVersion!=='aaraagate.v2.policy-pilot.v1')fail('unexpected schemaVersion');
if(plan.phase!=='V2.4')fail('phase must be V2.4');
if(!Array.isArray(plan.scenarios)||plan.scenarios.length<8)fail('at least 8 pilot scenarios are required');
const ids=new Set(); const covered=new Set();
for(const scenario of plan.scenarios){
  if(ids.has(scenario.id))fail(`duplicate scenario ${scenario.id}`); ids.add(scenario.id);
  if(!statuses.has(scenario.status))fail(`${scenario.id} has invalid status ${scenario.status}`);
  if(!Array.isArray(scenario.domains)||scenario.domains.length===0)fail(`${scenario.id} has no domains`);
  for(const domain of scenario.domains)covered.add(domain);
  if(!Array.isArray(scenario.requiredEvidence)||scenario.requiredEvidence.length<2)fail(`${scenario.id} must define required evidence`);
  if(!Array.isArray(scenario.evidence))fail(`${scenario.id} evidence must be an array`);
  if(scenario.status==='PASS'&&scenario.evidence.length<scenario.requiredEvidence.length)fail(`${scenario.id} cannot PASS without the required evidence set`);
}
for(const domain of requiredDomains)if(!covered.has(domain))fail(`missing required pilot domain ${domain}`);
const started=plan.scenarios.some(s=>s.status!=='NOT_RUN');
if(started){
  if(!plan.pilotSociety||typeof plan.pilotSociety!=='string')fail('pilotSociety is required once execution starts');
  if(!Array.isArray(plan.reviewers)||plan.reviewers.length===0)fail('at least one reviewer is required once execution starts');
}
if(plan.status==='COMPLETE'&&plan.scenarios.some(s=>s.status!=='PASS'))fail('plan cannot be COMPLETE until every scenario passes');
console.log(`V2 policy pilot plan OK: ${ids.size} scenarios covering ${requiredDomains.length} required domains.`);
