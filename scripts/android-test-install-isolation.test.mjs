import test from 'node:test';
import assert from 'node:assert/strict';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { evaluateTestAndroidCoInstallationPlans } from '../packages/config/src/android-test-install-isolation.mjs';

const id=(hex)=>hex.repeat(8)+'-'+hex.repeat(4)+'-4'+hex.repeat(3)+'-8'+hex.repeat(3)+'-'+hex.repeat(12);
function plan(partner,role,society=partner){
 const partnerId=id(partner),societyId=id(society);
 const n=role==='RESIDENT'?'a':'b';
 const distributionId=id(partner==='1'?(role==='RESIDENT'?'3':'4'):
   (role==='RESIDENT'?'5':'6'));
 const applicationId='in.fixture.brand'+partner+'.'+role.toLowerCase();
 const m={schemaVersion:1,buildMode:'TEST',appRole:role,partnerId,societyId,
  distributionId,applicationId,namespace:applicationId,
  signerFingerprint:(partner==='1'?'a':'b').repeat(64),
  signingProfile:'TEST_PARTNER_'+partner,
  configDigest:'c'.repeat(64),
  appLinkHosts:['app'+partner+'-'+role.toLowerCase()+'.fixture.in']};
 return {manifest:m,manifestDigest:androidBuildManifestDigest(m),
  artifactPrefix:'test-'+distributionId+'-'+role.toLowerCase(),
  appDirectory:'apps/'+role.toLowerCase(),
  testOnly:true,requiresVersionReservation:true,dispatchAllowed:false};
}
const pair=(who='1')=>[plan(who,'RESIDENT'),plan(who,'GUARD')];
const matrix=()=>[...pair('1'),...pair('2')];
function rewrite(p,change){
 const updated={...p,manifest:{...p.manifest}};
 change(updated.manifest,updated);
 updated.manifestDigest=androidBuildManifestDigest(updated.manifest);
 return updated;
}
test('V5.5.24 keeps Resident/Guard TEST install namespaces disjoint',()=>{
 const receipt=evaluateTestAndroidCoInstallationPlans(pair());
 assert.equal(receipt.appCount,2);assert.equal(receipt.scopeCount,1);
 assert.equal(receipt.distinctPackagesVerified,true);
 assert.equal(receipt.derivedProviderNamespacesDistinct,true);
 assert.equal(receipt.appLinkFilterHostsDistinct,true);
 assert.equal(receipt.pairedRolesVerified,true);
 assert.equal(receipt.dispatchAllowed,false);
 assert.equal(receipt.realDeviceCoInstallationVerified,false);
 assert.equal(receipt.certificateVerified,false);
});
test('V5.5.24 isolates Partner A/B with both Resident and Guard apps',()=>{
 const r=evaluateTestAndroidCoInstallationPlans(matrix());
 assert.equal(r.appCount,4);assert.equal(r.scopeCount,2);
 assert.equal(r.crossPartnerTestSignerReferencesDistinct,true);
 assert.match(r.plannedIsolationDigest,/^[a-f0-9]{64}$/);
 assert.equal(r.artifactProduced,false);
 assert.equal(r.realDeviceCoInstallationVerified,false);
});
test('V5.5.24 matrix digest independent of input ordering',()=>{
 const p=matrix();
 const a=evaluateTestAndroidCoInstallationPlans(p);
 const b=evaluateTestAndroidCoInstallationPlans(p.reverse());
 assert.equal(a.plannedIsolationDigest,b.plannedIsolationDigest);
});
for(const [label,mutate] of [
 ['single app missing Guard',p=>p.pop()],
 ['duplicate Resident role',p=>{p[1]=rewrite(p[1],m=>{m.appRole='RESIDENT';});}],
 ['same package across partners',p=>{p[2]=rewrite(p[2],m=>{m.applicationId=m.namespace=p[0].manifest.applicationId;});}],
 ['foreign package pretending to be provider',p=>{p[2]=rewrite(p[2],m=>{m.applicationId=m.namespace=p[0].manifest.applicationId+'.fileprovider';});}],
 ['app-link host collision',p=>{p[2]=rewrite(p[2],m=>{m.appLinkHosts=[p[0].manifest.appLinkHosts[0]];});}],
 ['noncanonical app-link host',p=>{p[2]=rewrite(p[2],m=>{m.appLinkHosts=['UPPER.fixture.in'];});}],
 ['shared cross-partner signer',p=>{p[2]=rewrite(p[2],m=>{m.signerFingerprint=p[0].manifest.signerFingerprint;});}],
 ['cross-partner signing profile collision',p=>{p[2]=rewrite(p[2],m=>{m.signingProfile=p[0].manifest.signingProfile;});}],
 ['wrong role app directory',p=>{p[0]={...p[0],appDirectory:'apps/guard'};}],
 ['reused distribution',p=>{p[2]=rewrite(p[2],m=>{m.distributionId=p[0].manifest.distributionId;});}],
 ['tampered manifest digest',p=>{p[0]={...p[0],manifestDigest:'0'.repeat(64)};}],
 ['fake dispatch authority',p=>{p[0]={...p[0],dispatchAllowed:true};}],
 ['non TEST build',p=>{p[0]=rewrite(p[0],m=>{m.buildMode='RELEASE';});}],
 ['unreviewed signer reference',p=>{p[0]=rewrite(p[0],m=>{m.signingProfile='PROD_KEY';});}],
 ['wrong derived artifact prefix',p=>{p[0]={...p[0],artifactPrefix:'apk.apk'};}],
 ['foreign society identity',p=>{p[0]=rewrite(p[0],m=>{m.societyId=id('7');});}],
 ['missing Guard pair across partner',p=>p.splice(3,1)],
 ['over-capacity matrix',p=>{for(let i=0;i<10;i++)p.push(...pair('1'));}]
])test('V5.5.24 fails closed on '+label,()=>{
 const p=matrix();
 mutate(p);
 assert.throws(()=>evaluateTestAndroidCoInstallationPlans(p));
});
