import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContextService } from './auth-context.service';
import { PrismaMembershipRepository } from './prisma-membership.repository';
import { AppRole } from './auth.types';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5.2.27 commercial partner and operational society authority separation on PostgreSQL',()=>{
  it('does not turn partner ownership or revoked cross-society membership into operational roles',async()=>{
    const prisma=new PrismaService();
    const auth=new AuthContextService(new PrismaMembershipRepository(prisma));
    const userId=randomUUID(),partnerA=randomUUID(),partnerB=randomUUID(),societyA=randomUUID(),societyB=randomUUID();
    try{
      await prisma.user.create({data:{id:userId,phone:'rbac-'+userId}});
      await prisma.partner.createMany({data:[
        {id:partnerA,slug:'rbac-'+partnerA,displayName:'Partner A',status:'ACTIVE'},
        {id:partnerB,slug:'rbac-'+partnerB,displayName:'Partner B',status:'ACTIVE'},
      ]});
      await prisma.society.createMany({data:[
        {id:societyA,name:'RBAC Society A',code:'rbac-'+societyA,partnerId:partnerA},
        {id:societyB,name:'RBAC Society B',code:'rbac-'+societyB,partnerId:partnerB},
      ]});
      await prisma.partnerMembership.create({data:{partnerId:partnerA,userId,role:'OWNER',active:true}});
      await prisma.societyMembership.createMany({data:[
        {societyId:societyA,userId,role:'SOCIETY_ADMIN',active:false},
        {societyId:societyB,userId,role:'TENANT',active:true},
      ]});
      await expect(auth.resolve(userId,societyA)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(auth.resolve(userId,societyB)).resolves.toEqual({
        userId,societyId:societyB,roles:[AppRole.TENANT],
      });
      const all=await auth.resolve(userId);
      expect(all.societyId).toBe(societyB);
      expect(all.roles).toEqual([AppRole.TENANT]);
      await prisma.societyMembership.updateMany({where:{societyId:societyB,userId},
        data:{active:false}});
      await expect(auth.resolve(userId,societyB)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(auth.resolve(userId)).rejects.toBeInstanceOf(UnauthorizedException);
      // A still-active commercial partner role must never revive society authority.
      expect(await prisma.partnerMembership.count({where:{partnerId:partnerA,userId,active:true}})).toBe(1);
    }finally{
      try{
        await prisma.societyMembership.deleteMany({where:{userId}});
        await prisma.partnerMembership.deleteMany({where:{userId}});
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.partner.deleteMany({where:{id:{in:[partnerA,partnerB]}}});
        await prisma.user.deleteMany({where:{id:userId}});
      }finally{await prisma.$disconnect();}
    }
  });
});
