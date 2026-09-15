import { access, readFile } from 'node:fs/promises';
const fail=m=>{throw new Error(`V2 staging pilot execution: ${m}`)};
const path='docs/v2-staging-pilot-execution.json';
const record=JSON.parse(await readFile(path,'utf8'));
const sha=/^[0-9a-f]{40}$/;
const url=/^https:\/\//;
const statuses=new Set(['NOT_PREPARED','READY_FOR_STAGING','STAGING_DEPLOYED','PILOT_IN_PROGRESS','COMPLETE']);
const decisions=new Set(['NOT_READY','READY_FOR_PILOT','READY_FOR_RELEASE']);
if(record.schemaVersion!=='aaraagate.v2.staging-pilot-execution.v1')fail('unexpected schemaVersion');
if(record.phase!=='V2.4')fail('phase must be V2.4');
if(!statuses.has(record.status))fail(`invalid status ${record.status}`);
if(!decisions.has(record.releaseDecision))fail(`invalid releaseDecision ${record.releaseDecision}`);
if(!sha.test(record.candidate?.developSha||''))fail('candidate developSha must be an exact 40-char SHA');
const requiredPaths=[
  record.technicalEvidence?.backupRestoreEvidence,
  record.humanValidation?.roleUat,
  record.humanValidation?.policyPilot,
  record.humanValidation?.securityPrivacyReview,
  record.humanValidation?.pilotAcceptance
];
for(const p of requiredPaths){if(!p||p.startsWith('/')||p.includes('..'))fail(`invalid evidence path ${p}`);await access(p);}
const staged=['STAGING_DEPLOYED','PILOT_IN_PROGRESS','COMPLETE'].includes(record.status);
if(staged){
  if(!sha.test(record.candidate?.stagingSha||''))fail('stagingSha is required after staging deployment');
  if(record.candidate.stagingSha!==record.candidate.developSha)fail('stagingSha must equal the declared develop candidate SHA');
  if(!sha.test(record.candidate?.rollbackMainSha||''))fail('rollbackMainSha is required after staging deployment');
  if(!url.test(record.candidate?.hostedStagingUrl||''))fail('hostedStagingUrl must be HTTPS after staging deployment');
  if(!record.technicalEvidence?.hostedStagingAcceptance)fail('hosted staging acceptance evidence is required after staging deployment');
}
const pilotStarted=['PILOT_IN_PROGRESS','COMPLETE'].includes(record.status);
if(pilotStarted){
  if(!record.pilot?.identifier||!record.pilot?.society||!record.pilot?.releaseOwner)fail('pilot identifier, society and release owner are required once pilot starts');
  if(!Array.isArray(record.pilot.reviewers)||record.pilot.reviewers.length===0)fail('at least one reviewer is required once pilot starts');
  for(const flag of ['accountsReady','residentDevicesReady','guardDevicesReady'])if(record.pilot[flag]!==true)fail(`${flag} must be true once pilot starts`);
}
if(record.releaseDecision==='READY_FOR_PILOT'&&!staged)fail('READY_FOR_PILOT requires a staged exact-SHA candidate');
if(record.releaseDecision==='READY_FOR_RELEASE'){
  if(record.status!=='COMPLETE')fail('READY_FOR_RELEASE requires COMPLETE status');
  if((record.blockingIssues||[]).length)fail('READY_FOR_RELEASE cannot have blocking issues');
  if(!record.technicalEvidence?.productionPreflight)fail('READY_FOR_RELEASE requires production preflight evidence');
}
console.log(`V2 staging pilot execution record OK: ${record.status}, ${record.releaseDecision}.`);
