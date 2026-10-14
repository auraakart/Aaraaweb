import { createHash, createHmac, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildWorkerClaimService } from './partner-android-worker-claim.service';

const societyId=randomUUID(),partnerId=randomUUID(),proposalId=randomUUID(),reservationId=randomUUID();
const revisionId=randomUUID(),allocationId=randomUUID(),approvalId=randomUUID(),actorId=randomUUID();
const key='a'.repeat(64);
const manifest={schemaVersion:1,buildMode:'TEST',distributionId:proposalId,approvalId,partnerId,societyId,
 applicationId:'in.fixture.partner.resident',namespace:'in.fixture.partner.resident',appRole:'RESIDENT',
 label:'Partner Resident',sourceSha:'b'.repeat(40),configDigest:'c'.repeat(64),apiOrigin:'https://test.fixture.in',
 signingProfile:'TEST_SIGNER',signerFingerprint:'d'.repeat(64)};
const initial={schemaVersion:1,environment:'TEST',applicationId:manifest.applicationId,
 namespace:manifest.namespace,appRole:manifest.appRole,label:manifest.label,
 sourceSha:manifest.sourceSha,configDigest:manifest.configDigest,
 apiOrigin:manifest.apiOrigin,signingProfile:manifest.signingProfile};
const hash=(v:unknown)=>createHash('sha256').update(canonicalLicenseJson(v)).digest('hex');
const principal={userId:actorId,societyId,roles:[AppRole.SUPER_ADMIN]};
const input={grantId:randomUUID(),allocationId,expectedGrantVersion:1,expectedOwnershipVersion:1,
 idempotencyKey:randomUUID(),revisionId,expectedDigest:hash(manifest),versionCode:4,
 workerId:'TEST_WORKER_CI_01',nonce:'f'.repeat(64)};
function signed(v:typeof input & {issuedAt?:string;expiresAt?:string}) {
 const issuedAt=v.issuedAt??new Date().toISOString();
 const expiresAt=v.expiresAt??new Date(Date.now()+80000).toISOString();
 const message='aaraagate:v5.5.7:test-claim:v1\n'+canonicalLicenseJson({
  societyId,proposalId,reservationId,actorId,grantId:v.grantId,
  allocationId:v.allocationId,expectedGrantVersion:v.expectedGrantVersion,
  expectedOwnershipVersion:v.expectedOwnershipVersion,revisionId:v.revisionId,
  manifestDigest:v.expectedDigest,versionCode:v.versionCode,workerId:v.workerId,
  nonce:v.nonce,issuedAt,expiresAt
 });
 return {...v,issuedAt,expiresAt,
  signature:createHmac('sha256',Buffer.from(key,'hex')).update(message).digest('hex')};
}
function fixture(){
 vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_HMAC_KEY',key);
 const p={id:proposalId,allocationId,digest:hash(initial),manifest:initial,
  approval:{id:approvalId,revocation:null as unknown}};
 const r={id:revisionId,digest:hash(manifest),manifest,approval:{id:randomUUID()} as unknown};
 const receipt={id:reservationId,revisionId,digest:r.digest,versionCode:4};
 const tx={
  partnerDistributionProposal:{findFirst:vi.fn().mockResolvedValue(p)},
  partnerAndroidBuildRevision:{findFirst:vi.fn().mockResolvedValue(r)},
  partnerAndroidBuildReservation:{findFirst:vi.fn().mockResolvedValue(receipt)},
  partnerAndroidBuildWorkerClaim:{create:vi.fn().mockResolvedValue({id:randomUUID()})}
 };
 const scope={allocationId,partnerId,approvalId,maximumDistributions:1,legacy:{}};
 const run=vi.fn(async(_p:unknown,_s:string,_i:unknown,
  cb:(t:typeof tx,s:typeof scope)=>unknown)=>cb(tx,scope));
 const checkpoint=vi.fn().mockResolvedValue({});
 return {p,r,receipt,tx,run,checkpoint,service:new PartnerAndroidBuildWorkerClaimService(
  {withActiveAllocation:run} as never,{checkpoint} as never)};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.5.7 TEST Android single-use worker claim',()=>{
 it('creates non-executing receipt bound to HMAC and live reservation',async()=>{
  const f=fixture(),v=await f.service.claim(principal,societyId,proposalId,reservationId,signed(input));
  expect(v).toMatchObject({status:'CLAIMED_TEST_NO_EXECUTION',testOnly:true,
   dispatchAllowed:false,executionStarted:false,artifactProduced:false,versionCode:4});
  expect(f.checkpoint).toHaveBeenCalledOnce();
  expect(f.checkpoint.mock.calls[0][4]).toMatchObject({stage:'BEFORE_DISPATCH'});
  expect(f.tx.partnerAndroidBuildWorkerClaim.create).toHaveBeenCalledOnce();
  const data=f.tx.partnerAndroidBuildWorkerClaim.create.mock.calls[0][0].data;
  expect(data.assertionDigest).not.toBe(signed(input).signature);
  expect(data.nonceDigest).not.toBe(input.nonce);
 });
 it('fails closed without provisioned worker secret',async()=>{
  const f=fixture();vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_HMAC_KEY','');
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,signed(input)))
   .rejects.toThrow(/not configured/);
  expect(f.checkpoint).not.toHaveBeenCalled();
 });
 it('rejects tampered worker, version, signature, principal or reservation',async()=>{
  const f=fixture(),v=signed(input);
  for(const change of [{...v,workerId:'TEST_WORKER_OTHER'}, {...v,versionCode:6},
    {...v,signature:'0'.repeat(64)}])
   await expect(f.service.claim(principal,societyId,proposalId,reservationId,change))
    .rejects.toThrow(/Untrusted/);
  await expect(f.service.claim({...principal,userId:randomUUID()},societyId,proposalId,reservationId,v))
   .rejects.toThrow(/Untrusted/);
  await expect(f.service.claim(principal,societyId,proposalId,randomUUID(),v))
   .rejects.toThrow(/Untrusted/);
  expect(f.checkpoint).not.toHaveBeenCalled();
 });
 it('rejects expired claims, wrong worker name and invalid inputs',async()=>{
  const f=fixture(),past=new Date(Date.now()-50000).toISOString();
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,
   signed({...input,issuedAt:past,expiresAt:new Date(Date.now()+5000).toISOString()})))
   .rejects.toThrow(/Expired/);
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,
   signed({...input,workerId:'WRONG'}))).rejects.toThrow(/Invalid/);
  expect(f.checkpoint).not.toHaveBeenCalled();
 });
 it('enforces licensing checkpoint and fresh transaction checks',async()=>{
  const f=fixture(),v=signed(input);
  f.checkpoint.mockRejectedValue(new Error('Consent withdrawn'));
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,v))
   .rejects.toThrow(/withdrawn/i);
  expect(f.tx.partnerAndroidBuildWorkerClaim.create).not.toHaveBeenCalled();
  f.checkpoint.mockResolvedValue({});
  f.p.approval.revocation={id:randomUUID()};
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,v))
   .rejects.toThrow(/approval/);
  f.p.approval.revocation=null;f.r.approval=null;
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,v))
   .rejects.toThrow(/revision/);
 });
 it('rejects version mismatch and foreign identity',async()=>{
  const f=fixture(),v=signed(input);
  f.receipt.versionCode=7;
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,v))
   .rejects.toThrow(/version/);
  f.receipt.versionCode=4;
  f.r.manifest={...manifest,partnerId:randomUUID()};
  f.r.digest=hash(f.r.manifest);f.receipt.digest=f.r.digest;
  const changed=signed({...input,expectedDigest:f.r.digest});
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,changed))
   .rejects.toThrow(/identity/);
  expect(f.tx.partnerAndroidBuildWorkerClaim.create).not.toHaveBeenCalled();
 });
 it('maps unique reservation conflict to replay denial',async()=>{
  const f=fixture();
  f.tx.partnerAndroidBuildWorkerClaim.create.mockRejectedValue(
   new Prisma.PrismaClientKnownRequestError('duplicate',{code:'P2002',clientVersion:'6.0'}));
  await expect(f.service.claim(principal,societyId,proposalId,reservationId,signed(input)))
   .rejects.toThrow(/already has a worker claim/);
 });
});
