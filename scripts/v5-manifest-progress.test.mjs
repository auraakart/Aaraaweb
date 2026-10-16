import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyV5ManifestProgress} from './v5-manifest-progress.mjs';

const actual=JSON.parse(readFileSync(new URL('../docs/v5-release-manifest.json',import.meta.url),'utf8'));
const changed=mutate=>{const data=structuredClone(actual);mutate(data);return data;};
const build=m=>m.milestones.find(x=>x.id==='V5.5');
const engineering=m=>m.milestones.find(x=>x.id==='V5.6').preAcceptanceEngineering;
test('V5.5.45 checked-in manifest remains nonproduction and points to its latest slice',()=>{
 const report=verifyV5ManifestProgress(actual);
 assert.equal(report.latestSlice,'V5.5.45');
 assert.equal(report.currentStatus,'MERGED_PROTECTED_CI_PASSED_MANIFEST_PROGRESS_INTEGRITY_ONLY');
 assert.equal(report.buildExecutionAuthorized,false);
 assert.equal(report.partnerArtifactsVerified,false);
 assert.equal(report.mainPromoted,false);
 assert.equal(report.stagingPromoted,false);
 assert.ok(report.remainingExternalBlockers>0);
 assert.ok(Object.isFrozen(report));
});
const invalid=[
 ['stale slice pointer',m=>{build(m).currentSlice='V5.5.37';}],
 ['previous slice remains pending',m=>{build(m).slices.at(-2).status='PENDING_PROTECTED_CI';}],
 ['latest slice falsely left pending after merge',m=>{build(m).slices.at(-1).status='PENDING_PROTECTED_CI';}],
 ['merged slice missing PR evidence',m=>{delete build(m).slices.at(-1).pullRequest;}],
 ['merged slice missing merge SHA',m=>{delete build(m).slices.at(-1).mergeSha;}],
 ['invalid merge SHA',m=>{build(m).slices.at(-1).mergeSha='not-a-sha';}],
 ['fabricated future slice',m=>{build(m).currentSlice='V5.5.46';}],
 ['duplicate slice',m=>{build(m).slices.push(structuredClone(build(m).slices.at(-1)));}],
 ['out of order slice',m=>{const a=build(m).slices;a.push({...a.at(-1),id:'V5.5.3'});}],
 ['external runner blocker erased',m=>{build(m).remaining=[];}],
 ['false V5.5 completion',m=>{build(m).status='COMPLETED';}],
 ['false V5.6 release closure',m=>{m.milestones.find(x=>x.id==='V5.6').status='COMPLETED';}],
 ['unapproved staging promotion',m=>{m.promotion.staging='PROMOTED';}],
 ['unapproved main promotion',m=>{m.promotion.main='PROMOTED';}],
 ['productionization injected',m=>{m.productionizationIncluded=true;}],
 ['production invariant removed',m=>{m.invariants=m.invariants.filter(x=>x!=='No productionization');}]
];
for(const [scenario,mutate] of invalid) test('V5.5.45 rejects '+scenario,()=>{
 assert.throws(()=>verifyV5ManifestProgress(changed(mutate)),/V5 manifest progress:/);
});

test('V5.5.45 permits only a new evidence-free pending head slice',()=>{
 const data=changed(m=>{
   const current=build(m);
   current.slices.push({id:'V5.5.46',name:'Future bounded test slice',status:'PENDING_PROTECTED_CI'});
   current.currentSlice='V5.5.46';
 });
 const report=verifyV5ManifestProgress(data);
 assert.equal(report.latestSlice,'V5.5.46');
 assert.equal(report.currentStatus,'PENDING_PROTECTED_CI');
 assert.equal(report.buildExecutionAuthorized,false);
});

test('V5.6.18 checked-in engineering evidence tracks the latest protected merge but never release acceptance',()=>{
 const report=verifyV5ManifestProgress(actual);
 assert.equal(report.latestVerifiedEngineeringSlice,'V5.6.20');
 assert.equal(report.latestVerifiedEngineeringPr,1401);
 assert.equal(report.buildExecutionAuthorized,false);
 assert.equal(report.partnerArtifactsVerified,false);
 const v=engineering(actual);
 assert.equal(v.financeRecoveryEngineeringClosed,true);
 assert.equal(v.resolvedFinanceRecoveryIssue,1387);
 assert.equal(v.pendingFinanceRecoveryIssue,undefined);
 assert.equal(v.pendingIndependentTestIssue,1380);
 assert.equal(v.verifiedSlices.at(-1).mergeSha,'899d064927fe2b139028b26ce622e2a680895689');
 assert.equal(v.externalAcceptanceVerified,false);
 assert.equal(v.releaseCandidateApproved,false);
 assert.equal(actual.milestones.find(x=>x.id==='V5.6').status,'PLANNED');
});

const invalidV56=[
 ['stale verified slice pointer',m=>{engineering(m).lastVerifiedSlice='V5.6.15';}],
 ['stale verified merge SHA pointer',m=>{engineering(m).lastVerifiedMergeSha='a'.repeat(40);}],
 ['stale verified PR pointer',m=>{engineering(m).lastVerifiedPr=1397;}],
 ['stale verified CI pointer',m=>{engineering(m).lastVerifiedCI=38924094484;}],
 ['duplicate engineering slice',m=>{engineering(m).verifiedSlices.push(structuredClone(engineering(m).verifiedSlices.at(-1)));}],
 ['out-of-order engineering slice',m=>{engineering(m).verifiedSlices.reverse();}],
 ['missing protected CI evidence',m=>{delete engineering(m).verifiedSlices.at(-1).ciRun;}],
 ['missing merged PR evidence',m=>{delete engineering(m).verifiedSlices.at(-1).pullRequest;}],
 ['malformed merge SHA',m=>{engineering(m).verifiedSlices.at(-1).mergeSha='bad';}],
 ['reused merge SHA',m=>{engineering(m).verifiedSlices.at(-1).mergeSha=engineering(m).verifiedSlices[0].mergeSha;}],
 ['false unverified-slice completion',m=>{engineering(m).verifiedSlices.at(-1).status='COMPLETED';}],
 ['deleted resolved finance tracker',m=>{delete engineering(m).resolvedFinanceRecoveryIssue;}],
 ['false finance closure',m=>{engineering(m).financeRecoveryEngineeringClosed=false;}],
 ['obsolete finance pending claim',m=>{engineering(m).pendingFinanceRecoveryIssue=1387;}],
 ['deleted independent TEST tracker',m=>{delete engineering(m).pendingIndependentTestIssue;}],
 ['false external acceptance',m=>{engineering(m).externalAcceptanceVerified=true;}],
 ['unauthorized build execution',m=>{engineering(m).buildExecutionAuthorized=true;}],
 ['fabricated partner APK verification',m=>{engineering(m).partnerArtifactsVerified=true;}],
 ['unauthorized release candidate',m=>{engineering(m).releaseCandidateApproved=true;}],
 ['unverified in-flight pointer',m=>{engineering(m).latestRegressionUnderReview='V5.6.18';}],
];
for(const [scenario,mutate] of invalidV56) test('V5.6.18 rejects '+scenario,()=>{
 assert.throws(()=>verifyV5ManifestProgress(changed(mutate)),/V5 manifest progress:/);
});

test('V5.6.18 retains independent 15-case TEST acceptance as NOT_EXECUTED',()=>{
 const matrix=JSON.parse(readFileSync(new URL('../docs/architecture/v5.6.2-nonproduction-acceptance-matrix.json',import.meta.url),'utf8'));
 assert.equal(matrix.cases.length,15);
 assert.equal(matrix.status,'PREPARATION_ONLY');
 assert.equal(matrix.externalAcceptanceVerified,false);
 assert.equal(matrix.authority.buildExecutionAuthorized,false);
 assert.equal(matrix.authority.stagingPromotionApproved,false);
 assert.equal(matrix.authority.mainPromotionApproved,false);
 assert.ok(matrix.cases.every(row=>row.executionStatus==='NOT_EXECUTED'&&row.evidenceRefs.length===0));
});
