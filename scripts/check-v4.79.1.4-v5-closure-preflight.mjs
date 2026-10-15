import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// V5.6 preparation only: this report cannot authorize promotion, signing,
// remote worker dispatch, production activation or release distribution.
const ids=['V5.0','V5.1','V5.2','V5.3','V5.4','V5.5','V5.6'];
const requiredChecks=['V5.5.33','V5.5.34','V5.5.35'];
const externals=[
 'Externally authenticated, independently attested TEST OCI runner',
 'Independently pinned partner signer and approved partner build manifest',
 'Actual Partner A/B Android package isolation and device installation evidence',
 'V5.4 trusted reverse-proxy nonproduction transport acceptance',
 'V5.6 regression, accessibility, migration and rollback acceptance'
];
const sha=/^[a-f0-9]{40}$/;
export function assessV5EngineeringClosure(m){
 assert.ok(m&&typeof m==='object'&&!Array.isArray(m),'Missing V5 manifest');
 assert.equal(m.programVersion,'5.0.0','Unrecognized V5 program');
 assert.equal(m.productionizationIncluded,false,'Production scope accidentally enabled');
 assert.equal(m.promotion?.target,'develop','Wrong development target');
 assert.equal(m.promotion?.staging,'CONSOLIDATED_CANDIDATE_ONLY','Unsafe staging promotion');
 assert.equal(m.promotion?.main,'EXPLICIT_OWNER_APPROVAL_REQUIRED','Main approval must remain manual');
 assert.ok(Array.isArray(m.milestones),'Missing milestone register');
 const milestones=new Map();
 for(const item of m.milestones){
  assert.ok(item&&typeof item.id==='string'&&ids.includes(item.id),'Invalid V5 milestone');
  assert.ok(!milestones.has(item.id),'Duplicate milestone '+item.id);
  milestones.set(item.id,item);
 }
 for(const id of ids)assert.ok(milestones.has(id),'Missing milestone '+id);
 const unmet=ids.filter(id=>milestones.get(id).status!=='COMPLETED');
 const android=milestones.get('V5.5');
 assert.ok(Array.isArray(android.slices),'Missing Android engineering slices');
 const proven=[];
 for(const id of requiredChecks){
  const slice=android.slices.find(s=>s.id===id);
  const verified=!!slice&&slice.status?.startsWith('MERGED_PROTECTED_CI_PASSED')&&
   Number.isInteger(slice.pullRequest)&&slice.pullRequest>0&&
   Number.isInteger(slice.ciRun)&&slice.ciRun>0&&sha.test(slice.mergeSha||'');
  if(verified)proven.push(id);
 }
 const blockers=unmet.map(id=>({kind:'MILESTONE_NOT_COMPLETE',id,status:milestones.get(id).status}));
 for(const id of requiredChecks.filter(id=>!proven.includes(id)))
  blockers.push({kind:'ANDROID_BASE_TEST_EVIDENCE_MISSING',id});
 // These are external live-acceptance requirements. A declaration in this
 // local manifest is never sufficient evidence of a trusted execution context.
 for(const requirement of externals)
  blockers.push({kind:'INDEPENDENT_ACCEPTANCE_NOT_ESTABLISHED',requirement});
 return Object.freeze({
  program:'Aaraagate V5',testOnly:true,
  structurallyCompletedMilestones:ids.filter(id=>!unmet.includes(id)),
  verifiedBaseAndroidEngineeringSlices:proven,
  blockers,closureReady:false,partnerBuildAuthorized:false,
  releaseCandidateApproved:false,productionReady:false,
  stagingPromotionAuthorized:false,mainPromotionAuthorized:false
 });
}
const source=JSON.parse(readFileSync('docs/v5-release-manifest.json','utf8'));
const result=assessV5EngineeringClosure(source);
assert.equal(result.closureReady,false);
assert.equal(result.mainPromotionAuthorized,false);
assert.ok(result.verifiedBaseAndroidEngineeringSlices.includes('V5.5.35'));
assert.ok(result.blockers.some(b=>b.id==='V5.4'&&b.kind==='MILESTONE_NOT_COMPLETE'));
assert.ok(result.blockers.some(b=>b.id==='V5.5'&&b.kind==='MILESTONE_NOT_COMPLETE'));
const fixture=structuredClone(source);
fixture.productionizationIncluded=true;
assert.throws(()=>assessV5EngineeringClosure(fixture),/Production scope/);
fixture.productionizationIncluded=false;
fixture.promotion.main='AUTO_MERGE';
assert.throws(()=>assessV5EngineeringClosure(fixture),/Main approval/);
fixture.promotion.main='EXPLICIT_OWNER_APPROVAL_REQUIRED';
fixture.milestones.push(structuredClone(fixture.milestones.find(x=>x.id==='V5.5')));
assert.throws(()=>assessV5EngineeringClosure(fixture),/Duplicate milestone/);
const forced=structuredClone(source);
for(const step of forced.milestones)step.status='COMPLETED';
const forcedResult=assessV5EngineeringClosure(forced);
assert.equal(forcedResult.closureReady,false);
assert.ok(forcedResult.blockers.some(b=>b.kind==='INDEPENDENT_ACCEPTANCE_NOT_ESTABLISHED'));
console.log('V5.6 nonproduction closure preflight PASS: '+JSON.stringify({
 done:result.structurallyCompletedMilestones,androidBaseEvidence:result.verifiedBaseAndroidEngineeringSlices,
 milestoneBlockers:result.blockers.filter(b=>b.kind==='MILESTONE_NOT_COMPLETE'),
 independentEvidenceGaps:externals.length,releaseApproved:false
}));
