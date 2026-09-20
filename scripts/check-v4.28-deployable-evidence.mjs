import { readFile } from 'node:fs/promises';

const fail=(message)=>{throw new Error(`V4.28 deployable evidence: ${message}`);};
const plan=JSON.parse(await readFile('docs/v4.28-pilot-evidence.json','utf8'));

const requiredKpis=['GATE','VISITOR_APPROVAL','RESIDENT_ACTIVATION','COLLECTION','PAYMENT','HELPDESK','AMENITIES','APP_STABILITY','SUPPORT'];
const requiredScripts=['RESIDENT','GUARD','SOCIETY_ADMIN','SECURITY_SUPERVISOR','ACCOUNTANT'];
const requiredTraining=[...requiredScripts];
const requiredProofs=['HOSTED_STAGING','BACKUP_RESTORE','MONITORING_ALERTS','INCIDENT_TABLETOP','LIVE_PROVIDERS','ANDROID_SIGNED_PLAY'];
const requiredSignOff=['RESIDENT_REPRESENTATIVE','GUARD_REPRESENTATIVE','SOCIETY_ADMIN','SECURITY_SUPERVISOR','ACCOUNTANT_TREASURER','RELEASE_OWNER'];
const fieldStatuses=new Set(['PENDING_EXTERNAL','PASS','FAIL','BLOCKED']);
const signStatuses=new Set(['NOT_SIGNED','SIGNED','REJECTED']);
const decisions=new Set(['HOLD_EXTERNAL_EVIDENCE','NO_GO','GO']);
const requireGo=process.argv.includes('--require-go');

if(plan.schemaVersion!=='aaraagate.v4.28.pilot-evidence.v1')fail('unexpected schemaVersion');
if(plan.phase!=='V4.28')fail('phase must be V4.28');
if(!decisions.has(plan.productionDecision))fail('invalid productionDecision');
if(!Array.isArray(plan.repositoryEvidence)||plan.repositoryEvidence.length<8)fail('repositoryEvidence must name the required exact-head gates');

if(!Array.isArray(plan.kpis)||plan.kpis.length!==9)fail('exactly nine roadmap KPI definitions are required');
const ids=new Set(),domains=new Set();
for(const kpi of plan.kpis){
  if(!kpi.id||ids.has(kpi.id))fail(`duplicate or missing KPI id ${kpi.id??''}`);
  ids.add(kpi.id);domains.add(kpi.domain);
  for(const key of ['owner','title','measurement','threshold'])if(typeof kpi[key]!=='string'||kpi[key].trim().length===0)fail(`${kpi.id} missing ${key}`);
  if(!fieldStatuses.has(kpi.status))fail(`${kpi.id} invalid status ${kpi.status}`);
  if(!Array.isArray(kpi.evidence)||kpi.evidence.some(v=>typeof v!=='string'||!v.trim()))fail(`${kpi.id}.evidence must contain non-empty references only`);
  if(kpi.status==='PASS'&&kpi.evidence.length===0)fail(`${kpi.id} cannot PASS without evidence`);
  if(kpi.status==='PASS'&&!plan.pilotSociety)fail(`${kpi.id} cannot PASS without pilotSociety`);
}
for(const domain of requiredKpis)if(!domains.has(domain))fail(`missing KPI domain ${domain}`);

for(const role of requiredScripts){
  const item=plan.acceptanceScripts?.[role];
  if(!item||!fieldStatuses.has(item.status)||!Array.isArray(item.evidence))fail(`invalid acceptanceScripts.${role}`);
  if(item.status==='PASS'&&item.evidence.length===0)fail(`${role} acceptance cannot PASS without evidence`);
  if(item.status==='PASS'&&!plan.pilotSociety)fail(`${role} acceptance cannot PASS without pilotSociety`);
}
for(const role of requiredTraining){
  if(!Array.isArray(plan.training?.[role])||plan.training[role].length<3)fail(`training.${role} requires at least three checklist items`);
}
for(const proof of requiredProofs){
  const item=plan.externalProofs?.[proof];
  if(!item||!fieldStatuses.has(item.status)||!Array.isArray(item.evidence))fail(`invalid externalProofs.${proof}`);
  if(item.status==='PASS'&&item.evidence.length===0)fail(`${proof} cannot PASS without evidence`);
}
for(const role of requiredSignOff){
  const item=plan.signOff?.[role];
  if(!item||!signStatuses.has(item.status)||!Array.isArray(item.evidence))fail(`invalid signOff.${role}`);
  if(item.status==='SIGNED'&&item.evidence.length===0)fail(`${role} cannot be SIGNED without evidence`);
  if(item.status==='SIGNED'&&!plan.pilotSociety)fail(`${role} cannot be SIGNED without pilotSociety`);
}

if(!plan.blockers||!Array.isArray(plan.blockers.sev1)||!Array.isArray(plan.blockers.sev2))fail('blockers.sev1/sev2 arrays are required');
for(const severity of ['sev1','sev2'])for(const blocker of plan.blockers[severity]){
  if(!blocker||typeof blocker!=='object'||typeof blocker.id!=='string'||!blocker.id.trim()||typeof blocker.title!=='string'||!blocker.title.trim())fail(`invalid ${severity} blocker`);
}

const shaOk=(value)=>typeof value==='string'&&/^[0-9a-f]{40}$/i.test(value);
if(plan.candidateSha!==null&&!shaOk(plan.candidateSha))fail('candidateSha must be null or a 40-character commit SHA');
if(plan.rollbackSha!==null&&!shaOk(plan.rollbackSha))fail('rollbackSha must be null or a 40-character commit SHA');
if(process.env.EXPECTED_CANDIDATE_SHA&&plan.candidateSha!==process.env.EXPECTED_CANDIDATE_SHA)fail('candidateSha does not match exact release candidate');
if(process.env.EXPECTED_ROLLBACK_SHA&&plan.rollbackSha!==process.env.EXPECTED_ROLLBACK_SHA)fail('rollbackSha does not match release rollback target');

if(!plan.pilotSociety){
  if(plan.status!=='REPOSITORY_READY_EXTERNAL_PENDING')fail('status must remain REPOSITORY_READY_EXTERNAL_PENDING before a pilot society is named');
  if(plan.fieldEvidenceStatus!=='NOT_STARTED')fail('fieldEvidenceStatus must remain NOT_STARTED before pilot execution');
  if(plan.kpis.some(k=>k.status!=='PENDING_EXTERNAL'))fail('all field KPIs must remain PENDING_EXTERNAL before pilot execution');
  if(Object.values(plan.acceptanceScripts).some(item=>item.status!=='PENDING_EXTERNAL'))fail('acceptance scripts must remain PENDING_EXTERNAL before pilot execution');
  if(Object.values(plan.externalProofs).some(item=>item.status!=='PENDING_EXTERNAL'))fail('external proofs must remain PENDING_EXTERNAL before pilot execution');
  if(Object.values(plan.signOff).some(item=>item.status!=='NOT_SIGNED'))fail('sign-offs must remain NOT_SIGNED before pilot execution');
  if(plan.productionDecision!=='HOLD_EXTERNAL_EVIDENCE')fail('productionDecision must remain HOLD_EXTERNAL_EVIDENCE before pilot execution');
}

if(requireGo&&plan.productionDecision!=='GO')fail('production release requires productionDecision GO');

if(plan.productionDecision==='GO'){
  if(!plan.pilotSociety)fail('GO requires pilotSociety');
  if(!shaOk(plan.candidateSha)||!shaOk(plan.rollbackSha))fail('GO requires exact candidateSha and rollbackSha');
  if(plan.blockers.sev1.length||plan.blockers.sev2.length)fail('GO requires zero unresolved Sev-1/Sev-2 blockers');
  if(plan.kpis.some(k=>k.status!=='PASS'))fail('GO requires every KPI PASS');
  if(Object.values(plan.acceptanceScripts).some(item=>item.status!=='PASS'))fail('GO requires all acceptance scripts PASS');
  if(Object.values(plan.externalProofs).some(item=>item.status!=='PASS'))fail('GO requires all external proofs PASS');
  for(const role of requiredSignOff)if(plan.signOff[role].status!=='SIGNED')fail(`GO requires ${role} sign-off`);
  if(plan.fieldEvidenceStatus!=='COMPLETE')fail('GO requires fieldEvidenceStatus COMPLETE');
  if(plan.status!=='COMPLETE')fail('GO requires status COMPLETE');
}

console.log(`V4.28 deployable evidence OK: ${ids.size} KPIs, ${requiredScripts.length} role scripts, ${requiredProofs.length} external proofs; decision ${plan.productionDecision}.`);
