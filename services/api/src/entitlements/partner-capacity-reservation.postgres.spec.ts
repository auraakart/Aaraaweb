import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';
import { ProductFeature } from './entitlement.types';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';
import { PartnerCapacityReservationService } from './partner-capacity-reservation.service';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';
const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
async function fixture(prisma:PrismaService,maximumSocieties=1) {
  const actorId=randomUUID(),societies=[randomUUID(),randomUUID()];
  await prisma.user.create({data:{id:actorId,phone:'cap-'+actorId}});
  for(const societyId of societies){
    await prisma.society.create({data:{id:societyId,name:'Capacity fixture',code:'cap-'+societyId}});
    await prisma.societyMembership.create({data:{societyId,userId:actorId,role:'SUPER_ADMIN'}});
  }
  const licenses=new PartnerLicensePersistenceService(prisma);
  const plan=await licenses.createPlanRevision(actorId,{code:'CAP_'+actorId.slice(0,8).toUpperCase(),expectedVersion:0,
    featureAllowlist:Object.values(ProductFeature),maximumSocieties,maximumDomains:0,maximumDistributions:0});
  const draft=await licenses.createGrantDraft(actorId,'00000000-0000-4000-8000-000000000001',{
    planRevisionId:plan.id,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),idempotencyKey:randomUUID()});
  const entitlements=new EntitlementService(prisma),ownership=new SocietyOwnershipTransferService(prisma);
  const service=new PartnerCapacityReservationService(ownership,entitlements);
  const principal=(societyId:string)=>({userId:actorId,societyId,roles:[AppRole.SUPER_ADMIN]});
  const input=async(societyId:string)=>({grantId:draft.id,expectedGrantVersion:1,expectedOwnershipVersion:1,
    expectedFeatures:(await entitlements.current(societyId))!.enabledFeatures,idempotencyKey:randomUUID()});
  return {actorId,societies,draft,plan,entitlements,ownership,service,principal,input};
}
withDatabase('V5.4.5.3 PostgreSQL serialized DRAFT capacity',()=>{
  it('admits exactly one concurrent candidate at capacity one',async()=>{
    const prisma=new PrismaService();
    try{
      const f=await fixture(prisma);
      const inputs=await Promise.all(f.societies.map(s=>f.input(s)));
      const results=await Promise.allSettled(f.societies.map((s,i)=>f.service.reserve(f.principal(s),s,inputs[i])));
      expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
      expect(await prisma.partnerLicenseCapacityReservation.count({where:{grantId:f.draft.id}})).toBe(1);
      expect((await prisma.partnerLicenseGrant.findUniqueOrThrow({where:{id:f.draft.id}})).status).toBe('DRAFT');
    }finally{await prisma.$disconnect();}
  });
  it('replays once but denies revoked authority and changed legacy features',async()=>{
    const prisma=new PrismaService();
    try{
      const f=await fixture(prisma),s=f.societies[0],input=await f.input(s);
      const before=await f.entitlements.current(s);
      const receipt=await f.service.reserve(f.principal(s),s,input);
      expect(await f.service.reserve(f.principal(s),s,input)).toEqual(receipt);
      expect(await f.entitlements.current(s)).toEqual(before);
      await prisma.societyMembership.updateMany({where:{societyId:s,userId:f.actorId},data:{active:false}});
      await expect(f.service.reserve(f.principal(s),s,input)).rejects.toThrow(/authority/);
      await prisma.societyMembership.updateMany({where:{societyId:s,userId:f.actorId},data:{active:true}});
      await prisma.society.update({where:{id:s},data:{featureOverrides:{SOS:false}}});
      await expect(f.service.reserve(f.principal(s),s,input)).rejects.toThrow(/compatibility/);
      expect(await prisma.partnerLicenseCapacityReservation.count({where:{grantId:f.draft.id}})).toBe(1);
    }finally{await prisma.$disconnect();}
  });
  it('retains immutable reservation/draft evidence and DB capacity denial',async()=>{
    const prisma=new PrismaService();
    try{
      const f=await fixture(prisma),s=f.societies[0],input=await f.input(s);
      const receipt=await f.service.reserve(f.principal(s),s,input);
      await expect(prisma.partnerLicenseCapacityReservation.delete({where:{id:receipt.id}})).rejects.toThrow(/immutable/);
      await expect(prisma.partnerLicenseGrant.update({where:{id:f.draft.id},data:{planRevisionId:randomUUID()}})).rejects.toThrow(/immutable/);
      await expect(prisma.partnerLicenseCapacityReservation.create({data:{grantId:f.draft.id,planRevisionId:f.plan.id,
        grantVersion:1,societyId:f.societies[1],ownershipVersion:1,actorId:f.actorId,idempotencyKey:randomUUID(),enabledFeatures:input.expectedFeatures}})).rejects.toThrow(/exhausted/);
    }finally{await prisma.$disconnect();}
  });
  it('rolls back real reservation insertion when downstream work fails',async()=>{
    const prisma=new PrismaService();
    try{
      const f=await fixture(prisma),s=f.societies[0],input=await f.input(s);
      await expect(prisma.$transaction(async tx=>{
        const nestedPrisma={ $transaction:(cb:(p:typeof tx)=>Promise<unknown>)=>cb(tx) };
        const scoped=new PartnerCapacityReservationService(new SocietyOwnershipTransferService(nestedPrisma as never),f.entitlements);
        await scoped.reserve(f.principal(s),s,input);
        throw new Error('Injected capacity rollback');
      })).rejects.toThrow(/Injected capacity/);
      expect(await prisma.partnerLicenseCapacityReservation.count({where:{grantId:f.draft.id}})).toBe(0);
    }finally{await prisma.$disconnect();}
  });
  it('denies stale ownership replay and releases only the transferred-out capacity',async()=>{
    const prisma=new PrismaService();
    try{
      const f=await fixture(prisma),s=f.societies[0],input=await f.input(s);
      await f.service.reserve(f.principal(s),s,input);
      const approver=randomUUID(),partner=randomUUID();
      await prisma.user.create({data:{id:approver,phone:'cap-'+approver}});
      await prisma.societyMembership.create({data:{userId:approver,societyId:s,role:'SUPER_ADMIN'}});
      await prisma.partner.create({data:{id:partner,slug:'cap-'+partner,displayName:'New owner',status:'ACTIVE'}});
      const request=await f.ownership.propose(f.principal(s),s,{toPartnerId:partner,expectedOwnershipVersion:1,idempotencyKey:randomUUID(),reason:'Transfer synthetic capacity fixture'});
      await f.ownership.approve({...f.principal(s),userId:approver},s,request.id);
      await expect(f.service.reserve(f.principal(s),s,input)).rejects.toThrow(/Ownership/);
      const other=f.societies[1];
      await expect(f.service.reserve(f.principal(other),other,await f.input(other))).resolves.toMatchObject({mode:'DRAFT_RESERVATION'});
      expect(await prisma.partnerLicenseCapacityReservation.count({where:{grantId:f.draft.id}})).toBe(2); // old immutable history is retained
    }finally{await prisma.$disconnect();}
  });
});
