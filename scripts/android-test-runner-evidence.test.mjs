import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { testAndroidRunnerSignedBytes,verifyTestAndroidRunnerEvidence } from '../packages/config/src/android-test-runner-evidence.mjs';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function canonical(v){
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
function fixture(role='RESIDENT'){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const m={buildMode:'TEST',appRole:role,sourceSha:'a'.repeat(40),
  lockDigest:'b'.repeat(64),distributionId:'11111111-1111-4111-8111-111111111111'};
 const plan={manifest:m,manifestDigest:androidBuildManifestDigest(m),
  testOnly:true,dispatchAllowed:false,requiresVersionReservation:true,
  appDirectory:'apps/'+role.toLowerCase()};
 const reservation={id:'22222222-2222-4222-8222-222222222222',
  revisionId:'33333333-3333-4333-8333-333333333333',
  digest:plan.manifestDigest,versionCode:42,status:'RESERVED_TEST_ONLY',
  testOnly:true,dispatchAllowed:false};
 const consumption={id:'44444444-4444-4444-8444-444444444444',
  claimId:'55555555-5555-4555-8555-555555555555',
  reservationId:reservation.id,workerId:'TEST_WORKER_CI_01',
  manifestDigest:plan.manifestDigest,versionCode:42,
  status:'CONSUMED_TEST_NO_EXECUTION',testOnly:true,
  dispatchAllowed:false,executionStarted:false,artifactProduced:false};
 const checkout={testOnly:true,checkoutVerified:true,checkoutClean:true,
  dispatchAllowed:false,runnerAuthenticated:false,
  manifestDigest:plan.manifestDigest,sourceSha:m.sourceSha,
  lockDigest:m.lockDigest,appRole:role};
 const patchFiles=Object.fromEntries(['gradle','manifest','kotlin','splash']
  .map((n,i)=>[n,{sha256:String(i).repeat(64),bytes:60+i}]));
 const inventory={testOnly:true,dispatchAllowed:false,inventoryVerified:true,
  artifactProduced:false,reservationId:reservation.id,
  manifestDigest:plan.manifestDigest,verifiedFileCount:8,patchFiles};
 const verifiedExecutables=Object.fromEntries(['flutter','java','node','pnpm']
  .map((n,i)=>[n,{version:['3.47.0','17','22.20.0','10.15.0'][i],
   sha256:String(i).repeat(64)}]));
 const toolchain={testOnly:true,dispatchAllowed:false,
  executableChecksPassed:true,reportedVersionsMatched:true,runnerAuthenticated:false,
  manifestDigest:plan.manifestDigest,sourceSha:m.sourceSha,
  lockDigest:m.lockDigest,appRole:role,verifiedExecutables};
 const policy={publicKeyPem:publicKey.export({type:'spki',format:'pem'}),
  workerId:consumption.workerId,runId:'TEST_RUN_FIXTURE_01',
  imageDigest:'sha256:'+'f'.repeat(64),nonce:'e'.repeat(64)};
 const issuedAt=new Date(Date.now()-3000).toISOString();
 const expiresAt=new Date(Date.now()+50000).toISOString();
 const payload={schemaVersion:1,environment:'TEST',workerId:policy.workerId,
  runId:policy.runId,imageDigest:policy.imageDigest,
  distributionId:m.distributionId,reservationId:reservation.id,
  revisionId:reservation.revisionId,consumptionId:consumption.id,
  manifestDigest:plan.manifestDigest,appRole:role,sourceSha:m.sourceSha,
  lockDigest:m.lockDigest,versionCode:reservation.versionCode,
  nativeInventoryDigest:digest(patchFiles),
  toolchainReceiptDigest:digest(verifiedExecutables),
  nonce:policy.nonce,issuedAt,expiresAt};
 const signPayload=p=>({payload:p,signature:sign(null,testAndroidRunnerSignedBytes(p),privateKey).toString('base64url')});
 return {plan,reservation,consumption,checkout,inventory,toolchain,policy,
  assertion:signPayload(payload),signPayload};
}
function verify(x){return verifyTestAndroidRunnerEvidence(x.plan,x.reservation,x.consumption,
 x.checkout,x.inventory,x.toolchain,x.assertion,x.policy);}
for(const role of ['RESIDENT','GUARD'])test('V5.5.13 accepts scoped Ed25519 '+role+' TEST runner proof, not dispatch',()=>{
 const x=fixture(role),out=verify(x);
 assert.equal(out.workerSignatureVerified,true);
 assert.equal(out.nonceMatched,true);
 assert.equal(out.dispatchAllowed,false);
 assert.equal(out.runnerTransportAuthenticated,false);
 assert.equal(out.serverReplayBarrierVerified,false);
 assert.equal(out.artifactProduced,false);
 assert.equal(Object.isFrozen(out),true);
});
for(const [label,mutate] of [
 ['unsigned changed partner',x=>{x.assertion.payload.distributionId='99999999-9999-4999-8999-999999999999';}],
 ['signed foreign worker',x=>{x.assertion=x.signPayload({...x.assertion.payload,workerId:'TEST_WORKER_OTHER'});}],
 ['signed foreign image digest',x=>{x.assertion=x.signPayload({...x.assertion.payload,imageDigest:'sha256:'+'0'.repeat(64)});}],
 ['signed stale nonce',x=>{x.assertion=x.signPayload({...x.assertion.payload,nonce:'0'.repeat(64)});}],
 ['signed foreign run',x=>{x.assertion=x.signPayload({...x.assertion.payload,runId:'TEST_RUN_FOREIGN'});}],
 ['signed foreign consumption',x=>{x.assertion=x.signPayload({...x.assertion.payload,consumptionId:'77777777-7777-4777-8777-777777777777'});}],
 ['signed wrong version code',x=>{x.assertion=x.signPayload({...x.assertion.payload,versionCode:43});}],
 ['signed wrong toolchain',x=>{x.assertion=x.signPayload({...x.assertion.payload,toolchainReceiptDigest:'0'.repeat(64)});}],
 ['signed expired claim',x=>{x.assertion=x.signPayload({...x.assertion.payload,issuedAt:new Date(Date.now()-120000).toISOString(),expiresAt:new Date(Date.now()-1000).toISOString()});}],
 ['signed distant future',x=>{x.assertion=x.signPayload({...x.assertion.payload,issuedAt:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+65000).toISOString()});}],
 ['signed unknown field',x=>{x.assertion.payload.secret='unsafe';}],
 ['tampered signature',x=>{x.assertion.signature='A'.repeat(86);}],
 ['changed staged native bytes',x=>{x.inventory.patchFiles.gradle.bytes=999;}],
 ['changed verified toolchain bytes',x=>{x.toolchain.verifiedExecutables.node.sha256='a'.repeat(64);}],
 ['unconsumed worker claim',x=>{x.consumption.status='CLAIMED_TEST_NO_EXECUTION';}],
 ['fake consumed worker',x=>{x.consumption.workerId='TEST_WORKER_OTHER';}],
 ['attempted dispatch',x=>{x.plan.dispatchAllowed=true;}],
 ['forged transport authority',x=>{x.checkout.runnerAuthenticated=true;}],
 ['client-provided signing secret',x=>{x.policy.privateKey='forbidden';}]
])test('V5.5.13 fails closed on '+label,()=>{
 const x=fixture();mutate(x);assert.throws(()=>verify(x));
});
test('V5.5.13 rejects self-chosen worker public key despite a valid signature',()=>{
 const x=fixture(),other=generateKeyPairSync('ed25519');
 x.policy.publicKeyPem=other.publicKey.export({type:'spki',format:'pem'});
 assert.throws(()=>verify(x),/Untrusted/);
});
test('V5.5.13 blocks unapproved replay of an otherwise valid signed statement',()=>{
 const x=fixture();
 verify(x);
 x.policy.nonce='9'.repeat(64);
 assert.throws(()=>verify(x),/server-bound/);
});
