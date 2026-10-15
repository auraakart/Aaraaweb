import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {testImageAttestationPAE,verifyIndependentTestOciAttestation} from '../packages/config/src/android-test-oci-provenance.mjs';
const canon=(v)=>v&&typeof v==='object'&&!Array.isArray(v)?
 '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v);
const pem=k=>k.export({type:'spki',format:'pem'}).toString();
const kid=k=>createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex');
function fixture(){
 const attestor=generateKeyPairSync('ed25519'),worker=generateKeyPairSync('ed25519');
 const policy={imageDigest:'sha256:'+'a'.repeat(64),sourceSha:'b'.repeat(40),
  workerId:'TEST_WORKER_CI_01',runId:'TEST_RUN_CI_01',builderId:'TEST_ATTESTOR_QA_01',nonce:'c'.repeat(64),
  attestorPublicKeyPem:pem(attestor.publicKey),workerPublicKeyPem:pem(worker.publicKey)};
 const statement={schemaVersion:1,environment:'TEST',subject:'OCI_TEST_WORKER_IMAGE',
  imageDigest:policy.imageDigest,sourceSha:policy.sourceSha,workerId:policy.workerId,
  runId:policy.runId,builderId:policy.builderId,nonce:policy.nonce,
  issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+50000).toISOString()};
 const seal=(stmt=statement,key=attestor.privateKey)=>{
  const bytes=Buffer.from(canon(stmt));
  const sig=sign(null,testImageAttestationPAE('application/vnd.aaraagate.test-oci-image-claim+json',bytes),key);
  return {payloadType:'application/vnd.aaraagate.test-oci-image-claim+json',payload:bytes.toString('base64url'),
   signatures:[{keyid:kid(attestor.publicKey),sig:sig.toString('base64url')}]};
 };
 return {attestor,worker,policy,statement,seal};
}
test('V5.5.36 independent attestor signs pinned source/OCI digest, no build authority',()=>{
 const f=fixture(),v=verifyIndependentTestOciAttestation(f.seal(),f.policy);
 assert.equal(v.signatureVerified,true);
 assert.equal(v.independentKeySeparated,true);
 assert.equal(v.dispatchAllowed,false);
 assert.equal(v.runtimeImageAttested,false);
 assert.equal(v.actualOciImageBytesVerified,false);
 assert.equal(v.singleUseChallengeConsumed,false);
 assert.equal(Object.isFrozen(v),true);
});
for(const [name,change] of [
 ['unapproved OCI digest',f=>f.policy.imageDigest='sha256:'+'f'.repeat(64)],
 ['wrong source SHA',f=>f.policy.sourceSha='0'.repeat(40)],
 ['wrong worker',f=>f.policy.workerId='TEST_WORKER_FOREIGN'],
 ['wrong run',f=>f.policy.runId='TEST_RUN_FOREIGN'],
 ['wrong nonce',f=>f.policy.nonce='0'.repeat(64)],
 ['wrong attestor',f=>f.policy.attestorPublicKeyPem=pem(generateKeyPairSync('ed25519').publicKey)],
 ['same worker signing key',f=>f.policy.workerPublicKeyPem=f.policy.attestorPublicKeyPem],
 ['unknown policy secret',f=>f.policy.privateSigningKey='SHOULD_NOT_APPEAR'],
 ['expired',f=>f.statement.expiresAt=new Date(Date.now()-2000).toISOString()],
 ['too far future',f=>f.statement.issuedAt=new Date(Date.now()+70000).toISOString()],
 ['production assertion',f=>f.statement.environment='PRODUCTION'],
 ['foreign attestor',f=>f.statement.builderId='TEST_ATTESTOR_FOREIGN'],
 ['unknown statement field',f=>f.statement.testOnly=false]
])test('V5.5.36 rejects '+name,()=>{
 const f=fixture();change(f);
 assert.throws(()=>verifyIndependentTestOciAttestation(f.seal(),f.policy));
});
test('V5.5.36 denies forged claims, extra signatures, replay across pinned runs and malformed DSSE',()=>{
 const f=fixture();const good=f.seal(),forged=f.seal({...f.statement,imageDigest:'sha256:'+'0'.repeat(64)});
 assert.throws(()=>verifyIndependentTestOciAttestation(forged,f.policy),/differs/);
 assert.throws(()=>verifyIndependentTestOciAttestation({...good,signatures:[...good.signatures,...good.signatures]},f.policy));
 assert.throws(()=>verifyIndependentTestOciAttestation({...good,payloadType:'application/json'},f.policy));
 assert.throws(()=>verifyIndependentTestOciAttestation({...good,payload:good.payload.slice(0,-1)+'A'},f.policy));
 assert.throws(()=>verifyIndependentTestOciAttestation({...good,accessToken:'oops'},f.policy));
 const other=fixture();assert.throws(()=>verifyIndependentTestOciAttestation(good,other.policy));
});
