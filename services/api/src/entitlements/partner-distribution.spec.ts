import { randomUUID, createHash } from 'node:crypto';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature } from './entitlement.types';
import { canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerDistributionController } from './partner-distribution.controller';
import { PartnerDistributionService } from './partner-distribution.service';
import { LegacySubscriptionConversionService } from './legacy-subscription-conversion.service';
const societyId=randomUUID(),maker=randomUUID(),checker=randomUUID(),allocationId=randomUUID(),grantId=randomUUID(),proposalId=randomUUID();
const principal={userId:checker,societyId,roles:[AppRole.SUPER_ADMIN]};
const context={grantId,allocationId,expectedGrantVersion:1,expectedOwnershipVersion:1,idempotencyKey:randomUUID()};
const manifest={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.partner.resident',namespace:'in.fixture.partner.resident',appRole:'RESIDENT',label:'Partner Resident',sourceSha:'a'.repeat(40),configDigest:'b'.repeat(64),signingProfile:'TEST_FIXTURE',apiOrigin:'https://build-api.fixture.in'};
const digest=createHash('sha256').update(canonicalLicenseJson(manifest)).digest('hex');
const legacy={productTier:'STARTER',featureOverrides:{},enabledFeatures:[ProductFeature.VISITOR_MANAGEMENT,ProductFeature.NOTICES,ProductFeature.SOS]};
function fixture(){
 vi.stubEnv('AARAGATE_TEST_BUILD_API_ORIGINS',JSON.stringify([manifest.apiOrigin]));
 const scope={allocationId,approvalId:randomUUID(),partnerId:randomUUID(),maximumDistributions:1,legacy};
 const proposal={id:proposalId,actorId:maker,allocationId,manifest,digest,approval:null as unknown};
 const baseline={sourceProductTier:legacy.productTier,sourceOverrides:legacy.featureOverrides,enabledFeatures:legacy.enabledFeatures,sourceMigration:'v5-baseline'};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:maker}]),
  partnerDistributionProposal:{findUnique:vi.fn().mockResolvedValue(null),findFirst:vi.fn().mockResolvedValue(proposal),create:vi.fn().mockResolvedValue({id:proposalId})},
  partnerDistributionApproval:{count:vi.fn().mockResolvedValue(0),create:vi.fn().mockResolvedValue({id:'approval'})},
  partnerDistributionRevocation:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:'revocation'})},
  societyLicenseAllocation:{findUniqueOrThrow:vi.fn().mockResolvedValue({approval:{grantId}})},
  societyEntitlementCompatibility:{findUnique:vi.fn().mockResolvedValue(baseline)},
  societyLegacySubscription:{findFirst:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:'subscription'})},
 };
 const run=vi.fn(async(_p:unknown,_s:string,_i:unknown,cb:(t:typeof tx,s:typeof scope)=>unknown)=>cb(tx,scope));
 const ownership={withAuthorizedSociety:vi.fn(async(_p:unknown,_s:string,cb:(t:typeof tx)=>unknown)=>cb(tx))};
 return {scope,proposal,baseline,tx,run,ownership,service:new PartnerDistributionService({withActiveAllocation:run} as never,ownership as never),conversion:new LegacySubscriptionConversionService({withActiveAllocation:run} as never)};
}
afterEach(()=>vi.unstubAllEnvs());
describe('immutable test distribution approval and legacy conversion',()=>{
 it('requires bearer and platform roles for every route',()=>{
  expect(Reflect.getMetadata(GUARDS_METADATA,PartnerDistributionController)).toEqual([BearerGuard,RolesGuard]);
  expect(Reflect.getMetadata(ROLES_KEY,PartnerDistributionController)).toEqual([AppRole.SUPER_ADMIN]);
 });
 it('binds exact immutable test inputs and stable digest to allocation',async()=>{
  const f=fixture();expect(await f.service.propose(principal,societyId,{...context,manifest})).toMatchObject({digest,testOnly:true});
  expect(f.tx.partnerDistributionProposal.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({allocationId,manifest,digest,actorId:checker})}));
 });
 it.each([
  {environment:'PRODUCTION'}, {privateKey:'secret'}, {applicationId:'com.aaraagate.resident',namespace:'com.aaraagate.resident'},
  {applicationId:'com.aaraaplatforms.partner.resident',namespace:'com.aaraaplatforms.partner.resident'},
  {applicationId:'in.fixture.class.resident',namespace:'in.fixture.class.resident'}, {namespace:'in.other.app'}, {label:'Unsafe\u202eLabel'}, {sourceSha:'main'}, {configDigest:'latest'},
  {apiOrigin:'https://foreign.in'}, {apiOrigin:manifest.apiOrigin+'/'}, {signingProfile:'LIVE_KEY'},
 ])('rejects unsafe or production manifest before data access: %j',async(change)=>{
  const f=fixture();await expect(f.service.propose(principal,societyId,{...context,manifest:{...manifest,...change}})).rejects.toThrow();expect(f.run).not.toHaveBeenCalled();
 });
 it('replays proposal only for identical actor and immutable payload',async()=>{
  const f=fixture();f.tx.partnerDistributionProposal.findUnique.mockResolvedValue({...f.proposal,actorId:checker});
  await expect(f.service.propose(principal,societyId,{...context,manifest})).resolves.toMatchObject({id:proposalId});
  await expect(f.service.propose(principal,societyId,{...context,manifest:{...manifest,label:'Changed'}})).rejects.toThrow(/key changed/);
 });
 it('checks independence, live maker authority and digest before approval',async()=>{
  const f=fixture();await expect(f.service.approve({...principal,userId:maker},societyId,proposalId,{...context,expectedDigest:digest,reason:'Reviewed'})).rejects.toThrow(/Independent/);
  await expect(f.service.approve(principal,societyId,proposalId,{...context,expectedDigest:'0'.repeat(64),reason:'Reviewed'})).rejects.toThrow(/digest/);
  f.tx.$queryRaw.mockResolvedValue([]);
  await expect(f.service.approve(principal,societyId,proposalId,{...context,expectedDigest:digest,reason:'Reviewed'})).rejects.toThrow(/proposer authority/);
  expect(f.tx.partnerDistributionApproval.create).not.toHaveBeenCalled();
 });
 it('enforces plan capacity and refuses revoked approval replay',async()=>{
  const f=fixture();f.scope.maximumDistributions=0;
  await expect(f.service.approve(principal,societyId,proposalId,{...context,expectedDigest:digest,reason:'Reviewed'})).rejects.toThrow(/capacity/);
  f.proposal.approval={id:'approval',actorId:checker,idempotencyKey:context.idempotencyKey,reason:'Reviewed',revocation:{id:'revoked'}};
  await expect(f.service.approve(principal,societyId,proposalId,{...context,expectedDigest:digest,reason:'Reviewed'})).rejects.toThrow(/revoked/);
 });
 it('approved input is scoped and explicitly never dispatches a build',async()=>{
  const f=fixture();f.proposal.approval={id:'approval'};
  expect(await f.service.approved(principal,societyId,proposalId,context)).toMatchObject({digest,manifest,testOnly:true,buildDispatched:false});
  expect(f.tx.partnerDistributionProposal.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:proposalId,allocationId,approval:{is:{revocation:null}}}}));
 });
 it('records revocation using current society authority without requiring active licensing',async()=>{
  const f=fixture();f.proposal.approval={id:'approval',revocation:null};
  expect(await f.service.revoke(principal,societyId,proposalId,{idempotencyKey:context.idempotencyKey,reason:'Withdraw test approval'})).toMatchObject({status:'REVOKED'});
  expect(f.run).not.toHaveBeenCalled();expect(f.ownership.withAuthorizedSociety).toHaveBeenCalled();
 });
 it('converts exact historical rights without mutating operational data',async()=>{
  const f=fixture();expect(await f.conversion.convert(principal,societyId,context)).toMatchObject({status:'CONVERTED_PRESERVE_LEGACY',operationalAuthority:'LEGACY_TIER_OVERRIDES'});
  expect(f.tx.societyLegacySubscription.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({societyId,allocationId,sourceMigration:'v5-baseline',...legacy})}));
 });
 it('refuses missing or drifted historical rights, including raw unknown overrides',async()=>{
  const f=fixture();f.tx.societyEntitlementCompatibility.findUnique.mockResolvedValueOnce(null);
  await expect(f.conversion.convert(principal,societyId,context)).rejects.toThrow(/compatibility/);
  f.baseline.sourceOverrides={unknown:true} as never;
  await expect(f.conversion.convert(principal,societyId,context)).rejects.toThrow(/compatibility/);
  expect(f.tx.societyLegacySubscription.create).not.toHaveBeenCalled();
 });
 it('revalidates context before exact conversion replay and rejects changed actor or key',async()=>{
  const f=fixture();f.tx.societyLegacySubscription.findFirst.mockResolvedValue({id:'subscription',societyId,allocationId,actorId:checker,idempotencyKey:context.idempotencyKey});
  await expect(f.conversion.convert(principal,societyId,context)).resolves.toMatchObject({id:'subscription'});
  await expect(f.conversion.convert({...principal,userId:maker},societyId,context)).rejects.toThrow(/request changed/);
  f.run.mockRejectedValueOnce(new Error('Current allocation revoked'));
  await expect(f.conversion.convert(principal,societyId,context)).rejects.toThrow(/revoked/);
  expect(f.tx.societyLegacySubscription.create).not.toHaveBeenCalled();
 });
});
