import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildReservationService } from './partner-android-build-reservation.service';

const societyId=randomUUID(),partnerId=randomUUID(),proposalId=randomUUID(),approvalId=randomUUID();
const maker=randomUUID(),checker=randomUUID(),revisionId=randomUUID(),jobId=randomUUID(),allocationId=randomUUID();
const original={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.partner.resident',
 namespace:'in.fixture.partner.resident',appRole:'RESIDENT',label:'Partner Resident',
 sourceSha:'a'.repeat(40),configDigest:'b'.repeat(64),signingProfile:'TEST_FIXTURE',apiOrigin:'https://test-build.fixture.in'};
const manifest={schemaVersion:1,distributionId:proposalId,approvalId,partnerId,societyId,brandRevision:1,
 sourceSha:original.sourceSha,lockDigest:'c'.repeat(64),applicationId:original.applicationId,namespace:original.namespace,
 appRole:original.appRole,label:original.label,buildMode:'TEST',apiOrigin:original.apiOrigin,
 configDigest:original.configDigest,assetDigests:{icon:'d'.repeat(64),splash:'e'.repeat(64)},firebaseClientRef:'TEST_CLIENT',
 appLinkHosts:[],signingProfile:original.signingProfile,signerFingerprint:'f'.repeat(64)};
const digest=(v:unknown)=>createHash('sha256').update(canonicalLicenseJson(v)).digest('hex');
const input={grantId:randomUUID(),allocationId,expectedGrantVersion:1,expectedOwnershipVersion:1,
 idempotencyKey:randomUUID(),revisionId,expectedDigest:digest(manifest)};
const principal=(userId=checker)=>({userId,societyId,roles:[AppRole.SUPER_ADMIN]});
function fixture(){
 const proposal={id:proposalId,allocationId,manifest:original,digest:digest(original),approval:{id:approvalId,revocation:null as unknown}};
 const revision={id:revisionId,version:1,proposalId,manifest,digest:digest(manifest),approval:{id:randomUUID()} as unknown};
 const scope={allocationId,partnerId,approvalId,maximumDistributions:1,legacy:{}};
 const job={id:jobId,actorId:checker,proposalId,revisionId,digest:revision.digest,versionCode:1};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:proposalId}]),
  partnerDistributionProposal:{findFirst:vi.fn().mockResolvedValue(proposal)},
  partnerAndroidBuildRevision:{findFirst:vi.fn().mockResolvedValue(revision)},
  partnerAndroidBuildReservation:{
   findUnique:vi.fn().mockResolvedValue(null),
   findFirst:vi.fn().mockResolvedValue(null),
   create:vi.fn().mockResolvedValue({id:jobId,versionCode:1})
  }
 };
 const run=vi.fn(async(_p:unknown,_s:string,_i:unknown,cb:(t:typeof tx,s:typeof scope)=>unknown)=>cb(tx,scope));
 return {tx,run,proposal,revision,job,service:new PartnerAndroidBuildReservationService({withActiveAllocation:run} as never)};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.5.3 monotonic Android versionCode TEST reservation',()=>{
 it('reserves first monotonic versionCode without dispatching',async()=>{
  const f=fixture(),v=await f.service.reserve(principal(),societyId,proposalId,input);
  expect(v).toMatchObject({id:jobId,versionCode:1,revisionId,digest:input.expectedDigest,dispatchAllowed:false,testOnly:true});
  expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
  expect(f.tx.partnerAndroidBuildReservation.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({proposalId,revisionId,actorId:checker,versionCode:1,digest:input.expectedDigest})}));
 });
 it('replays identical authorized reservation without creating another code',async()=>{
  const f=fixture();f.tx.partnerAndroidBuildReservation.findUnique.mockResolvedValue(f.job);
  const r=await f.service.reserve(principal(),societyId,proposalId,input);
  expect(r.versionCode).toBe(1);expect(f.tx.partnerAndroidBuildReservation.create).not.toHaveBeenCalled();
  await expect(f.service.reserve(principal(maker),societyId,proposalId,input)).rejects.toThrow(/key changed/);
 });
 it('consumes earlier codes even when earlier jobs were not completed',async()=>{
  const f=fixture();f.tx.partnerAndroidBuildReservation.findFirst.mockResolvedValue({versionCode:30});
  f.tx.partnerAndroidBuildReservation.create.mockResolvedValue({id:jobId,versionCode:31});
  expect((await f.service.reserve(principal(),societyId,proposalId,input)).versionCode).toBe(31);
  expect(f.tx.partnerAndroidBuildReservation.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({versionCode:31})}));
 });
 it('refuses exhaustion without writing a job',async()=>{
  const f=fixture();f.tx.partnerAndroidBuildReservation.findFirst.mockResolvedValue({versionCode:2100000000});
  await expect(f.service.reserve(principal(),societyId,proposalId,input)).rejects.toThrow(/exhausted/);
  expect(f.tx.partnerAndroidBuildReservation.create).not.toHaveBeenCalled();
 });
 it('fails closed on stale or unreviewed latest revision',async()=>{
  const f=fixture();f.revision.approval=null as never;
  await expect(f.service.reserve(principal(),societyId,proposalId,input)).rejects.toThrow(/reviewed/);
  f.revision.approval={id:randomUUID()};
  await expect(f.service.reserve(principal(),societyId,proposalId,{...input,revisionId:randomUUID()})).rejects.toThrow(/reviewed/);
  await expect(f.service.reserve(principal(),societyId,proposalId,{...input,expectedDigest:'0'.repeat(64)})).rejects.toThrow(/digest/);
 });
 it('refuses revoked original approval and forged original digest',async()=>{
  const f=fixture();f.proposal.approval.revocation={id:randomUUID()};
  await expect(f.service.reserve(principal(),societyId,proposalId,input)).rejects.toThrow(/approval/);
  f.proposal.approval.revocation=null;f.proposal.digest='0'.repeat(64);
  await expect(f.service.reserve(principal(),societyId,proposalId,input)).rejects.toThrow(/digest/);
 });
 it('enforces TEST identity and foreign context refusal without job creation',async()=>{
  const f=fixture();f.revision.manifest={...manifest,buildMode:'PRODUCTION'};
  await expect(f.service.reserve(principal(),societyId,proposalId,input)).rejects.toThrow(/identity/);
  f.revision.manifest={...manifest,partnerId:randomUUID()};
  f.revision.digest=digest(f.revision.manifest);
  await expect(f.service.reserve(principal(),societyId,proposalId,{...input,expectedDigest:f.revision.digest})).rejects.toThrow(/identity/);
  expect(f.tx.partnerAndroidBuildReservation.create).not.toHaveBeenCalled();
 });
 it('rejects malformed references before allocation access',async()=>{
  const f=fixture();await expect(f.service.reserve(principal(),societyId,'bad',input)).rejects.toThrow();
  await expect(f.service.reserve(principal(),societyId,proposalId,{...input,revisionId:'bad'})).rejects.toThrow();
  await expect(f.service.reserve(principal(),societyId,proposalId,{...input,expectedDigest:'BAD'})).rejects.toThrow();
  expect(f.run).not.toHaveBeenCalled();
 });
});
