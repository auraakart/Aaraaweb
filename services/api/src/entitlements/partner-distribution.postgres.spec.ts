import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole } from '../auth/auth.types';
import { EntitlementService } from './entitlement.service';
import { ProductFeature } from './entitlement.types';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';
import { PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildRevisionService } from './partner-android-build-revision.service';
import { PartnerAndroidBuildReservationService } from './partner-android-build-reservation.service';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';
import { PartnerDistributionService } from './partner-distribution.service';
import { LegacySubscriptionConversionService } from './legacy-subscription-conversion.service';
const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
async function fixture(p:PrismaService){
 const partnerId=randomUUID(),societyId=randomUUID(),maker=randomUUID(),checker=randomUUID();
 await p.partner.create({data:{id:partnerId,slug:'dist-'+partnerId,displayName:'Distribution fixture',status:'ACTIVE'}});
 await p.user.createMany({data:[maker,checker].map(id=>({id,phone:'dist-'+id}))});
 await p.society.create({data:{id:societyId,partnerId,name:'Distribution fixture',code:'dist-'+societyId}});
 await p.societyMembership.createMany({data:[maker,checker].map(userId=>({userId,societyId,role:'SUPER_ADMIN'}))});
 const ownership=new SocietyOwnershipTransferService(p),entitlements=new EntitlementService(p),licenses=new PartnerLicenseLifecycleService(ownership,entitlements),persistence=new PartnerLicensePersistenceService(p);
 const plan=await persistence.createPlanRevision(maker,{code:'DIST_'+partnerId.slice(0,8).toUpperCase(),expectedVersion:0,featureAllowlist:Object.values(ProductFeature),maximumSocieties:1,maximumDomains:1,maximumDistributions:1});
 const g=await persistence.createGrantDraft(maker,partnerId,{planRevisionId:plan.id,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),idempotencyKey:randomUUID()});
 const principal=(userId=checker)=>({userId,societyId,roles:[AppRole.SUPER_ADMIN]});
 const ctx=()=>({grantId:g.id,expectedGrantVersion:1,expectedOwnershipVersion:1,idempotencyKey:randomUUID()});
 const before=await entitlements.current(societyId);
 await p.societyEntitlementCompatibility.create({data:{societyId,sourceProductTier:'STARTER',sourceOverrides:{},enabledFeatures:before!.enabledFeatures,sourceMigration:'distribution-test-baseline'}});
 await licenses.approve(principal(),societyId,{...ctx(),reason:'Independent commercial approval',essentialPolicy:'PRESERVE_LEGACY'});
 const consent=await licenses.consent(principal(maker),societyId,{...ctx(),decision:'OPT_IN',expectedFeatures:before!.enabledFeatures});
 const allocation=await licenses.activate(principal(),societyId,{...ctx(),consentId:consent.id});
 vi.stubEnv('AARAGATE_TEST_BUILD_API_ORIGINS','["https://test-build.fixture.in"]');
 const manifest={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.p'+partnerId.replaceAll('-','')+'.resident',namespace:'in.fixture.p'+partnerId.replaceAll('-','')+'.resident',appRole:'RESIDENT',label:'Partner Resident',sourceSha:'a'.repeat(40),configDigest:'b'.repeat(64),signingProfile:'TEST_FIXTURE',apiOrigin:'https://test-build.fixture.in'};
 return {partnerId,societyId,maker,checker,principal,ctx,licenses,entitlements,before,allocation,manifest,service:new PartnerDistributionService(licenses,ownership),conversion:new LegacySubscriptionConversionService(licenses),context:()=>({...ctx(),allocationId:allocation.id})};
}
afterEach(()=>vi.unstubAllEnvs());
withDatabase('distribution and legacy subscription native PostgreSQL',()=>{
 it('approves immutable test identity independently, replays and revokes without changing legacy features',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),input={...f.context(),manifest:f.manifest},proposal=await f.service.propose(f.principal(f.maker),f.societyId,input);
   expect(await f.service.propose(f.principal(f.maker),f.societyId,input)).toEqual(proposal);
   const approve={...f.context(),expectedDigest:proposal.digest,reason:'Reviewed immutable test input'};
   await expect(f.service.approve(f.principal(f.maker),f.societyId,proposal.id,approve)).rejects.toThrow(/Independent/);
   const a=await f.service.approve(f.principal(),f.societyId,proposal.id,approve);
   expect(await f.service.approve(f.principal(),f.societyId,proposal.id,approve)).toEqual(a);
   expect(await f.service.approved(f.principal(),f.societyId,proposal.id,f.context())).toMatchObject({manifest:f.manifest,buildDispatched:false});
   await expect(p.partnerDistributionProposal.update({where:{id:proposal.id},data:{applicationId:'in.changed.identity'}})).rejects.toThrow(/immutable/);
   await expect(p.partnerDistributionApproval.delete({where:{id:a.id}})).rejects.toThrow(/immutable/);
   await f.licenses.consent(f.principal(f.maker),f.societyId,{...f.ctx(),decision:'WITHDRAW',expectedFeatures:[]});
   await expect(f.service.approved(f.principal(),f.societyId,proposal.id,f.context())).rejects.toThrow(/opt-in/);
   const revoke={idempotencyKey:randomUUID(),reason:'Withdraw build approval'};
   const r=await f.service.revoke(f.principal(),f.societyId,proposal.id,revoke);
   expect(await f.service.revoke(f.principal(),f.societyId,proposal.id,revoke)).toEqual(r);
   expect(await f.entitlements.current(f.societyId)).toEqual(f.before);
  }finally{await p.$disconnect();}
 });
 it('serializes competing capacity-one approvals and forbids raw self-approval',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),first=await f.service.propose(f.principal(f.maker),f.societyId,{...f.context(),manifest:f.manifest});
   const id=f.manifest.applicationId+'.guard';
   const second=await f.service.propose(f.principal(f.maker),f.societyId,{...f.context(),manifest:{...f.manifest,applicationId:id,namespace:id,appRole:'GUARD'}});
   await expect(p.partnerDistributionApproval.create({data:{proposalId:first.id,actorId:f.maker,idempotencyKey:randomUUID(),reason:'Raw self approval'}})).rejects.toThrow(/Independent/);
   const results=await Promise.allSettled([first,second].map(proposal=>f.service.approve(f.principal(),f.societyId,proposal.id,{...f.context(),expectedDigest:proposal.digest,reason:'Review capacity'})));
   expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  }finally{await p.$disconnect();}
 });
 it('converts once, preserves historical rights and rejects stale actor, withdrawal and raw forged snapshots',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),input=f.context();
   await expect(p.societyLegacySubscription.create({data:{societyId:f.societyId,allocationId:f.allocation.id,actorId:f.checker,idempotencyKey:randomUUID(),sourceMigration:'distribution-test-baseline',productTier:'STARTER',featureOverrides:{},enabledFeatures:[]}})).rejects.toThrow(/compatibility/);
   const result=await f.conversion.convert(f.principal(),f.societyId,input);
   expect(await f.conversion.convert(f.principal(),f.societyId,input)).toEqual(result);
   expect(await p.societyLegacySubscription.count({where:{societyId:f.societyId}})).toBe(1);
   await expect(f.conversion.convert(f.principal(f.maker),f.societyId,input)).rejects.toThrow(/request changed/);
   await expect(p.societyLegacySubscription.delete({where:{id:result.id}})).rejects.toThrow(/immutable/);
   await f.licenses.consent(f.principal(f.maker),f.societyId,{...f.ctx(),decision:'WITHDRAW',expectedFeatures:[]});
   await expect(f.conversion.convert(f.principal(),f.societyId,input)).rejects.toThrow(/opt-in/);
   expect(await f.entitlements.current(f.societyId)).toEqual(f.before);
  }finally{await p.$disconnect();}
 });
 it('fails closed for foreign society scope and suspended partner on receipt replay',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),input=f.context();await f.conversion.convert(f.principal(),f.societyId,input);
   await expect(f.conversion.convert({...f.principal(),societyId:randomUUID()},f.societyId,input)).rejects.toThrow(/authority/);
   await p.partner.update({where:{id:f.partnerId},data:{status:'RESTRICTED'}});
   await expect(f.conversion.convert(f.principal(),f.societyId,input)).rejects.toThrow(/context changed/);
   expect(await f.entitlements.current(f.societyId)).toEqual(f.before);
  }finally{await p.$disconnect();}
 });

 it('persists independent reviewed Android revisions, signer continuity and raw database boundaries',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),android=new PartnerAndroidBuildRevisionService(f.licenses);
   const initial=await f.service.propose(f.principal(f.maker),f.societyId,{...f.context(),manifest:f.manifest});
   const initialApproval=await f.service.approve(f.principal(),f.societyId,initial.id,{...f.context(),expectedDigest:initial.digest,reason:'Review distribution identity'});
   const build={schemaVersion:1,distributionId:initial.id,approvalId:initialApproval.id,
    partnerId:f.partnerId,societyId:f.societyId,brandRevision:1,sourceSha:f.manifest.sourceSha,
    lockDigest:'c'.repeat(64),applicationId:f.manifest.applicationId,namespace:f.manifest.namespace,
    appRole:f.manifest.appRole,label:f.manifest.label,buildMode:'TEST',
    apiOrigin:f.manifest.apiOrigin,configDigest:f.manifest.configDigest,
    assetDigests:{icon:'d'.repeat(64),splash:'e'.repeat(64)},firebaseClientRef:'TEST_CLIENT',
    appLinkHosts:[],signingProfile:f.manifest.signingProfile,signerFingerprint:'f'.repeat(64)};
   const request={...f.context(),manifest:build};
   const one=await android.propose(f.principal(f.maker),f.societyId,initial.id,request);
   expect(one).toMatchObject({version:1,dispatchAllowed:false});
   expect(await android.propose(f.principal(f.maker),f.societyId,initial.id,request)).toEqual(one);
   await expect(android.propose(f.principal(f.checker),f.societyId,initial.id,
    {...f.context(),manifest:{...build,sourceSha:'b'.repeat(40)}})).rejects.toThrow(/review/);
   const review={...f.context(),expectedDigest:one.digest,reason:'Independent Android review'};
   await expect(android.approve(f.principal(f.maker),f.societyId,initial.id,one.id,review)).rejects.toThrow(/Independent/);
   await expect(p.partnerAndroidBuildRevisionApproval.create({data:{
    revisionId:one.id,actorId:f.maker,idempotencyKey:randomUUID(),reason:'Raw self review'
   }})).rejects.toThrow(/Independent/);
   const accepted=await android.approve(f.principal(),f.societyId,initial.id,one.id,review);
   expect(await android.approve(f.principal(),f.societyId,initial.id,one.id,review)).toEqual(accepted);
   expect(await android.latest(f.principal(),f.societyId,initial.id,f.context())).toMatchObject({
    version:1,manifest:build,dispatchAllowed:false,requiresBuilderRevalidation:true});
   await expect(p.partnerAndroidBuildRevision.update({where:{id:one.id},data:{version:10}})).rejects.toThrow(/immutable/);
   await expect(android.propose(f.principal(f.maker),f.societyId,initial.id,{
    ...f.context(),manifest:{...build,signerFingerprint:'0'.repeat(64)}
   })).rejects.toThrow(/signer/);
   const two=await android.propose(f.principal(f.maker),f.societyId,initial.id,{
    ...f.context(),manifest:{...build,sourceSha:'b'.repeat(40),lockDigest:'2'.repeat(64)}
   });
   expect(two.version).toBe(2);
   const bad={...build,partnerId:randomUUID()};
   const hash=createHash('sha256').update(canonicalLicenseJson(bad)).digest('hex');
   await expect(p.partnerAndroidBuildRevision.create({data:{
    proposalId:initial.id,version:3,actorId:f.maker,idempotencyKey:randomUUID(),manifest:bad,digest:hash
   }})).rejects.toThrow(/identity/);
   await expect(android.latest(f.principal(),f.societyId,initial.id,f.context())).rejects.toThrow(/reviewed/);
   await android.approve(f.principal(),f.societyId,initial.id,two.id,{
    ...f.context(),expectedDigest:two.digest,reason:'Review update revision'
   });
   expect((await android.latest(f.principal(),f.societyId,initial.id,f.context())).version).toBe(2);
   await f.service.revoke(f.principal(),f.societyId,initial.id,{idempotencyKey:randomUUID(),reason:'Revoke test identity'});
   await expect(android.latest(f.principal(),f.societyId,initial.id,f.context())).rejects.toThrow(/approval/);
  }finally{await p.$disconnect();}
 });

 it('allocates durable distinct version codes and denies direct SQL skip/reuse, stale review and revoked scope',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),android=new PartnerAndroidBuildRevisionService(f.licenses);
   const jobs=new PartnerAndroidBuildReservationService(f.licenses);
   const proposal=await f.service.propose(f.principal(f.maker),f.societyId,{...f.context(),manifest:f.manifest});
   const approval=await f.service.approve(f.principal(),f.societyId,proposal.id,{
    ...f.context(),expectedDigest:proposal.digest,reason:'Independent build distribution approval'
   });
   const build={schemaVersion:1,distributionId:proposal.id,approvalId:approval.id,partnerId:f.partnerId,societyId:f.societyId,
    brandRevision:1,sourceSha:f.manifest.sourceSha,lockDigest:'c'.repeat(64),
    applicationId:f.manifest.applicationId,namespace:f.manifest.namespace,appRole:f.manifest.appRole,
    label:f.manifest.label,buildMode:'TEST',apiOrigin:f.manifest.apiOrigin,configDigest:f.manifest.configDigest,
    assetDigests:{icon:'d'.repeat(64),splash:'e'.repeat(64)},firebaseClientRef:'TEST_CLIENT',
    appLinkHosts:[],signingProfile:f.manifest.signingProfile,signerFingerprint:'f'.repeat(64)};
   const revision=await android.propose(f.principal(f.maker),f.societyId,proposal.id,{...f.context(),manifest:build});
   await android.approve(f.principal(),f.societyId,proposal.id,revision.id,{
    ...f.context(),expectedDigest:revision.digest,reason:'Independent reviewed TEST revision'
   });
   const request={...f.context(),revisionId:revision.id,expectedDigest:revision.digest};
   const first=await jobs.reserve(f.principal(),f.societyId,proposal.id,request);
   expect(first).toMatchObject({versionCode:1,dispatchAllowed:false});
   expect(await jobs.reserve(f.principal(),f.societyId,proposal.id,request)).toEqual(first);
   await expect(jobs.reserve(f.principal(f.maker),f.societyId,proposal.id,request)).rejects.toThrow(/key changed/);
   await expect(p.partnerAndroidBuildReservation.create({data:{
    proposalId:proposal.id,revisionId:revision.id,actorId:f.checker,idempotencyKey:randomUUID(),
    versionCode:1,digest:revision.digest
   }})).rejects.toThrow();
   await expect(p.partnerAndroidBuildReservation.create({data:{
    proposalId:proposal.id,revisionId:revision.id,actorId:f.checker,idempotencyKey:randomUUID(),
    versionCode:4,digest:revision.digest
   }})).rejects.toThrow(/versionCode/);
   const second=await jobs.reserve(f.principal(),f.societyId,proposal.id,{
    ...f.context(),revisionId:revision.id,expectedDigest:revision.digest
   });
   expect(second.versionCode).toBe(2);
   await expect(p.partnerAndroidBuildReservation.delete({where:{id:first.id}})).rejects.toThrow(/immutable/);
   await f.service.revoke(f.principal(),f.societyId,proposal.id,{
    idempotencyKey:randomUUID(),reason:'Withdraw TEST build approval'
   });
   await expect(jobs.reserve(f.principal(),f.societyId,proposal.id,{
    ...f.context(),revisionId:revision.id,expectedDigest:revision.digest
   })).rejects.toThrow(/approval/);
   expect(await p.partnerAndroidBuildReservation.count({where:{proposalId:proposal.id}})).toBe(2);
  }finally{await p.$disconnect();}
 });
});
