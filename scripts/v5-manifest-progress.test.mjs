import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyV5ManifestProgress} from './v5-manifest-progress.mjs';

const actual=JSON.parse(readFileSync(new URL('../docs/v5-release-manifest.json',import.meta.url),'utf8'));
const changed=mutate=>{const data=structuredClone(actual);mutate(data);return data;};
const build=m=>m.milestones.find(x=>x.id==='V5.5');
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
