import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const demoPartnerId = '00000000-0000-4000-8000-000000000001';

withDatabase('V5.4.3 partner license draft-only PostgreSQL constraints', () => {
  it('persists draft plus event but rolls back on an attempted grant activation', async () => {
    const prisma = new PrismaService();
    const actorId = randomUUID(), key = randomUUID();
    try {
      await expect(prisma.$transaction(async tx => {
        await tx.user.create({data:{id:actorId,phone:'lic-'+actorId}});
        const plan = await tx.partnerLicensePlanRevision.create({
          data: {
            code:'PILOT_PLAN_'+actorId.slice(0,8).toUpperCase(),version:1,
            featureAllowlist:['SOS','VISITOR_MANAGEMENT'],
            maximumSocieties:2,maximumDomains:0,maximumDistributions:0,
            createdById:actorId,
          },
        });
        const draft = await tx.partnerLicenseGrant.create({
          data: {
            partnerId:demoPartnerId,planRevisionId:plan.id,createdById:actorId,
            startsAt:new Date('2026-11-01T00:00:00Z'),
            endsAt:new Date('2026-12-01T00:00:00Z'),
            idempotencyKey:key,
          },
        });
        expect(draft.status).toBe('DRAFT');
        await tx.partnerLicenseEvent.create({
          data:{
            grantId:draft.id,actorId,type:'DRAFT_CREATED',
            idempotencyKey:key,detail:{},
          },
        });
        // DB constraint is stronger than UI/API; bypassing the new controller
        // still cannot activate a commercial license before V5.4.5.
        await tx.partnerLicenseGrant.update({
          where:{id:draft.id},data:{status:'GRANTED'},
        });
      })).rejects.toThrow();
      expect(await prisma.partnerLicenseGrant.count({
        where:{idempotencyKey:key},
      })).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('rejects mutation of immutable plan revisions inside a rolled-back fixture', async () => {
    const prisma=new PrismaService();
    const actorId=randomUUID();
    try {
      await expect(prisma.$transaction(async tx=>{
        await tx.user.create({data:{id:actorId,phone:'lic-'+actorId}});
        const revision=await tx.partnerLicensePlanRevision.create({
          data:{
            code:'AUDIT_PLAN_'+actorId.slice(0,8).toUpperCase(),version:1,
            featureAllowlist:['SOS'],maximumSocieties:1,
            maximumDomains:0,maximumDistributions:0,createdById:actorId,
          },
        });
        await tx.partnerLicensePlanRevision.update({
          where:{id:revision.id},data:{maximumSocieties:100},
        });
      })).rejects.toThrow();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('rejects rewriting append-only grant audit events', async () => {
    const prisma=new PrismaService();
    const actorId=randomUUID(),key=randomUUID();
    try {
      await expect(prisma.$transaction(async tx=>{
        await tx.user.create({data:{id:actorId,phone:'lic-'+actorId}});
        const rev=await tx.partnerLicensePlanRevision.create({
          data:{
            code:'EVENT_PLAN_'+actorId.slice(0,8).toUpperCase(),version:1,
            featureAllowlist:[],maximumSocieties:0,
            maximumDomains:0,maximumDistributions:0,createdById:actorId,
          },
        });
        const grant=await tx.partnerLicenseGrant.create({
          data:{
            partnerId:demoPartnerId,planRevisionId:rev.id,createdById:actorId,
            startsAt:new Date('2026-11-01T00:00:00Z'),
            endsAt:new Date('2026-12-01T00:00:00Z'),
            idempotencyKey:key,
          },
        });
        const event=await tx.partnerLicenseEvent.create({
          data:{grantId:grant.id,actorId,type:'DRAFT_CREATED',idempotencyKey:key},
        });
        await tx.partnerLicenseEvent.update({
          where:{id:event.id},data:{detail:{forged:true}},
        });
      })).rejects.toThrow();
    }finally{
      await prisma.$disconnect();
    }
  });
});
