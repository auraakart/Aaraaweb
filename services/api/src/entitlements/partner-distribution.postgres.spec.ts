import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole } from '../auth/auth.types';
import { EntitlementService } from './entitlement.service';
import { ProductFeature } from './entitlement.types';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';
import { PartnerLicenseLifecycleService } from './partner-license-lifecycle.service';
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
});
