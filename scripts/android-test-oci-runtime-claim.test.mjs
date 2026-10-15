import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {testImageAttestationPAE} from '../packages/config/src/android-test-oci-provenance.mjs';
import {verifyPinnedTestOciRuntimeClaim} from '../packages/config/src/android-test-oci-runtime-claim.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const kid=k=>sha(k.export({type:'spki',format:'der'}));
const canon=v=>v&&typeof v==='object'&&!Array.isArray(v)?
 '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v);
const pub=k=>k.publicKey.export({type:'spki',format:'pem'}).toString();
const UUID=n=>n.repeat(8)+'-'+n.repeat(4)+'-4'+n.repeat(3)+'-8'+n.repeat(3)+'-'+n.repeat(12);
const IMAGE_TYPE='application/vnd.aaraagate.test-oci-image-claim+json';
const RUNTIME_TYPE='application/vnd.aaraagate.test-oci-runtime-process-claim+json';
function fixture(){
 const imageKey=generateKeyPairSync('ed25519'),workerKey=generateKeyPairSync('ed25519'),
  observerKey=generateKeyPairSync('ed25519');
 const imagePolicy={imageDigest:'sha256:'+'a'.repeat(64),sourceSha:'b'.repeat(40),
  workerId:'TEST_WORKER_CI_39',runId:'TEST_RUN_CI_39',builderId:'TEST_ATTESTOR_QA_39',
  nonce:'c'.repeat(64),attestorPublicKeyPem:pub(imageKey),workerPublicKeyPem:pub(workerKey)};
 const runtimePolicy={observerPublicKeyPem:pub(observerKey),nonce:imagePolicy.nonce,
  manifestDigest:'d'.repeat(64),acceptanceId:UUID('1'),challengeId:UUID('2'),
  containerId:'e'.repeat(64),mountNamespaceId:'mnt:[4026532001]',
  transportServerSpkiSha256:'f'.repeat(64)};
 const times={issuedAt:new Date(Date.now()-1500).toISOString(),
  expiresAt:new Date(Date.now()+40000).toISOString()};
 const imageClaim={schemaVersion:1,environment:'TEST',subject:'OCI_TEST_WORKER_IMAGE',
  imageDigest:imagePolicy.imageDigest,sourceSha:imagePolicy.sourceSha,
  workerId:imagePolicy.workerId,runId:imagePolicy.runId,builderId:imagePolicy.builderId,
  nonce:imagePolicy.nonce,...times};
 const runtimeClaim={schemaVersion:1,environment:'TEST',subject:'OCI_TEST_RUNTIME_PROCESS_CLAIM',
  imageDigest:imagePolicy.imageDigest,sourceSha:imagePolicy.sourceSha,
  workerId:imagePolicy.workerId,runId:imagePolicy.runId,nonce:imagePolicy.nonce,
  manifestDigest:runtimePolicy.manifestDigest,acceptanceId:runtimePolicy.acceptanceId,
  challengeId:runtimePolicy.challengeId,containerId:runtimePolicy.containerId,
  mountNamespaceId:runtimePolicy.mountNamespaceId,
  transportServerSpkiSha256:runtimePolicy.transportServerSpkiSha256,
  rootfsReadOnly:true,sourceMountReadOnly:true,...times};
 function envelope(typ,claim,keys){
  const bytes=Buffer.from(canon(claim));
  return {payloadType:typ,payload:bytes.toString('base64url'),signatures:keys.map(key=>({
   keyid:kid(key.publicKey),
   sig:sign(null,testImageAttestationPAE(typ,bytes),key.privateKey).toString('base64url')
  }))};
 }
 const imageEnvelope=envelope(IMAGE_TYPE,imageClaim,[imageKey]);
 const makeRuntime=(claim=runtimeClaim,keys=[observerKey,workerKey])=>
  envelope(RUNTIME_TYPE,claim,keys);
 const runtimeEnvelope=makeRuntime();
 const verify=(e=runtimeEnvelope,p=runtimePolicy,img=imageEnvelope,ip=imagePolicy)=>
  verifyPinnedTestOciRuntimeClaim(img,ip,e,p);
 return {verify,makeRuntime,runtimeClaim,runtimePolicy,imagePolicy,imageEnvelope,
  runtimeEnvelope,imageKey,workerKey,observerKey};
}
test('V5.5.39 verifies independently signed runtime process CLAIM, never authorizes execution',()=>{
 const f=fixture(),r=f.verify();
 assert.equal(r.runtimeClaimSignaturesVerified,true);
 assert.equal(r.independentObserverAndWorkerKeysVerified,true);
 assert.equal(r.nonceBoundClaimVerified,true);
 assert.equal(r.processAndMountClaimsConsistent,true);
 for(const field of ['runtimeImageAttested','registryDigestVerified','remoteProcessMeasured',
  'imageRunningOnAuthenticatedWorker','immutableMountVerified','runtimeTransportAuthenticated',
  'singleUseChallengeConsumed','buildExecutionAuthorized','artifactProduced','dispatchAllowed'])
  assert.equal(r[field],false,field);
 assert.ok(Object.isFrozen(r));
});
for(const [name,change] of [
 ['foreign image SHA',v=>v.imageDigest='sha256:'+'f'.repeat(64)],
 ['foreign source SHA',v=>v.sourceSha='9'.repeat(40)],
 ['foreign worker',v=>v.workerId='TEST_WORKER_FOREIGN'],
 ['wrong run',v=>v.runId='TEST_RUN_FOREIGN'],
 ['nonce replay',v=>v.nonce='0'.repeat(64)],
 ['manifest drift',v=>v.manifestDigest='0'.repeat(64)],
 ['acceptance replay',v=>v.acceptanceId=UUID('4')],
 ['challenge replay',v=>v.challengeId=UUID('5')],
 ['container replacement',v=>v.containerId='0'.repeat(64)],
 ['mount namespace replacement',v=>v.mountNamespaceId='mnt:[4026532002]'],
 ['transport peer replacement',v=>v.transportServerSpkiSha256='0'.repeat(64)],
 ['writable rootfs',v=>v.rootfsReadOnly=false],
 ['writable source mount',v=>v.sourceMountReadOnly=false],
 ['prod payload',v=>v.environment='PROD'],
 ['unsigned extra field',v=>v.dispatchAllowed=true],
 ['expired claim',v=>{v.issuedAt=new Date(Date.now()-90000).toISOString();v.expiresAt=new Date(Date.now()-60000).toISOString();}]
])test('V5.5.39 rejects signed foreign runtime '+name,()=>{
 const f=fixture();
 const mutated={...f.runtimeClaim};change(mutated);
 assert.throws(()=>f.verify(f.makeRuntime(mutated)));
});
test('V5.5.39 rejects substitution of attacker-signed observer',()=>{
 const f=fixture(),rogue=generateKeyPairSync('ed25519');
 assert.throws(()=>f.verify(f.makeRuntime(f.runtimeClaim,[rogue,f.workerKey])));
});
test('V5.5.39 rejects swapping ordered worker/observer signatures',()=>{
 const f=fixture();
 assert.throws(()=>f.verify({...f.runtimeEnvelope,signatures:f.runtimeEnvelope.signatures.slice().reverse()}));
});
test('V5.5.39 rejects invalid signature bytes',()=>{
 const f=fixture();
 assert.throws(()=>f.verify({...f.runtimeEnvelope,signatures:[
  {...f.runtimeEnvelope.signatures[0],sig:'A'.repeat(86)},f.runtimeEnvelope.signatures[1]
 ]}));
});
test('V5.5.39 rejects independent observer key that equals the worker key',()=>{
 const f=fixture();
 assert.throws(()=>f.verify(f.runtimeEnvelope,{...f.runtimePolicy,observerPublicKeyPem:pub(f.workerKey)}));
});
test('V5.5.39 rejects forged operator-pinned challenge',()=>{
 const f=fixture();
 assert.throws(()=>f.verify(f.runtimeEnvelope,{...f.runtimePolicy,nonce:'0'.repeat(64)}));
});
test('V5.5.39 rejects invalid independent IMAGE attestation',()=>{
 const f=fixture();
 assert.throws(()=>f.verify(f.runtimeEnvelope,f.runtimePolicy,f.imageEnvelope,{
  ...f.imagePolicy,sourceSha:'0'.repeat(40)
 }));
});
test('V5.5.39 rejects forged extra authority field in runtime policy',()=>{
 const f=fixture();
 assert.throws(()=>f.verify(f.runtimeEnvelope,{...f.runtimePolicy,dispatchAllowed:true}));
});
test('V5.5.39 rejects duplicate observer and worker signatures',()=>{
 const f=fixture();
 assert.throws(()=>f.verify({...f.runtimeEnvelope,signatures:[
  f.runtimeEnvelope.signatures[0],f.runtimeEnvelope.signatures[0]
 ]}));
});
test('V5.5.39 rejects malformed base64url signed statement',()=>{
 const f=fixture();
 assert.throws(()=>f.verify({...f.runtimeEnvelope,payload:f.runtimeEnvelope.payload+'='}));
});
