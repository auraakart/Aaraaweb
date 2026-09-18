import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const fail=m=>{throw new Error(`V2 staging pilot execution: ${m}`)};
const path='docs/v2-staging-pilot-execution.json';
const record=JSON.parse(await readFile(path,'utf8'));
const sha=/^[0-9a-f]{40}$/;
const url=/^https:\/\//;
const statuses=new Set(['NOT_PREPARED','READY_FOR_STAGING','STAGING_PROMOTED','STAGING_DEPLOYED','PILOT_IN_PROGRESS','COMPLETE']);
const decisions=new Set(['NOT_READY','READY_FOR_PILOT','READY_FOR_RELEASE']);
if(record.schemaVersion!=='aaraagate.v2.staging-pilot-execution.v2')fail('unexpected schemaVersion');
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
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const promoted=['STAGING_PROMOTED','STAGING_DEPLOYED','PILOT_IN_PROGRESS','COMPLETE'].includes(record.status);
if(promoted){
  if(!sha.test(record.candidate?.stagingSha||''))fail('stagingSha is required after staging promotion');
  if(!sha.test(record.candidate?.rollbackMainSha||''))fail('rollbackMainSha is required after staging promotion');
  try{git('cat-file','-e',`${record.candidate.developSha}^{commit}`);git('cat-file','-e',`${record.candidate.stagingSha}^{commit}`);}catch{fail('declared developSha and stagingSha must exist in fetched Git history');}
  try{execFileSync('git',['merge-base','--is-ancestor',record.candidate.developSha,record.candidate.stagingSha],{stdio:'ignore'});}catch{fail('declared develop candidate must be an ancestor of the staging promotion commit');}
  const developTree=git('rev-parse',`${record.candidate.developSha}^{tree}`);
  const stagingTree=git('rev-parse',`${record.candidate.stagingSha}^{tree}`);
  if(developTree!==stagingTree)fail('staging promotion commit must preserve the declared develop candidate tree');
}
if(record.status==='STAGING_PROMOTED'&&!record.technicalEvidence?.hostedStagingAcceptance){
  if(!Array.isArray(record.blockingIssues)||record.blockingIssues.length===0)fail('STAGING_PROMOTED without hosted acceptance must record a blocking issue');
}
const deployed=['STAGING_DEPLOYED','PILOT_IN_PROGRESS','COMPLETE'].includes(record.status);
if(deployed){
  if(!url.test(record.candidate?.hostedStagingUrl||''))fail('hostedStagingUrl must be HTTPS after hosted staging deployment acceptance');
  if(!record.technicalEvidence?.hostedStagingAcceptance)fail('hosted staging acceptance evidence is required after hosted staging deployment acceptance');
}
const pilotStarted=['PILOT_IN_PROGRESS','COMPLETE'].includes(record.status);
if(pilotStarted){
  if(!record.pilot?.identifier||!record.pilot?.society||!record.pilot?.releaseOwner)fail('pilot identifier, society and release owner are required once pilot starts');
  if(!Array.isArray(record.pilot.reviewers)||record.pilot.reviewers.length===0)fail('at least one reviewer is required once pilot starts');
  for(const flag of ['accountsReady','residentDevicesReady','guardDevicesReady'])if(record.pilot[flag]!==true)fail(`${flag} must be true once pilot starts`);
}
if(record.releaseDecision==='READY_FOR_PILOT'&&!deployed)fail('READY_FOR_PILOT requires hosted staging deployment acceptance');
if(record.releaseDecision==='READY_FOR_RELEASE'){
  if(record.status!=='COMPLETE')fail('READY_FOR_RELEASE requires COMPLETE status');
  if((record.blockingIssues||[]).length)fail('READY_FOR_RELEASE cannot have blocking issues');
  if(!record.technicalEvidence?.productionPreflight)fail('READY_FOR_RELEASE requires production preflight evidence');
}
console.log(`V2 staging pilot execution record OK: ${record.status}, ${record.releaseDecision}.`);
