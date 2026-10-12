import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { EntitlementService } from '../entitlements/entitlement.service';
import { BrandingService } from './branding.service';
import { AppRole } from '../auth/auth.types';

const database=process.env.DATABASE_URL?describe:describe.skip;
database('V5.3.8 immutable published society-brand rollback on PostgreSQL',()=>{
  it('restores earlier published appearance atomically without crossing society boundary',async()=>{
    const prisma=new PrismaService();
    const service=new BrandingService(prisma,new EntitlementService(prisma),
      new PrismaMembershipRepository(prisma));
    const societyA=randomUUID(),societyB=randomUUID(),admin=randomUUID(),tenant=randomUUID();
    const firstConfig={displayName:'Garden A',colors:{primary:'#155E75',primaryDeep:'#164E63'}};
    const secondConfig={displayName:'Garden B',colors:{primary:'#134E4A',primaryDeep:'#134E4A'}};
    try{
      await prisma.society.createMany({data:[
        {id:societyA,name:'Restore A',code:'restore-'+societyA},
        {id:societyB,name:'Restore B',code:'restore-'+societyB},
      ]});
      await prisma.user.createMany({data:[{id:admin,phone:'restore-'+admin},{id:tenant,phone:'restore-'+tenant}]});
      await prisma.societyMembership.createMany({data:[
        {societyId:societyA,userId:admin,role:'SOCIETY_ADMIN'},
        {societyId:societyB,userId:tenant,role:'TENANT'},
      ]});
      const first=await service.createDraft(societyA,admin,{expectedVersion:0,config:firstConfig});
      await service.publish(societyA,admin,first.id,0);
      const second=await service.createDraft(societyA,admin,{expectedVersion:1,config:secondConfig});
      await service.publish(societyA,admin,second.id,1);
      const foreign=await service.createDraft(societyB,admin,{expectedVersion:0,config:firstConfig})
        .then(()=>true,()=>false);
      expect(foreign).toBe(false);
      await expect(service.restorePublished(societyB,tenant,first.id,{
        expectedVersion:1,expectedPublishedVersion:1,
      })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.restorePublished(societyA,admin,randomUUID(),{
        expectedVersion:2,expectedPublishedVersion:2,
      })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.restorePublished(societyA,admin,first.id,{
        expectedVersion:1,expectedPublishedVersion:2,
      })).rejects.toBeInstanceOf(ConflictException);
      const results=await Promise.allSettled([
        service.restorePublished(societyA,admin,first.id,{expectedVersion:2,expectedPublishedVersion:2}),
        service.restorePublished(societyA,admin,first.id,{expectedVersion:2,expectedPublishedVersion:2}),
      ]);
      expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
      expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
      const restored=(results.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<{id:string;version:number}>).value;
      expect(restored.version).toBe(3);
      const revisions=await service.history(societyA,admin);
      expect(revisions.map(x=>x.version)).toEqual([3,2,1]);
      expect(revisions[0].digest).toBe(revisions[2].digest);
      expect(revisions[0].config).toEqual(revisions[2].config);
      expect(revisions.every(x=>x.publishedAt!==null)).toBe(true);
      expect(revisions[1].config).toEqual(secondConfig);
      expect((await service.context({userId:admin,societyId:societyA,roles:[AppRole.SOCIETY_ADMIN]}))
        .branding.brand.displayName).toBe('Garden A');
      expect((await service.context({userId:tenant,societyId:societyB,roles:[AppRole.TENANT]}))
        .branding.brand.displayName).toBe('Aaraagate');
      await expect(service.restorePublished(societyA,admin,restored.id,{
        expectedVersion:3,expectedPublishedVersion:3,
      })).rejects.toBeInstanceOf(ConflictException);
      await prisma.societyMembership.updateMany({where:{societyId:societyA,userId:admin},data:{active:false}});
      await expect(service.restorePublished(societyA,admin,second.id,{
        expectedVersion:3,expectedPublishedVersion:3,
      })).rejects.toBeInstanceOf(ForbiddenException);
    }finally{
      try{
        await prisma.societyBrandRevision.deleteMany({where:{societyId:{in:[societyA,societyB]}}});
        await prisma.societyMembership.deleteMany({where:{societyId:{in:[societyA,societyB]}}});
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:{in:[admin,tenant]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
