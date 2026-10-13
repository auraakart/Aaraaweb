import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';
import { ProductFeature, ProductTier } from './entitlement.types';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';
import { PartnerLicenseLifecycleService } from './partner-license-lifecycle.service';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';
const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
async function fixture(prisma:PrismaService,capacity=1){
 const partnerId=randomUUID(),maker=randomUUID(),checker=randomUUID(),admin=randomUUID(),societies=[randomUUID(),randomUUID()];
 await prisma.$transaction(async tx=>{
  await tx.partner.create({data:{id:partnerId,slug:'life-'+partnerId,displayName:'License fixture',status:'ACTIVE'}});
  await tx.user.createMany({data:[maker,checker,admin].map(id=>({id,phone:'life-'+id}))});
  for(const societyId of societies){
   await tx.society.create({data:{id:societyId,partnerId,name:'License fixture',code:'life-'+societyId}});
   await tx.societyMembership.createMany({data:[{userId:maker,societyId,role:'SUPER_ADMIN'},{userId:checker,societyId,role:'SUPER_ADMIN'},{userId:admin,societyId,role:'SOCIETY_ADMIN'}]});
  }
 });
 const persistence=new PartnerLicensePersistenceService(prisma),entitlements=new EntitlementService(prisma),ownership=new SocietyOwnershipTransferService(prisma);
 const service=new PartnerLicenseLifecycleService(ownership,entitlements);
 const plan=await persistence.createPlanRevision(maker,{code:'LIFE_'+partnerId.slice(0,8).toUpperCase(),expectedVersion:0,featureAllowlist:Object.values(ProductFeature),maximumSocieties:capacity,maximumDomains:1,maximumDistributions:1});
 const period={startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()};
 const draft=await persistence.createGrantDraft(maker,partnerId,{...period,planRevisionId:plan.id,idempotencyKey:randomUUID()});
 const principal=(userId:string,societyId=societies[0],role=AppRole.SUPER_ADMIN)=>({userId,societyId,roles:[role]});
 const context=()=>({grantId:draft.id,expectedGrantVersion:1,expectedOwnershipVersion:1,idempotencyKey:randomUUID()});
 const approve=()=>service.approve(principal(checker),societies[0],{...context(),reason:'Independent reviewed commercial approval',essentialPolicy:'PRESERVE_LEGACY'});
 const consent=async(societyId=societies[0])=>service.consent(principal(admin,societyId,AppRole.SOCIETY_ADMIN),societyId,{...context(),decision:'OPT_IN',expectedFeatures:(await entitlements.current(societyId))!.enabledFeatures});
 return {partnerId,maker,checker,admin,societies,persistence,entitlements,ownership,service,plan,draft,period,principal,context,approve,consent};
}
withDatabase('V5.4.5.4 approved licensing and opt-in PostgreSQL boundary',()=>{
 it('approves independently, opts in explicitly and activates without changing legacy features',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),s=f.societies[0],before=await f.entitlements.current(s);
   await expect(f.service.approve(f.principal(f.maker),s,{...f.context(),reason:'Self approval attempt',essentialPolicy:'PRESERVE_LEGACY'})).rejects.toThrow(/Independent/);
   const approval=await f.approve(),consent=await f.consent();
   const request={...f.context(),consentId:consent.id};
   const result=await f.service.activate(f.principal(f.checker),s,request);
   expect(await f.service.activate(f.principal(f.checker),s,request)).toEqual(result);
   expect(result.status).toBe('ACTIVE_ALLOCATION');
   expect(await f.entitlements.current(s)).toEqual(before);
   expect((await p.partnerLicenseGrant.findUniqueOrThrow({where:{id:f.draft.id}})).status).toBe('DRAFT');
   expect(await p.societyLicenseAllocation.count({where:{approvalId:approval.id}})).toBe(1);
   await expect(p.partnerLicenseApproval.delete({where:{id:approval.id}})).rejects.toThrow(/immutable/);
   await expect(p.societyLicenseConsent.update({where:{id:consent.id},data:{decision:'WITHDRAW'}})).rejects.toThrow(/immutable/);
   await expect(p.partnerLicenseGrant.update({where:{id:f.draft.id},data:{version:2}})).rejects.toThrow(/immutable/);
  }finally{await p.$disconnect();}
 });
 it('serializes capacity one across societies and rolls back a competing insert',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),approval=await f.approve(),consents=await Promise.all(f.societies.map(s=>f.consent(s)));
   const result=await Promise.allSettled(f.societies.map((s,i)=>f.service.activate(f.principal(f.checker,s),s,{...f.context(),consentId:consents[i].id})));
   expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
   expect(result.filter(r=>r.status==='rejected')).toHaveLength(1);
   expect(await p.societyLicenseAllocation.count({where:{approvalId:approval.id}})).toBe(1);
  }finally{await p.$disconnect();}
 });
 it('withdraws append-only, rejects stale replay and permits later explicit re-enrollment',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),s=f.societies[0];await f.approve();const c=await f.consent();const request={...f.context(),consentId:c.id};
   await f.service.activate(f.principal(f.checker),s,request);
   const before=await f.entitlements.current(s);
   await f.service.consent(f.principal(f.admin,s,AppRole.SOCIETY_ADMIN),s,{...f.context(),decision:'WITHDRAW',expectedFeatures:[]});
   await expect(f.service.activate(f.principal(f.checker),s,request)).rejects.toThrow(/opt-in/);
   expect(await f.entitlements.current(s)).toEqual(before);
   const newConsent=await f.consent();
   await expect(f.service.activate(f.principal(f.checker),s,{...f.context(),consentId:newConsent.id})).resolves.toMatchObject({status:'ACTIVE_ALLOCATION'});
   expect(await p.societyLicenseAllocation.count({where:{societyId:s}})).toBe(2);
  }finally{await p.$disconnect();}
 });
 it('revokes commercial authority without interrupting legacy/SOS and rejects old replay',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),s=f.societies[0];await f.approve();const c=await f.consent(),request={...f.context(),consentId:c.id};
   await f.service.activate(f.principal(f.checker),s,request);const before=await f.entitlements.current(s);
   const revoke={...f.context(),reason:'Reviewed commercial revocation'};
   const r=await f.service.revoke(f.principal(f.checker),s,revoke);
   expect(await f.service.revoke(f.principal(f.checker),s,revoke)).toEqual(r);
   await expect(f.service.activate(f.principal(f.checker),s,request)).rejects.toThrow(/active license/);
   expect(await f.entitlements.current(s)).toEqual(before);
   expect(before!.enabledFeatures).toContain(ProductFeature.SOS);
   const next=await f.persistence.createGrantDraft(f.maker,f.partnerId,{...f.period,planRevisionId:f.plan.id,idempotencyKey:randomUUID()});
   await expect(f.service.approve(f.principal(f.checker),s,{...f.context(),grantId:next.id,reason:'New approved replacement',essentialPolicy:'PRESERVE_LEGACY'})).resolves.toMatchObject({status:'APPROVED'});
  }finally{await p.$disconnect();}
 });
 it('rejects overlapping approvals, revoked maker/actor and foreign scope',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),s=f.societies[0];await f.approve();
   const next=await f.persistence.createGrantDraft(f.maker,f.partnerId,{...f.period,planRevisionId:f.plan.id,idempotencyKey:randomUUID()});
   await expect(f.service.approve(f.principal(f.checker),s,{...f.context(),grantId:next.id,reason:'Overlapping approval',essentialPolicy:'PRESERVE_LEGACY'})).rejects.toThrow(/overlap/);
   await expect(f.service.consent(f.principal(f.admin,f.societies[1],AppRole.SOCIETY_ADMIN),s,{...f.context(),decision:'OPT_IN',expectedFeatures:[]})).rejects.toThrow(/authority/);
   const c=await f.consent(),request={...f.context(),consentId:c.id};await f.service.activate(f.principal(f.checker),s,request);
   await p.societyMembership.updateMany({where:{userId:f.checker,societyId:s},data:{active:false}});
   await expect(f.service.activate(f.principal(f.checker),s,request)).rejects.toThrow(/authority/);
  }finally{await p.$disconnect();}
 });
 it('rejects raw forged snapshots, unaudited approvals, orphan consent and direct capacity bypass',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),s=f.societies[0];
   await expect(p.partnerLicenseApproval.create({data:{grantId:f.draft.id,grantVersion:1,societyId:s,ownershipVersion:1,approvedById:f.maker,idempotencyKey:randomUUID(),reason:'Raw self approval'}})).rejects.toThrow(/Independent/);
   const a=await f.approve(),c=await f.consent();
   await expect(p.societyLicenseConsent.create({data:{societyId:s,grantId:f.draft.id,grantVersion:1,ownershipVersion:1,actorId:f.admin,decision:'OPT_IN',idempotencyKey:randomUUID(),productTier:'STARTER',featureOverrides:{},enabledFeatures:['FAKE']}})).rejects.toThrow(/snapshot/);
   await f.service.activate(f.principal(f.checker),s,{...f.context(),consentId:c.id});
   const other=f.societies[1],second=await f.consent(other);
   await expect(p.societyLicenseAllocation.create({data:{approvalId:a.id,societyId:other,ownershipVersion:1,consentId:second.id,actorId:f.checker,idempotencyKey:randomUUID()}})).rejects.toThrow(/capacity exhausted/);
  }finally{await p.$disconnect();}
 });
 it('rolls back approved allocation and audit pointer together on downstream failure',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),s=f.societies[0];await f.approve();const c=await f.consent();
   await expect(p.$transaction(async tx=>{
    const nested={ $transaction:(cb:(client:typeof tx)=>Promise<unknown>)=>cb(tx) };
    const service=new PartnerLicenseLifecycleService(new SocietyOwnershipTransferService(nested as never),f.entitlements);
    await service.activate(f.principal(f.checker),s,{...f.context(),consentId:c.id});
    throw new Error('Injected licensed allocation rollback');
   })).rejects.toThrow(/Injected/);
   expect(await p.societyLicenseAllocation.count({where:{societyId:s}})).toBe(0);
  }finally{await p.$disconnect();}
 });
 it('rejects stale legacy snapshots and ownership after an audited transfer',async()=>{
  const p=new PrismaService();try{
   const f=await fixture(p),s=f.societies[0];await f.approve();const c=await f.consent(),request={...f.context(),consentId:c.id};
   await f.service.activate(f.principal(f.checker),s,request);
   await p.society.update({where:{id:s},data:{featureOverrides:{unknown:true}}});
   await expect(f.service.activate(f.principal(f.checker),s,request)).rejects.toThrow(/opt-in/);
   const target=randomUUID();await p.partner.create({data:{id:target,slug:'life-'+target,displayName:'New owner',status:'ACTIVE'}});
   const t=await f.ownership.propose(f.principal(f.maker),s,{toPartnerId:target,expectedOwnershipVersion:1,idempotencyKey:randomUUID(),reason:'Audited licensed society transfer'});
   await f.ownership.approve(f.principal(f.checker),s,t.id);
   await expect(f.service.activate(f.principal(f.checker),s,request)).rejects.toThrow(/Ownership/);
   const other=f.societies[1],newConsent=await f.consent(other);
   await expect(f.service.activate(f.principal(f.checker,other),other,{...f.context(),consentId:newConsent.id})).resolves.toMatchObject({status:'ACTIVE_ALLOCATION'});
  }finally{await p.$disconnect();}
 });
 it('matches the frozen database feature catalogue to current legacy resolution for all tiers and malformed overrides',async()=>{
  const p=new PrismaService();try{
   for(const tier of Object.values(ProductTier))for(const overrides of [{},{SOS:false},{SOS:true},{SOCIETY_ACCOUNTING:true,WHATSAPP_AUTOMATION:false,UNKNOWN:true},{SOS:'false'},['SOS'],null]){
    const id=randomUUID();
    await p.society.create({data:{id,name:'Feature parity',code:'life-'+id,productTier:tier,featureOverrides:overrides===null?Prisma.JsonNull:overrides}});
    const current=await new EntitlementService(p).current(id);
    const [record]=await p.$queryRaw<{features:unknown}[]>`SELECT aaraagate_v5454_features(${tier}::"ProductTier",${JSON.stringify(overrides)}::jsonb) AS features`;
    expect(record.features).toEqual(current!.enabledFeatures);
   }
  }finally{await p.$disconnect();}
 });
});
