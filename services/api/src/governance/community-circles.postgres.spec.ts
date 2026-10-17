import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UnitRelation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityCirclesService } from './community-circles.service';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 community circle transactions on PostgreSQL',()=>{
  it('isolates membership, requests, messages and moderation while retaining lifecycle rules',async()=>{
    const prisma=new PrismaService(),service=new CommunityCirclesService(prisma);
    const societyA=randomUUID(),societyB=randomUUID();
    const owner=randomUUID(),tenant=randomUUID(),foreign=randomUUID();
    try{
      await prisma.society.createMany({data:[
        {id:societyA,name:'Circle A',code:`circle-${societyA}`},
        {id:societyB,name:'Circle B',code:`circle-${societyB}`},
      ]});
      await prisma.user.createMany({data:[owner,tenant,foreign].map(id=>({id,phone:`circle-${id}`,name:'Circle fixture'}))});
      for(const [society,user] of [[societyA,tenant],[societyB,foreign]]){
        const building=await prisma.building.create({data:{societyId:society,name:'Circle fixture',code:'circle'}});
        const unit=await prisma.unit.create({data:{societyId:society,buildingId:building.id,number:'1'}});
        await prisma.unitOccupancy.create({data:{societyId:society,unitId:unit.id,userId:user,relation:UnitRelation.TENANT,effectiveFrom:new Date(Date.now()-60_000)}});
        if(society===societyA)await prisma.unitOwnership.create({data:{societyId:society,unitId:unit.id,userId:owner,verified:true,effectiveFrom:new Date(Date.now()-60_000)}});
      }
      const attempts=await Promise.allSettled([
        service.create(societyA,owner,'Chess'),service.create(societyA,owner,' chess '),
      ]);
      expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
      expect((attempts.find(a=>a.status==='rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      const circle=(attempts.find(a=>a.status==='fulfilled') as PromiseFulfilledResult<Record<string,unknown>>).value;
      const circleA=circle.id as string;
      const circleB=(await service.create(societyB,foreign,'Chess')).id as string;
      expect((await service.listVisible(societyA,tenant)).map(c=>c.id)).toEqual([circleA]);
      expect((await service.listManage(societyB)).map(c=>c.id)).toEqual([circleB]);
      await expect(service.listVisible(societyA,foreign)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.join(societyA,tenant,circleB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.setStatus(societyA,circleB,'CLOSED')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.setExpiry(societyA,circleB,null)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.listPosts(societyA,tenant,circleA)).rejects.toBeInstanceOf(ForbiddenException);
      await service.join(societyA,owner,circleA);
      await service.join(societyA,tenant,circleA);
      await service.join(societyA,tenant,circleA);
      await service.join(societyB,foreign,circleB);
      const post=await service.createPost(societyA,owner,circleA,'Hello neighbours');
      const foreignPost=await service.createPost(societyB,foreign,circleB,'Other society');
      const postA=post.id as string,postB=foreignPost.id as string;
      expect(post).toMatchObject({senderName:'Circle fixture',senderFlat:'Circle fixture · 1',mine:true});
      expect((await service.listPosts(societyA,tenant,circleA)).map(p=>p.id)).toEqual([postA]);
      await expect(service.createPost(societyA,tenant,circleB,'Foreign')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.report(societyA,tenant,circleA,postB,'Spam content')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.moderate(societyA,circleA,postB,owner,true,'Spam content')).rejects.toBeInstanceOf(NotFoundException);
      await service.report(societyA,tenant,circleA,postA,'Spam content');
      await service.report(societyA,tenant,circleA,postA,'Updated reason');
      expect(await service.listReports(societyA)).toHaveLength(1);
      expect(await service.listReports(societyB)).toEqual([]);
      await service.moderate(societyA,circleA,postA,owner,true,'Spam content');
      expect(await service.listPosts(societyA,tenant,circleA)).toEqual([]);
      expect(await service.listReports(societyA)).toEqual([expect.objectContaining({status:'RESOLVED',hidden:true})]);
      await service.moderate(societyA,circleA,postA,owner,false,'Reviewed content');
      const pending=await service.request(societyA,tenant,'Cricket');
      const pendingId=pending.id as string;
      expect(pending.status).toBe('PENDING');
      expect((await service.myRequests(societyA,tenant)).map(c=>c.id)).toEqual([pendingId]);
      expect((await service.listVisible(societyA,tenant)).map(c=>c.id)).toEqual([circleA]);
      await expect(service.setStatus(societyA,pendingId,'ACTIVE')).rejects.toBeInstanceOf(ConflictException);
      await expect(service.review(societyB,pendingId,foreign,'APPROVE','Good activity')).rejects.toBeInstanceOf(NotFoundException);
      await service.review(societyA,pendingId,owner,'APPROVE','Good activity');
      await expect(service.review(societyA,pendingId,owner,'REJECT','Reviewed request')).rejects.toBeInstanceOf(ConflictException);
      await service.setStatus(societyA,circleA,'CLOSED');
      expect(await service.listPosts(societyA,tenant,circleA)).toHaveLength(1);
      await expect(service.createPost(societyA,tenant,circleA,'Closed')).rejects.toBeInstanceOf(ConflictException);
      await expect(service.join(societyA,tenant,circleA)).rejects.toBeInstanceOf(ConflictException);
      await service.leave(societyA,tenant,circleA);
      await expect(service.leave(societyA,tenant,circleA)).resolves.toMatchObject({joined:false});
      await expect(service.listPosts(societyA,tenant,circleA)).rejects.toBeInstanceOf(ForbiddenException);
      await prisma.unitOccupancy.updateMany({where:{societyId:societyA,userId:tenant},data:{active:false}});
      await expect(service.request(societyA,tenant,'Revoked request')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.join(societyA,tenant,pendingId)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.listPosts(societyA,tenant,circleA)).rejects.toBeInstanceOf(ForbiddenException);
      await service.setExpiry(societyA,circleA,new Date(Date.now()+3_600_000).toISOString());
      await prisma.$executeRaw(Prisma.sql`UPDATE "CommunityCircle" SET "expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "id"=${circleA}::uuid`);
      await expect(service.listPosts(societyA,owner,circleA)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.setStatus(societyA,circleA,'ACTIVE')).rejects.toBeInstanceOf(NotFoundException);
      expect((await service.listVisible(societyB,foreign)).map(c=>c.id)).toEqual([circleB]);
      expect((await service.listPosts(societyB,foreign,circleB)).map(p=>p.id)).toEqual([postB]);
      expect((await service.listManage(societyA)).map(c=>c.id)).toEqual([pendingId]);
    }finally{
      try{
        await prisma.$executeRaw(Prisma.sql`DELETE FROM "CommunityCircle" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:{in:[owner,tenant,foreign]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
