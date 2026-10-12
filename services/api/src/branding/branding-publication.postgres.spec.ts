import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { AppRole } from '../auth/auth.types';
import { BrandingService } from './branding.service';

const db = process.env.DATABASE_URL ? describe : describe.skip;
db('V5.3.2 native PostgreSQL society-brand optimistic publish/restore',()=>{
  it('isolates two societies, serializes draft versioning and preserves published rollback history',async()=>{
    const prisma=new PrismaService();
    const service=new BrandingService(prisma,new EntitlementService(prisma),
      new PrismaMembershipRepository(prisma));
    const a=randomUUID(),b=randomUUID(),userA=randomUUID(),userB=randomUUID();
    const adminA={userId:userA,societyId:a,roles:[AppRole.SOCIETY_ADMIN]};
    const adminB={userId:userB,societyId:b,roles:[AppRole.SOCIETY_ADMIN]};
    const first={displayName:'Palm Grove',colors:{primary:'#155E75',primaryDeep:'#164E63'}};
    const second={displayName:'Second Name'};
    try{
      await prisma.society.createMany({data:[
        {id:a,name:'Original A',code:'editor-'+a},
        {id:b,name:'Original B',code:'editor-'+b},
      ]});
      await prisma.user.createMany({data:[userA,userB].map(id=>({id,phone:'editor-'+id}))});
      await prisma.societyMembership.createMany({data:[
        {userId:userA,societyId:a,role:'SOCIETY_ADMIN'},
        {userId:userB,societyId:b,role:'SOCIETY_ADMIN'},
      ]});
      await expect(service.createDraft({...adminA,societyId:b},
        {config:first,expectedLatestVersion:null,expectedPublishedVersion:null}))
        .rejects.toBeInstanceOf(ForbiddenException);

      const competing=await Promise.allSettled([
        service.createDraft(adminA,{config:first,expectedLatestVersion:null,expectedPublishedVersion:null}),
        service.createDraft(adminA,{config:second,expectedLatestVersion:null,expectedPublishedVersion:null}),
      ]);
      expect(competing.filter(x=>x.status==='fulfilled')).toHaveLength(1);
      expect(competing.filter(x=>x.status==='rejected')).toHaveLength(1);
      expect((competing.find(x=>x.status==='rejected') as PromiseRejectedResult).reason)
        .toBeInstanceOf(ConflictException);
      const created=(competing.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<{
        id:string;version:number;config:unknown;
      }>).value;
      expect(created.version).toBe(1);
      expect((await service.listRevisions(adminA)).latestVersion).toBe(1);
      expect((await service.context(adminA)).branding.brand.displayName).toBe('Aaraagate');
      await expect(service.publishDraft(adminB,{revisionId:created.id,expectedPublishedVersion:null}))
        .rejects.toBeInstanceOf(NotFoundException);
      const published=await service.publishDraft(adminA,{
        revisionId:created.id,expectedPublishedVersion:null,
      });
      expect(published.publishedAt).toBeInstanceOf(Date);
      expect((await service.context(adminA)).branding.brand.displayName)
        .toBe((created.config as {displayName:string}).displayName);
      expect((await service.context(adminB)).branding.brand.displayName).toBe('Aaraagate');
      // Publishing a committed revision twice does not create extra publication events.
      expect((await service.publishDraft(adminA,{revisionId:created.id,
        expectedPublishedVersion:null})).id).toBe(created.id);
      const fresh=await service.createDraft(adminA,{
        config:second,expectedLatestVersion:1,expectedPublishedVersion:1,
      });
      expect((await service.context(adminA)).branding.brand.displayName)
        .toBe((created.config as {displayName:string}).displayName);
      await expect(service.publishDraft(adminA,{revisionId:fresh.id,expectedPublishedVersion:null}))
        .rejects.toBeInstanceOf(ConflictException);
      await service.publishDraft(adminA,{revisionId:fresh.id,expectedPublishedVersion:1});
      expect((await service.context(adminA)).branding.brand.displayName).toBe('Second Name');
      const restored=await service.restorePublished(adminA,{
        sourceVersion:1,expectedPublishedVersion:2,expectedLatestVersion:2,
      });
      expect(restored.version).toBe(3);
      expect(restored.publishedAt).toBeInstanceOf(Date);
      expect((await service.context(adminA)).branding.brand.displayName)
        .toBe((created.config as {displayName:string}).displayName);
      expect((await service.listRevisions(adminA)).revisions.map(x=>x.version)).toEqual([3,2,1]);
      await prisma.societyMembership.updateMany({where:{userId:userA,societyId:a},data:{active:false}});
      await expect(service.createDraft(adminA,{config:second,expectedLatestVersion:3,expectedPublishedVersion:3}))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.listRevisions(adminA)).rejects.toBeInstanceOf(ForbiddenException);
    }finally{
      try{
        await prisma.societyBrandRevision.deleteMany({where:{societyId:{in:[a,b]}}});
        await prisma.societyMembership.deleteMany({where:{societyId:{in:[a,b]}}});
        await prisma.society.deleteMany({where:{id:{in:[a,b]}}});
        await prisma.user.deleteMany({where:{id:{in:[userA,userB]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
