import { createHash, randomUUID } from 'node:crypto';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PartnerDistributionController } from './partner-distribution.controller';
import { canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildRevisionService } from './partner-android-build-revision.service';

const societyId=randomUUID(),partnerId=randomUUID(),proposalId=randomUUID(),approvalId=randomUUID();
const maker=randomUUID(),checker=randomUUID(),revisionId=randomUUID(),allocationId=randomUUID();
const initial={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.partner.resident',namespace:'in.fixture.partner.resident',
 appRole:'RESIDENT',label:'Partner Resident',sourceSha:'a'.repeat(40),configDigest:'b'.repeat(64),
 signingProfile:'TEST_FIXTURE',apiOrigin:'https://test-build.fixture.in'};
const manifest={schemaVersion:1,distributionId:proposalId,approvalId,partnerId,societyId,brandRevision:1,
 sourceSha:initial.sourceSha,lockDigest:'c'.repeat(64),applicationId:initial.applicationId,namespace:initial.namespace,
 appRole:initial.appRole,label:initial.label,buildMode:'TEST',apiOrigin:initial.apiOrigin,
 configDigest:initial.configDigest,assetDigests:{icon:'d'.repeat(64),splash:'e'.repeat(64)},
 firebaseClientRef:'TEST_CLIENT',appLinkHosts:[],signingProfile:initial.signingProfile,signerFingerprint:'f'.repeat(64)};
const hash=(m:unknown)=>createHash('sha256').update(canonicalLicenseJson(m)).digest('hex');
const principal=(userId=maker)=>({userId,societyId,roles:[AppRole.SUPER_ADMIN]});
const input={grantId:randomUUID(),allocationId,expectedGrantVersion:1,expectedOwnershipVersion:1,idempotencyKey:randomUUID()};
function fixture(){
 vi.stubEnv('AARAGATE_TEST_BUILD_API_ORIGINS',JSON.stringify([initial.apiOrigin]));
 const proposal={id:proposalId,allocationId,manifest:initial,approval:{id:approvalId,revocation:null}};
 const revision={id:revisionId,proposalId,version:1,manifest,digest:hash(manifest),actorId:maker,approval:null as unknown};
 const scope={allocationId,partnerId,approvalId,maximumDistributions:1,legacy:{}};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:maker}]),
  partnerDistributionProposal:{findFirst:vi.fn().mockResolvedValue(proposal)},
  partnerAndroidBuildRevision:{
   findUnique:vi.fn().mockResolvedValue(null),
   findFirst:vi.fn().mockImplementation(async (q:{include?:unknown})=>q.include?revision:{id:revisionId}),
   create:vi.fn().mockResolvedValue({id:revisionId,version:1,digest:hash(manifest)})
  },
  partnerAndroidBuildRevisionApproval:{create:vi.fn().mockResolvedValue({id:approvalId})}
 };
 const run=vi.fn(async (_p:unknown,_s:string,_i:unknown,cb:(t:typeof tx,s:typeof scope)=>unknown)=>cb(tx,scope));
 return {tx,proposal,revision,run,service:new PartnerAndroidBuildRevisionService({withActiveAllocation:run} as never)};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.5.2 test-only Android build revision authority',()=>{
 it('keeps all revision routes behind bearer and SUPER_ADMIN guards',()=>{
  expect(Reflect.getMetadata(GUARDS_METADATA,PartnerDistributionController)).toEqual([BearerGuard,RolesGuard]);
  expect(Reflect.getMetadata(ROLES_KEY,PartnerDistributionController)).toEqual([AppRole.SUPER_ADMIN]);
 });
 it('stores a versioned immutable TEST manifest without dispatch permission',async()=>{
  const f=fixture(), result=await f.service.propose(principal(),societyId,proposalId,{...input,manifest});
  expect(result).toMatchObject({id:revisionId,version:1,digest:hash(manifest),dispatchAllowed:false});
  expect(f.tx.partnerAndroidBuildRevision.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({proposalId,version:1,actorId:maker,manifest,digest:hash(manifest)})}));
 });
 it.each([
  {buildMode:'PRODUCTION'}, {privateKey:'secret'}, {applicationId:'com.aaraaplatforms.resident',namespace:'com.aaraaplatforms.resident'},
  {signingProfile:'LIVE_KEY'}, {appRole:'GUARD'}, {signerFingerprint:'wrong'},
  {apiOrigin:'https://foreign.in'}, {sourceSha:'main'}, {brandRevision:0},
  {assetDigests:{icon:'a'.repeat(64),splash:'e'.repeat(64),script:'invalid'}},
  {appLinkHosts:['bad/host']}, {label:'Unsafe\u202e'},
 ])('fails closed before allocation access for unsafe manifest %j',async(change)=>{
  const f=fixture();await expect(f.service.propose(principal(),societyId,proposalId,{...input,manifest:{...manifest,...change}})).rejects.toThrow();
  expect(f.run).not.toHaveBeenCalled();
 });
 it('rejects foreign identities and revoked initial distribution approvals',async()=>{
  const f=fixture();
  await expect(f.service.propose(principal(),societyId,proposalId,{...input,manifest:{...manifest,partnerId:randomUUID()}})).rejects.toThrow(/identity/);
  f.proposal.approval.revocation={id:randomUUID()} as never;
  await expect(f.service.propose(principal(),societyId,proposalId,{...input,manifest})).rejects.toThrow(/approval/);
  expect(f.tx.partnerAndroidBuildRevision.create).not.toHaveBeenCalled();
 });
 it('replays only same actor and payload and refuses unreviewed concurrent revision',async()=>{
  const f=fixture();
  f.tx.partnerAndroidBuildRevision.findUnique.mockResolvedValue({...f.revision,approval:null});
  await expect(f.service.propose(principal(),societyId,proposalId,{...input,manifest})).resolves.toMatchObject({id:revisionId});
  await expect(f.service.propose(principal(checker),societyId,proposalId,{...input,manifest})).rejects.toThrow(/key changed/);
  f.tx.partnerAndroidBuildRevision.findUnique.mockResolvedValue(null);
  await expect(f.service.propose(principal(),societyId,proposalId,{...input,manifest})).rejects.toThrow(/independent review/);
 });
 it('enforces maker-checker separation, exact digest and live maker authority',async()=>{
  const f=fixture(), req={...input,expectedDigest:hash(manifest),reason:'Reviewed test revision'};
  await expect(f.service.approve(principal(),societyId,proposalId,revisionId,req)).rejects.toThrow(/Independent/);
  await expect(f.service.approve(principal(checker),societyId,proposalId,revisionId,{...req,expectedDigest:'0'.repeat(64)})).rejects.toThrow(/digest/);
  f.tx.$queryRaw.mockResolvedValueOnce([{id:maker}]).mockResolvedValueOnce([]);
  await expect(f.service.approve(principal(checker),societyId,proposalId,revisionId,req)).rejects.toThrow(/maker/);
  expect(f.tx.partnerAndroidBuildRevisionApproval.create).not.toHaveBeenCalled();
 });
 it('reviewed records are explicitly non-dispatchable and latest requires review',async()=>{
  const f=fixture(), req={...input,expectedDigest:hash(manifest),reason:'Reviewed test revision'};
  expect(await f.service.approve(principal(checker),societyId,proposalId,revisionId,req)).toMatchObject({status:'REVIEWED_TEST_REVISION',dispatchAllowed:false});
  await expect(f.service.latest(principal(checker),societyId,proposalId,input)).rejects.toThrow(/reviewed revision/);
  f.revision.approval={id:approvalId,actorId:checker,idempotencyKey:input.idempotencyKey,reason:req.reason} as never;
  expect(await f.service.latest(principal(checker),societyId,proposalId,input)).toMatchObject({
   manifest,digest:hash(manifest),dispatchAllowed:false,requiresBuilderRevalidation:true});
 });
});
