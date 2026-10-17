import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessV56Preparation} from './v5.6.2-acceptance-matrix.mjs';

const matrix=JSON.parse(readFileSync(new URL('../docs/architecture/v5.6.2-nonproduction-acceptance-matrix.json',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('../docs/v5-release-manifest.json',import.meta.url),'utf8'));
const inspect=(editMatrix=()=>{},editManifest=()=>{})=>{
 const m=structuredClone(matrix),v=structuredClone(manifest);
 editMatrix(m);editManifest(v);return assessV56Preparation(m,v);
};
test('V5.6.2 approved acceptance plan is complete but has no execution or release authority',()=>{
 const result=inspect();
 assert.equal(result.caseCount,15);
 assert.equal(result.casesExecuted,0);
 for(const k of ['independentEvidenceAccepted','closureReady','buildExecutionAuthorized',
                 'releaseCandidateApproved','stagingPromotionApproved','mainPromotionApproved'])
  assert.equal(result[k],false,k);
 assert.ok(Object.isFrozen(result));
});
const matrixFaults=[
 ['missing tenant isolation case',m=>{m.cases=m.cases.filter(x=>x.id!=='V56-TENANT-01');}],
 ['duplicated case',m=>{m.cases[1]=structuredClone(m.cases[0]);}],
 ['weakened expected outcome',m=>{m.cases[0].expectedOutcome='ALLOW_CROSS_PARTNER_DATA';}],
 ['missing domain trust dependency',m=>{m.cases.find(x=>x.id==='V56-DOMAIN-01').dependsOn=['CI'];}],
 ['missing independent runtime proof',m=>{m.cases.find(x=>x.id==='V56-PROVENANCE-01').evidenceKinds=['TLS_CAPTURE'];}],
 ['fake passed test',m=>{m.cases[0].executionStatus='PASSED';}],
 ['fabricated evidence reference',m=>{m.cases[0].evidenceRefs=['fake://ci'];}],
 ['fabricated candidate SHA',m=>{m.candidateSha='a'.repeat(40);}],
 ['fabricated external acceptance',m=>{m.externalAcceptanceVerified=true;}],
 ['build authorization',m=>{m.authority.buildExecutionAuthorized=true;}],
 ['partner distribution authorization',m=>{m.authority.partnerDistributionApproved=true;}],
 ['staging promotion',m=>{m.authority.stagingPromotionApproved=true;}],
 ['main promotion',m=>{m.authority.mainPromotionApproved=true;}],
 ['productionization',m=>{m.authority.productionizationIncluded=true;}],
 ['unexpected schema permission',m=>{m.authority.unknownPrivilege=true;}]
];
for(const [name,change] of matrixFaults){
 test('V5.6.2 rejects '+name,()=>{
  assert.throws(()=>inspect(change),/V5.6.2 acceptance matrix:/);
 });
}
const manifestFaults=[
 ['false V5.4 closure',m=>{m.milestones.find(x=>x.id==='V5.4').status='COMPLETED';}],
 ['false V5.5 closure',m=>{m.milestones.find(x=>x.id==='V5.5').status='COMPLETED';}],
 ['false V5.6 closure',m=>{m.milestones.find(x=>x.id==='V5.6').status='COMPLETED';}],
 ['erased runner blocker',m=>{m.milestones.find(x=>x.id==='V5.5').remaining=[];}],
 ['automated main promotion',m=>{m.promotion.main='AUTO_MERGE';}],
 ['unauthorized staging release',m=>{m.promotion.staging='PROMOTED';}],
 ['production scope',m=>{m.productionizationIncluded=true;}],
 ['duplicate V5.6 milestone',m=>{m.milestones.push(structuredClone(m.milestones.find(x=>x.id==='V5.6')));}]
];
for(const [name,change] of manifestFaults){
 test('V5.6.2 rejects '+name,()=>{
  assert.throws(()=>inspect(()=>{},change),/V5.6.2 acceptance matrix:/);
 });
}
