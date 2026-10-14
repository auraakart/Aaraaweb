import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidRunnerEvidenceAcceptanceService } from './partner-android-runner-evidence-acceptance.service';

const societyId=randomUUID(),proposalId=randomUUID(),reservationId=randomUUID(),
 consumptionId=randomUUID(),claimId=randomUUID(),challengeId=randomUUID(),
 revisionId=randomUUID(),allocationId=randomUUID(),partnerId=randomUUID(),actorId=randomUUID();
const workerId='TEST_WORKER_CI_01',runId='TEST_RUN_FIXTURE_01',imageDigest='sha256:'+'a'.repeat(64);
const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
const digest=(x:unknown)=>sha(canonicalLicenseJson(x));
function canonical(x:unknown):string{
 if(x===null||typeof x!=='object')return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical((x as Record<string,unknown>)[k])).join(',')+'}';
}
const initial={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.partner.resident',
 namespace:'in.fixture.partner.resident',appRole:'RESIDENT',label:'Fixture Resident',
 sourceSha:'c'.repeat(40),configDigest:'d'.repeat(64),
 apiOrigin:'https://test.fixture.in',signingProfile:'TEST_CI_ONLY'};
const revisionManifest={...initial,buildMode:'TEST',distributionId:proposalId,
 partnerId,societyId,lockDigest:'e'.repeat(64)};
const principal={userId:actorId,societyId,roles:[AppRole.SUPER_ADMIN]};
function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_ED25519_PUBLIC_KEY_PEM',
  publicKey.export({type:'spki',format:'pem'}).toString());
 vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_ID',workerId);
 vi.stubEnv('AARAGATE_TEST_ANDROID_RUNNER_IMAGE_SHA256',imageDigest);
 const nonce='f'.repeat(64),manifestDigest=digest(revisionManifest);
 const issuedAt=new Date(Date.now()-1500),expiresAt=new Date(Date.now()+45000);
 const statement={schemaVersion:1,environment:'TEST',workerId,runId,imageDigest,
  distributionId:proposalId,reservationId,revisionId,consumptionId,
  manifestDigest,appRole:'RESIDENT',sourceSha:revisionManifest.sourceSha,
  lockDigest:revisionManifest.lockDigest,versionCode:42,
  nativeInventoryDigest:'7'.repeat(64),toolchainReceiptDigest:'8'.repeat(64),
  nonce,issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString()};
 const signed=(p:typeof statement)=>sign(null,Buffer.from(
  'aaraagate:v5.5.13:runner-evidence:v1\n'+canonical(p)),privateKey).toString('base64url');
 const input={allocationId,grantId:randomUUID(),expectedGrantVersion:1,
  expectedOwnershipVersion:1,idempotencyKey:randomUUID(),revisionId,
  expectedDigest:manifestDigest,versionCode:42,workerId,statement,signature:signed(statement)};
 const proposal={id:proposalId,allocationId,manifest:initial,digest:digest(initial),
  approval:{id:randomUUID(),revocation:null as unknown}};
 const revision={id:revisionId,manifest:revisionManifest,digest:manifestDigest,
  approval:{id:randomUUID()}};
 const reservation={id:reservationId,proposalId,revisionId,
  versionCode:42,digest:manifestDigest,proposal,revision};
 const claim={id:claimId,actorId,workerId,
  expiresAt:new Date(Date.now()+55000),reservation};
 const consumption={id:consumptionId,actorId,workerId,
  versionCode:42,manifestDigest,
  sourceSha:revisionManifest.sourceSha,lockDigest:revisionManifest.lockDigest,claim};
 const challenge={id:challengeId,consumptionId,actorId,workerId,runId,imageDigest,
  nonceDigest:sha(nonce),manifestDigest,versionCode:42,
  issuedAt:new Date(Date.now()-4000),expiresAt:new Date(Date.now()+59000),consumption};
 const tx={
  partnerAndroidRunnerChallenge:{findFirst:vi.fn().mockResolvedValue(challenge)},
  partnerAndroidBuildRevision:{findFirst:vi.fn().mockResolvedValue({id:revisionId})},
  partnerAndroidRunnerEvidenceAcceptance:{create:vi.fn().mockResolvedValue({id:randomUUID()})}
 };
 const scope={allocationId,partnerId};
 const active=vi.fn(async(_p:unknown,_s:string,_i:unknown,
  cb:(t:typeof tx,s:typeof scope)=>unknown)=>cb(tx,scope));
 const checkpoint=vi.fn().mockResolvedValue({checkpoint:'CURRENT_TEST_AUTHORITY_ONLY'});
 const service=new PartnerAndroidRunnerEvidenceAcceptanceService(
  {withActiveAllocation:active} as never,{checkpoint} as never);
 const accept=(req:typeof input=input,p=principal)=>
  service.accept(p,societyId,proposalId,reservationId,consumptionId,challengeId,req);
 return {input,signed,statement,accept,tx,active,checkpoint,challenge,consumption,claim,
  reservation,proposal,revision};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.5.15 single-use TEST signed worker evidence acceptance',()=>{
 it('accepts a valid Ed25519 worker response only as durable non-execution evidence',async()=>{
  const f=fixture(),result=await f.accept();
  expect(result).toMatchObject({status:'SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION',
   serverReplayBarrierVerified:true,workerSignatureVerified:true,
   runnerTransportAuthenticated:false,runtimeImageAttested:false,
   flutterSdkTreeVerified:false,dispatchAllowed:false,artifactProduced:false,
   archiveVerified:false,testOnly:true});
  expect(f.checkpoint).toHaveBeenCalledOnce();
  expect(f.checkpoint.mock.calls[0][4]).toMatchObject({stage:'BEFORE_DISPATCH'});
  expect(f.active).toHaveBeenCalledOnce();
  const stored=f.tx.partnerAndroidRunnerEvidenceAcceptance.create.mock.calls[0][0].data;
  expect(stored).toMatchObject({challengeId,actorId,workerId,runId,imageDigest,
   manifestDigest:f.input.expectedDigest,sourceSha:f.statement.sourceSha,
   lockDigest:f.statement.lockDigest,versionCode:42,
   nonceDigest:sha(f.statement.nonce)});
  expect(stored.nonceDigest).not.toBe(f.statement.nonce);
  expect(stored.signatureDigest).not.toBe(f.input.signature);
 });
 it('rejects unsigned mutation, wrong source, forged statement and other worker key before checkpoint',async()=>{
  const f=fixture();
  for(const p of [
   {...f.statement,nonce:'0'.repeat(64)},
   {...f.statement,imageDigest:'sha256:'+'0'.repeat(64)},
   {...f.statement,sourceSha:'f'.repeat(40)},
   {...f.statement,nativeInventoryDigest:'a'.repeat(64)}
  ])await expect(f.accept({...f.input,statement:p})).rejects.toThrow(/untrusted|identity|policy/i);
  const other=generateKeyPairSync('ed25519');
  const wrong=sign(null,Buffer.from('aaraagate:v5.5.13:runner-evidence:v1\n'+canonical(f.statement)),other.privateKey).toString('base64url');
  await expect(f.accept({...f.input,signature:wrong})).rejects.toThrow(/untrusted/i);
  expect(f.checkpoint).not.toHaveBeenCalled();
 });
 it('denies correct signatures with foreign challenge, stale worker, nonce or revocation',async()=>{
  const f=fixture();
  f.challenge.nonceDigest='0'.repeat(64);
  await expect(f.accept()).rejects.toThrow(/challenge/);
  f.challenge.nonceDigest=sha(f.statement.nonce);
  f.challenge.runId='TEST_RUN_FOREIGN';
  await expect(f.accept()).rejects.toThrow(/challenge/);
  f.challenge.runId=runId;
  f.consumption.workerId='TEST_WORKER_FOREIGN';
  await expect(f.accept()).rejects.toThrow(/Consumed/);
  f.consumption.workerId=workerId;
  f.proposal.approval.revocation={id:randomUUID()};
  await expect(f.accept()).rejects.toThrow(/allocation/);
  expect(f.tx.partnerAndroidRunnerEvidenceAcceptance.create).not.toHaveBeenCalled();
 });
 it('rejects expired challenge and withdrawn commercial checkpoint',async()=>{
  const f=fixture();
  f.challenge.expiresAt=new Date(Date.now()-2000);
  await expect(f.accept()).rejects.toThrow(/expired/);
  f.challenge.expiresAt=new Date(Date.now()+59000);
  f.checkpoint.mockRejectedValue(new Error('approval withdrawn'));
  await expect(f.accept()).rejects.toThrow(/withdrawn/);
  expect(f.active).not.toHaveBeenCalled();
 });
 it('rejects missing trusted key, invalid signed shape and transport spoofing',async()=>{
  const f=fixture();
  vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_ED25519_PUBLIC_KEY_PEM','');
  await expect(f.accept()).rejects.toThrow(/not configured/);
  const q=fixture();
  await expect(q.accept({...q.input,statement:{...q.statement,unexpected:'x'} as never}))
   .rejects.toThrow(/Invalid/);
  await expect(q.accept({...q.input,signature:'x'.repeat(86)})).rejects.toThrow();
  expect(q.tx.partnerAndroidRunnerEvidenceAcceptance.create).not.toHaveBeenCalled();
 });
 it('uses append-only unique database insert; duplicate acceptance never becomes dispatch authorization',async()=>{
  const f=fixture(),duplicate=new Error('duplicate') as Error&{code:string};
  duplicate.code='P2002';
  // Unit test verifies fail-closed; DB UNIQUE(challengeId/runId/nonceDigest/signatureDigest)
  // is responsible for serializing concurrent acceptance requests.
  f.tx.partnerAndroidRunnerEvidenceAcceptance.create.mockRejectedValue(duplicate);
  await expect(f.accept()).rejects.toThrow();
  expect(f.tx.partnerAndroidRunnerEvidenceAcceptance.create).toHaveBeenCalledOnce();
 });
});
