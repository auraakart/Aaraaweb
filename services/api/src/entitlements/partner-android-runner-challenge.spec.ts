import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidRunnerChallengeService } from './partner-android-runner-challenge.service';
import { createHash } from 'node:crypto';

const hash=(v:unknown)=>createHash('sha256').update(canonicalLicenseJson(v)).digest('hex');
const societyId=randomUUID(),proposalId=randomUUID(),reservationId=randomUUID(),
 consumptionId=randomUUID(),claimId=randomUUID(),revisionId=randomUUID(),
 partnerId=randomUUID(),allocationId=randomUUID(),actorId=randomUUID();
const workerId='TEST_WORKER_CI_01',imageDigest='sha256:'+'a'.repeat(64);
const original={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.partner.resident',
 namespace:'in.fixture.partner.resident',appRole:'RESIDENT',label:'Fixture Resident',
 sourceSha:'c'.repeat(40),configDigest:'d'.repeat(64),
 apiOrigin:'https://test.fixture.in',signingProfile:'TEST_CI_ONLY'};
const m={...original,buildMode:'TEST',distributionId:proposalId,partnerId,societyId,
 lockDigest:'e'.repeat(64)};
const principal={userId:actorId,societyId,roles:[AppRole.SUPER_ADMIN]};
const input={allocationId,grantId:randomUUID(),expectedGrantVersion:1,
 expectedOwnershipVersion:1,idempotencyKey:randomUUID(),revisionId,
 expectedDigest:hash(m),versionCode:42,workerId};
function fixture(){
 vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_ID',workerId);
 vi.stubEnv('AARAGATE_TEST_ANDROID_RUNNER_IMAGE_SHA256',imageDigest);
 const proposal={id:proposalId,allocationId,manifest:original,
  digest:hash(original),approval:{id:randomUUID(),revocation:null as unknown}};
 const revision={id:revisionId,manifest:m,digest:hash(m),
  approval:{id:randomUUID()}};
 const receipt={id:reservationId,proposalId,revisionId,digest:revision.digest,
  versionCode:42,proposal,revision};
 const claim={id:claimId,actorId,workerId,
  expiresAt:new Date(Date.now()+90000),reservation:receipt};
 const consumption={id:consumptionId,actorId,workerId,manifestDigest:hash(m),
  versionCode:42,sourceSha:m.sourceSha,lockDigest:m.lockDigest,claim};
 const tx={
  partnerAndroidBuildWorkerConsumption:{findFirst:vi.fn().mockResolvedValue(consumption)},
  partnerAndroidBuildRevision:{findFirst:vi.fn().mockResolvedValue({id:revisionId})},
  partnerAndroidRunnerChallenge:{create:vi.fn().mockImplementation(async()=>({id:randomUUID(),runId:'TEST_RUN_FIXTURE'}))}
 };
 const scope={allocationId,partnerId};
 const active=vi.fn(async(_p:unknown,_s:string,_i:unknown,
  callback:(t:typeof tx,s:typeof scope)=>unknown)=>callback(tx,scope));
 const checkpoint=vi.fn().mockResolvedValue({checkpoint:'CURRENT_TEST_AUTHORITY_ONLY'});
 const service=new PartnerAndroidRunnerChallengeService(
  {withActiveAllocation:active} as never,{checkpoint} as never);
 return {service,tx,scope,active,checkpoint,claim,consumption,proposal,revision,receipt};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.5.14 append-only non-dispatchable TEST runner challenge',()=>{
 it('mints fresh random nonce, persists digest once, binds consumed TEST authority',async()=>{
  const f=fixture();
  const first=await f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input);
  expect(first).toMatchObject({status:'ISSUED_TEST_NO_EXECUTION',testOnly:true,
   dispatchAllowed:false,artifactProduced:false,runnerAuthenticated:false,
   imageDigest,requiresSignedWorkerEvidence:true});
  expect(first.nonce).toMatch(/^[0-9a-f]{64}$/);
  expect(first.runId).toBe('TEST_RUN_FIXTURE');
  const stored=f.tx.partnerAndroidRunnerChallenge.create.mock.calls[0][0].data;
  expect(stored.nonceDigest).toBe(createHash('sha256').update(first.nonce).digest('hex'));
  expect(stored.nonceDigest).not.toBe(first.nonce);
  expect(stored.consumptionId).toBe(consumptionId);
  expect(stored.imageDigest).toBe(imageDigest);
  expect(stored.expiresAt.getTime()-stored.issuedAt.getTime()).toBe(60000);
  expect(f.checkpoint.mock.calls[0][4]).toMatchObject({stage:'BEFORE_DISPATCH'});
 });
 it('refuses unconfigured worker identity or unpinned image before touching DB',async()=>{
  const f=fixture();
  vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_ID','TEST_WORKER_FOREIGN');
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/not configured/);
  vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_ID',workerId);
  vi.stubEnv('AARAGATE_TEST_ANDROID_RUNNER_IMAGE_SHA256','latest');
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/not configured/);
  expect(f.checkpoint).not.toHaveBeenCalled();
 });
 it('rejects consumed record forged worker, actor or reservation',async()=>{
  const f=fixture();
  f.consumption.actorId=randomUUID();
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/consumed/);
  f.consumption.actorId=actorId;f.claim.workerId='TEST_WORKER_OTHER';
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/claim/);
  f.claim.workerId=workerId;f.receipt.versionCode=41;
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/version/);
  expect(f.tx.partnerAndroidRunnerChallenge.create).not.toHaveBeenCalled();
 });
 it('rejects revoked distribution, expired claim and withdrawn allocation',async()=>{
  const f=fixture();
  f.proposal.approval.revocation={id:randomUUID()};
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/distribution/);
  f.proposal.approval.revocation=null;
  f.claim.expiresAt=new Date(Date.now()-1000);
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/claim/);
  f.checkpoint.mockRejectedValue(new Error('license withdrawn'));
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow(/withdrawn/);
 });
 it('fails closed on invalid references, replay conflicts and unknown worker',async()=>{
  const f=fixture();
  await expect(f.service.issue(principal,societyId,proposalId,'bad',consumptionId,input)).rejects.toThrow(/Invalid/);
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,
   {...input,workerId:'UNTRUSTED'})).rejects.toThrow(/Invalid/);
  const error=new Error('unique') as Error&{code:string};error.code='P2002';
  // The native DB UNIQUE(consumptionId,runId,nonceDigest) remains authoritative;
  // these mocked tests only exercise service boundaries.
  f.tx.partnerAndroidRunnerChallenge.create.mockRejectedValue(error);
  await expect(f.service.issue(principal,societyId,proposalId,reservationId,consumptionId,input)).rejects.toThrow();
 });
});
