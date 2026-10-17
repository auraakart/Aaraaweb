import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadOnlyTestRuntimeAuditReceipt as create,
 verifyReadOnlyTestRuntimeAuditReceipt as verify}
 from './v5.5.48-readonly-runtime-audit-receipt.mjs';

const SHA='a'.repeat(40),OCI='sha256:'+'b'.repeat(64),SPKI='c'.repeat(64);
const u=n=>n.repeat(8)+'-'+n.repeat(4)+'-4'+n.repeat(3)+'-8'+n.repeat(3)+'-'+n.repeat(12);
const pins={sourceSha:SHA,imageDigest:OCI,serverSpkiSha256:SPKI};
const sample=()=>Object.freeze({
 schemaVersion:1,environment:'TEST',testOnly:true,
 sourceSha:SHA,imageDigest:OCI,serverSpkiSha256:SPKI,
 workerId:'TEST_WORKER_4848',runId:'TEST_RUN_4848',
 challengeId:u('1'),acceptanceId:u('2'),
 tls13PinnedPeerVerified:true,clientTlsCertificateConfigured:true,
 freshTransportNonceSignatureVerified:true,
 independentRuntimeClaimSignaturesVerified:true,
 transportNonceDigest:'d'.repeat(64),runtimeEnvelopeDigest:'e'.repeat(64),
 transportSignatureDigest:'f'.repeat(64),
 verifiedAt:new Date().toISOString(),
 independentlyProvisionedWorkerVerified:false,remoteProcessMeasured:false,
 runtimeImageAttested:false,immutableMountVerified:false,
 singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
 artifactProduced:false,dispatchAllowed:false
});
const safe=key=>{const probe={...sample()};probe[key]=true;return probe;};
test('V5.5.48 exports only bounded hash-linked TEST claim metadata; never authority',()=>{
 const record=create(sample(),pins);
 assert.ok(Object.isFrozen(record));
 assert.match(record.receiptSha256,/^[0-9a-f]{64}$/);
 assert.equal(record.kind,'UNSIGNED_LOCAL_READ_ONLY_PROBE_RECEIPT');
 assert.equal(record.independentExternalAcceptanceVerified,false);
 for(const field of ['buildExecutionAuthorized','singleUseChallengeConsumed',
  'dispatchAllowed','artifactProduced','remoteProcessMeasured','runtimeImageAttested'])
   assert.equal(record[field],false,field);
 assert.equal(record.clientPrivateKeyPem,undefined);
 assert.equal(record.transportSignatureDigest,'f'.repeat(64));
 assert.equal(record.transportNonceDigest,'d'.repeat(64));
 assert.equal(record.sourceSha,SHA);
 assert.deepEqual(verify(JSON.parse(JSON.stringify(record)),pins),{
  localReceiptIntegrityVerified:true,independentExternalAcceptanceVerified:false,
  buildExecutionAuthorized:false,partnerArtifactApproved:false
 });
});
test('V5.5.48 fingerprints separate probes without releasing raw nonces',()=>{
 const before=create(sample(),pins);
 const change={...sample(),transportNonceDigest:'0'.repeat(64)};
 const after=create(change,pins);
 assert.notEqual(before.receiptSha256,after.receiptSha256);
 assert.equal('requestNonce' in before,false);
 assert.equal('privateKey' in before,false);
});
for(const [name,change] of [
 ['foreign source',p=>p.sourceSha='0'.repeat(40)],
 ['wrong image',p=>p.imageDigest='sha256:'+'0'.repeat(64)],
 ['different remote peer',p=>p.serverSpkiSha256='0'.repeat(64)],
 ['unsigned extra authority',p=>p.partnerDistributionApproved=true],
 ['unsigned credential',p=>p.clientKeyPem='sensitive'],
 ['missing digest',p=>delete p.transportSignatureDigest],
 ['malformed digest',p=>p.runtimeEnvelopeDigest='bad'],
 ['missing TLS validation',p=>p.tls13PinnedPeerVerified=false],
 ['missing client certificate',p=>p.clientTlsCertificateConfigured=false],
 ['unsigned runtime claim',p=>p.independentRuntimeClaimSignaturesVerified=false],
 ['unverified nonce',p=>p.freshTransportNonceSignatureVerified=false],
 ['false remote measurement',p=>p.remoteProcessMeasured=true],
 ['false independent worker',p=>p.independentlyProvisionedWorkerVerified=true],
 ['false image attestation',p=>p.runtimeImageAttested=true],
 ['false immutable mounts',p=>p.immutableMountVerified=true],
 ['false consumed challenge',p=>p.singleUseChallengeConsumed=true],
 ['false build authority',p=>p.buildExecutionAuthorized=true],
 ['false artifact produced',p=>p.artifactProduced=true],
 ['false dispatch authority',p=>p.dispatchAllowed=true],
 ['production environment',p=>p.environment='PROD'],
 ['invalid clock',p=>p.verifiedAt='not-a-date'],
 ['foreign challenge',p=>p.challengeId='0'],
])test('V5.5.48 rejects raw probe '+name,()=>{
 const p={...sample()};change(p);
 assert.throws(()=>create(p,pins),/receipt is invalid/);
});
test('V5.5.48 rejects an expired probe, even with otherwise pinned claims',()=>{
 const probe={...sample(),verifiedAt:new Date(Date.now()-360000).toISOString()};
 assert.throws(()=>create(probe,pins),/receipt is invalid/);
});
test('V5.5.48 rejects non-frozen forged metadata missing mandatory field',()=>{
 const p={...sample()};delete p.testOnly;
 assert.throws(()=>create(p,pins),/receipt is invalid/);
});
for(const [name,change] of [
 ['tampered nonce digest',r=>r.transportNonceDigest='0'.repeat(64)],
 ['tampered timestamp',r=>r.verifiedAt='2020-01-01T00:00:00.000Z'],
 ['claimed external acceptance',r=>r.independentExternalAcceptanceVerified=true],
 ['claimed build eligibility',r=>r.buildExecutionAuthorized=true],
 ['replayed wrong source',r=>r.sourceSha='0'.repeat(40)],
 ['replayed wrong worker',r=>r.workerId='FOREIGN_WORKER'],
 ['untrusted new field',r=>r.attestation=true],
 ['removed field',r=>delete r.receiptSha256],
])test('V5.5.48 rejects manually altered audit receipt: '+name,()=>{
 const value={...create(sample(),pins)};
 change(value);
 assert.throws(()=>verify(value,pins),/receipt is invalid/);
});
test('V5.5.48 rejects unapproved changed reference pin',()=>{
 const rec=create(sample(),pins);
 assert.throws(()=>verify(rec,{...pins,sourceSha:'0'.repeat(40)}),/receipt is invalid/);
});
