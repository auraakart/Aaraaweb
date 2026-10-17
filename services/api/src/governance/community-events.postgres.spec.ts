import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UnitRelation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityEventsService } from './community-events.service';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 community event transactions on PostgreSQL',()=>{
  it('isolates events and preserves audiences, capacity concurrency and lifecycle',async()=>{
    const prisma=new PrismaService(),service=new CommunityEventsService(prisma);
    const societyA=randomUUID(),societyB=randomUUID();
    const owner=randomUUID(),tenant=randomUUID();
    try{
      await prisma.society.createMany({data:[
        {id:societyA,name:'Event A',code:`event-${societyA}`},
        {id:societyB,name:'Event B',code:`event-${societyB}`},
      ]});
      await prisma.user.createMany({data:[{id:owner,phone:`event-${owner}`},{id:tenant,phone:`event-${tenant}`}]});
      const building=await prisma.building.create({data:{societyId:societyA,name:'Events fixture',code:'events'}});
      const unit=await prisma.unit.create({data:{societyId:societyA,buildingId:building.id,number:'1'}});
      const starts=new Date(Date.now()-60_000);
      await prisma.unitOwnership.create({data:{societyId:societyA,unitId:unit.id,userId:owner,verified:true,effectiveFrom:starts}});
      await prisma.unitOccupancy.create({data:{societyId:societyA,unitId:unit.id,userId:tenant,relation:UnitRelation.TENANT,effectiveFrom:starts}});
      const input={title:'Events fixture',audienceScope:'COMMUNITY' as const,
        startsAt:new Date(Date.now()+3_600_000),endsAt:new Date(Date.now()+7_200_000),capacity:1};
      const community=await service.create(societyA,owner,input);
      const owners=await service.create(societyA,owner,{...input,audienceScope:'OWNER_ONLY'});
      const foreign=await service.create(societyB,owner,input);
      const eventA=community.id as string,eventOwners=owners.id as string,eventB=foreign.id as string;
      expect(await service.listVisible(societyA,tenant)).toEqual([]);
      for(const [society,id] of [[societyA,eventA],[societyA,eventOwners],[societyB,eventB]])await service.setStatus(society,id,'PUBLISHED');
      const tenantEvents=await service.listVisible(societyA,tenant) as Array<{id:string}>;
      expect(tenantEvents.map(e=>e.id)).toEqual([eventA]);
      const ownerEvents=await service.listVisible(societyA,owner) as Array<{id:string}>;
      expect(ownerEvents.map(e=>e.id).sort()).toEqual([eventA,eventOwners].sort());
      expect(await service.listManage(societyA)).toHaveLength(2);
      await expect(service.setStatus(societyA,eventB,'CANCELLED')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.rsvp(societyA,tenant,eventB,'GOING')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.rsvp(societyA,tenant,eventOwners,'GOING')).rejects.toBeInstanceOf(ForbiddenException);
      const attempts=await Promise.allSettled([
        service.rsvp(societyA,owner,eventA,'GOING'),service.rsvp(societyA,tenant,eventA,'GOING'),
      ]);
      expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
      const rejection=attempts.find(a=>a.status==='rejected') as PromiseRejectedResult;
      expect(rejection.reason).toBeInstanceOf(ConflictException);
      const winner=attempts[0].status==='fulfilled'?owner:tenant;
      await expect(service.rsvp(societyA,winner,eventA,'GOING')).resolves.toMatchObject({id:eventA,goingCount:1,myRsvp:'GOING'});
      await expect(service.rsvp(societyA,winner,eventA,'NOT_GOING')).resolves.toMatchObject({goingCount:0,notGoingCount:1});
      await service.rsvp(societyA,owner,eventOwners,'GOING');
      await prisma.unitOccupancy.updateMany({where:{societyId:societyA,userId:tenant},data:{active:false}});
      expect(await service.listVisible(societyA,tenant)).toEqual([]);
      await expect(service.rsvp(societyA,tenant,eventA,'GOING')).rejects.toBeInstanceOf(ForbiddenException);
      await service.setStatus(societyA,eventA,'CANCELLED');
      await expect(service.setStatus(societyA,eventA,'CANCELLED')).resolves.toEqual({id:eventA,status:'CANCELLED',idempotent:true});
      await expect(service.setStatus(societyA,eventA,'PUBLISHED')).rejects.toBeInstanceOf(ConflictException);
      const other=await prisma.$queryRaw<Array<{status:string;responses:number}>>(Prisma.sql`
        SELECT e."status",COUNT(r."id")::int AS responses FROM "CommunityEvent" e
        LEFT JOIN "CommunityEventRsvp" r ON r."eventId"=e."id" AND r."societyId"=e."societyId"
        WHERE e."id"=${eventB}::uuid GROUP BY e."id"`);
      expect(other).toEqual([{status:'PUBLISHED',responses:0}]);
    }finally{
      try{
        await prisma.$executeRaw(Prisma.sql`DELETE FROM "CommunityEvent" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:{in:[owner,tenant]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
