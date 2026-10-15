import { readFile } from 'node:fs/promises';
const fail=m=>{throw new Error(`V2 role UAT plan: ${m}`)};
const plan=JSON.parse(await readFile('docs/v2-role-uat-plan.json','utf8'));
const personas=['ACCOUNTANT_TREASURER','COMMITTEE','FACILITY','SECURITY_SUPERVISOR','AUDITOR'];
const domains=new Set(['V2-FIN','V2-OCC','V2-GOV','V2-EMR','V2-PRV','V2-PAY','V2-RBAC','V2-FAC','V2-VND','V2-DOC','V2-HLP','V2-COM','V2-AMN','V2-PRC','V2-PRK','V2-UTL','V2-ANL']);
const statuses=new Set(['NOT_RUN','PASS','FAIL','BLOCKED']);
if(plan.schemaVersion!=='aaraagate.v2.role-uat.v1')fail('unexpected schemaVersion');
if(plan.phase!=='V2.4')fail('phase must be V2.4');
const ids=new Set();
for(const persona of personas){
  const entry=plan.personas?.find(p=>p.id===persona);
  if(!entry)fail(`missing persona ${persona}`);
  if(!Array.isArray(entry.scenarios)||entry.scenarios.length<3)fail(`${persona} needs at least 3 scenarios`);
  for(const scenario of entry.scenarios){
    if(ids.has(scenario.id))fail(`duplicate scenario ${scenario.id}`);ids.add(scenario.id);
    if(!statuses.has(scenario.status))fail(`${scenario.id} has invalid status`);
    if(!Array.isArray(scenario.domains)||scenario.domains.length===0)fail(`${scenario.id} has no domains`);
    for(const d of scenario.domains)if(!domains.has(d))fail(`${scenario.id} references unknown domain ${d}`);
    if(scenario.status==='PASS'&&(!Array.isArray(scenario.evidence)||scenario.evidence.length===0))fail(`${scenario.id} cannot PASS without evidence`);
  }
}
if(plan.status==='COMPLETE'){
  const all=plan.personas.flatMap(p=>p.scenarios);
  if(all.some(s=>s.status!=='PASS'))fail('plan cannot be COMPLETE until every scenario passes');
}
console.log(`V2 role UAT plan OK: ${plan.personas.length} personas, ${ids.size} scenarios.`);
