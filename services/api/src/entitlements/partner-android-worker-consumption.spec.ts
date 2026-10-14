import { createHash, createHmac, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildWorkerConsumptionService } from './partner-android-worker-consumption.service';

const societyId=randomUUID(),partnerId=randomUUID(),proposalId=randomUUID();
const reservationId=randomUUID(),claimId=randomUUID(),consumptionId=randomUUID();
const revisionId=randomUUID(),approvalId=randomUUID(),actorId=randomUUID(),allocationId=randomUUID();
const key='b'.repeat(64),sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const initial={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.partner.resident',
 namespace:'in.fixture.partner.resident',appRole:'RESIDENT',label:'Fixture Resident',
 sourceSha:'c'.repeat(40),configDigest:'d'.repeat(64),
 apiOrigin:'https://test.fixture.in',signingProfile:'TEST_CI_ONLY'};
const manifest={...initial,schemaVersion:1,buildMode:'TEST',distributionId:proposalId,approvalId,partnerId,societyId,
 sourceSha:initial.sourceSha,lockDigest:'e'.repeat(64),
 signerFingerprint:'f'.repeat(64)};
const hash=(v:unknown)=>sha(canonicalLicenseJson(v));
const principal={userId:actorId,societyId,roles:[AppRole.SUPER_ADMIN]};
const ctx={grantId:randomUUID(),allocationId,expectedGrantVersion:1,
 expectedOwnershipVersion:1,idempotencyKey:randomUUID(),revisionId,
 expectedDigest:hash(manifest),versionCode:5,
 workerId:'TEST_WORKER_CI_01',sourceSha:manifest.sourceSha,lockDigest:manifest.lockDigest,
 nonce:'0'.repeat(64)};
function signed(v:typeof ctx & {issuedAt?:string;expiresAt?:string}){
 const issuedAt=v.issuedAt??new Date().toISOString();
 const expiresAt=v.expiresAt??new Date(Date.now()+75000).toISOString();
 const message='aaraagate:v5.5.8:test-consume:v1\n'+canonicalLicenseJson({
  societyId,proposalId,reservationId,claimId,actorId,
  grantId:v.grantId,allocationId:v.allocationId,
  expectedGrantVersion:v.expectedGrantVersion,
  expectedOwnershipVersion:v.expectedOwnershipVersion,
  revisionId:v.revisionId,manifestDigest:v.expectedDigest,
  versionCode:v.versionCode,workerId:v.workerId,
  sourceSha:v.sourceSha,lockDigest:v.lockDigest,
  nonce:v.nonce,issuedAt,expiresAt
 });
 return {...v,issuedAt,expiresAt,signature:createHmac('sha256',Buffer.from(key,'hex')).update(message).digest('hex')};
}
function fixture(){
 vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_HMAC_KEY',key);
 const proposal={id:proposalId,allocationId,manifest:initial,digest:hash(initial),
  approval:{id:approvalId,revocation:null as unknown}};
 const revision={id:revisionId,manifest,digest:hash(manifest),approval:{id:randomUUID()} as unknown};
 const receipt={id:reservationId,proposalId,revisionId,digest:revision.digest,versionCode:5,
  proposal,revision};
 const claim={id:claimId,reservationId,actorId,workerId:ctx.workerId,
  manifestDigest:revision.digest,versionCode:5,expiresAt:new Date(Date.now()+60000),
  reservation:receipt};
 const used={id:consumptionId,claimId,actorId,workerId:ctx.workerId,
  manifestDigest:revision.digest,versionCode:5,claim};
 const tx={
  partnerAndroidBuildWorkerClaim:{findFirst:vi.fn().mockResolvedValue(claim)},
  partnerAndroidBuildRevision:{findFirst:vi.fn().mockResolvedValue({id:revisionId})},
  partnerAndroidBuildWorkerConsumption:{
   create:vi.fn().mockResolvedValue({id:consumptionId}),
   findFirst:vi.fn().mockResolvedValue(used)
  },
  partnerDistributionProposal:{findFirst:vi.fn().mockResolvedValue({id:proposalId})}
 };
 const scope={allocationId,partnerId,approvalId,maximumDistributions:1,legacy:{}};
 const run=vi.fn(async(_p:unknown,_s:string,_i:unknown,
  cb:(t:typeof tx,s:typeof scope)=>unknown)=>cb(tx,scope));
 const checkpoint=vi.fn().mockResolvedValue({checkpoint:'CURRENT_TEST_AUTHORITY_ONLY'});
 const service=new PartnerAndroidBuildWorkerConsumptionService(
  {withActiveAllocation:run} as never,{checkpoint} as never);
 return {service,tx,run,checkpoint,proposal,revision,receipt,claim,used};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.5.8 internal-only TEST worker consumption boundary',()=>{
 it('records immutable single-use consumption but never dispatches a build',async()=>{
  const f=fixture(),v=signed(ctx);
  const result=await f.service.consume(principal,societyId,proposalId,reservationId,claimId,v);
  expect(result).toMatchObject({id:consumptionId,claimId,reservationId,versionCode:5,
   status:'CONSUMED_TEST_NO_EXECUTION',testOnly:true,dispatchAllowed:false,
   executionStarted:false,artifactProduced:false,requiresFreshCompletionAuthority:true});
  expect(f.checkpoint).toHaveBeenCalledOnce();
  expect(f.checkpoint.mock.calls[0][4]).toMatchObject({stage:'BEFORE_DISPATCH',versionCode:5});
  const row=f.tx.partnerAndroidBuildWorkerConsumption.create.mock.calls[0][0].data;
  expect(row.nonceDigest).toBe(sha(ctx.nonce));
  expect(row.nonceDigest).not.toBe(ctx.nonce);
  expect(row.sourceSha).toBe(ctx.sourceSha);
  expect(row.lockDigest).toBe(ctx.lockDigest);
 });
 it('refuses absent worker key or tampered worker/version/actor/claim/reservation',async()=>{
  const f=fixture(),v=signed(ctx);
  vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_HMAC_KEY','');
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/not configured/);
  vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_HMAC_KEY',key);
  for(const changed of [{...v,workerId:'TEST_WORKER_OTHER'},
    {...v,versionCode:6},{...v,signature:'1'.repeat(64)},{...v,sourceSha:'2'.repeat(40)}])
   await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,changed))
    .rejects.toThrow(/Untrusted/);
  await expect(f.service.consume({...principal,userId:randomUUID()},societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/Untrusted/);
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,randomUUID(),v))
   .rejects.toThrow(/Untrusted/);
  await expect(f.service.consume(principal,societyId,proposalId,randomUUID(),claimId,v))
   .rejects.toThrow(/Untrusted/);
  expect(f.checkpoint).not.toHaveBeenCalled();
 });
 it('fails closed on expired claim and invalid or expired assertion',async()=>{
  const f=fixture(),v=signed(ctx);
  f.claim.expiresAt=new Date(Date.now()-1000);
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/expired/);
  f.claim.expiresAt=new Date(Date.now()+60000);
  const expired=signed({...ctx,issuedAt:new Date(Date.now()-60000).toISOString(),
   expiresAt:new Date(Date.now()+2000).toISOString()});
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,expired))
   .rejects.toThrow(/Expired/);
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,
   signed({...ctx,workerId:'OTHER'}))).rejects.toThrow(/Invalid/);
 });
 it('rejects withdrawn commercial authority, revoked initial review or superseded revision',async()=>{
  const f=fixture(),v=signed(ctx);
  f.checkpoint.mockRejectedValue(new Error('Consent withdrawn'));
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/withdrawn/);
  expect(f.run).not.toHaveBeenCalled();
  f.checkpoint.mockResolvedValue({});
  f.proposal.approval.revocation={id:randomUUID()};
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/approval changed/);
  f.proposal.approval.revocation=null;
  f.tx.partnerAndroidBuildRevision.findFirst.mockResolvedValue({id:randomUUID()});
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/revision or reservation/);
  expect(f.tx.partnerAndroidBuildWorkerConsumption.create).not.toHaveBeenCalled();
 });
 it('rejects foreign society, stale source/lock or changed worker context',async()=>{
  const f=fixture(),v=signed(ctx);
  f.receipt.proposal.allocationId=randomUUID();
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/approval changed/);
  f.receipt.proposal.allocationId=allocationId;
  f.claim.workerId='TEST_WORKER_FOREIGN';
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/claim is foreign/);
  f.claim.workerId=ctx.workerId;
  f.revision.manifest={...manifest,lockDigest:'3'.repeat(64)};
  f.revision.digest=hash(f.revision.manifest);
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,v))
   .rejects.toThrow(/revision or reservation/);
 });
 it('maps database unique-claim consumption into replay rejection',async()=>{
  const f=fixture();
  f.tx.partnerAndroidBuildWorkerConsumption.create.mockRejectedValue(
   new Prisma.PrismaClientKnownRequestError('duplicate',{code:'P2002',clientVersion:'6.0'}));
  await expect(f.service.consume(principal,societyId,proposalId,reservationId,claimId,signed(ctx)))
   .rejects.toThrow(/already consumed/);
 });
 it('requires fresh completion-time license authority and never accepts artifacts',async()=>{
  const f=fixture();
  const complete={grantId:ctx.grantId,allocationId,expectedGrantVersion:1,
   expectedOwnershipVersion:1,idempotencyKey:ctx.idempotencyKey,
   revisionId,expectedDigest:ctx.expectedDigest,versionCode:5,workerId:ctx.workerId};
  const r=await f.service.revalidateCompletion(principal,societyId,proposalId,
   reservationId,consumptionId,complete);
  expect(r).toMatchObject({status:'CURRENT_TEST_COMPLETION_AUTHORITY_ONLY',
   dispatchAllowed:false,archiveVerified:false,artifactProduced:false});
  expect(f.checkpoint.mock.calls[0][4]).toMatchObject({stage:'BEFORE_COMPLETION'});
  f.checkpoint.mockRejectedValueOnce(new Error('Distribution revoked at completion'));
  await expect(f.service.revalidateCompletion(principal,societyId,proposalId,
   reservationId,consumptionId,complete)).rejects.toThrow(/revoked/);
  f.used.workerId='TEST_WORKER_FOREIGN';
  await expect(f.service.revalidateCompletion(principal,societyId,proposalId,
   reservationId,consumptionId,complete)).rejects.toThrow(/Foreign/);
 });
});
