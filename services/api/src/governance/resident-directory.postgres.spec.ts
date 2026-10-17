import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UnitRelation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ResidentDirectoryService } from './resident-directory.service';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 resident directory transactions on PostgreSQL',()=>{
  it('preserves opt-in privacy and consent while rejecting foreign or revoked access',async()=>{
    const prisma=new PrismaService(),service=new ResidentDirectoryService(prisma);
    const societyA=randomUUID(),societyB=randomUUID();
    const owner=randomUUID(),tenant=randomUUID(),foreign=randomUUID();
    try{
      await prisma.society.createMany({data:[
        {id:societyA,name:'Directory A',code:`directory-${societyA}`},
        {id:societyB,name:'Directory B',code:`directory-${societyB}`},
      ]});
      await prisma.user.createMany({data:[owner,tenant,foreign].map(id=>({id,phone:`directory-${id}`,email:`${id}@example.invalid`,name:'Resident fixture'}))});
      for(const [society,user] of [[societyA,tenant],[societyB,foreign]]){
        const building=await prisma.building.create({data:{societyId:society,name:'Directory fixture',code:'directory'}});
        const unit=await prisma.unit.create({data:{societyId:society,buildingId:building.id,number:'1'}});
        await prisma.unitOccupancy.create({data:{societyId:society,unitId:unit.id,userId:user,relation:UnitRelation.TENANT,effectiveFrom:new Date(Date.now()-60_000)}});
        if(society===societyA)await prisma.unitOwnership.create({data:{societyId:society,unitId:unit.id,userId:owner,verified:true,effectiveFrom:new Date(Date.now()-60_000)}});
      }
      await expect(service.mine(societyA,owner)).resolves.toMatchObject({visible:false,configured:false});
      await service.updateMine(societyA,owner,{visible:true,displayName:'Owner',interests:['Chess']});
      await service.updateMine(societyA,tenant,{visible:false,displayName:'Tenant'});
      await service.updateMine(societyB,foreign,{visible:true,displayName:'Foreign'});
      const listed=await service.listVisible(societyA,tenant);
      expect(listed.map(p=>p.userId)).toEqual([owner]);
      expect(listed[0]).not.toHaveProperty('phone');expect(listed[0]).not.toHaveProperty('email');
      await expect(service.requestContact(societyA,owner,tenant)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.requestContact(societyA,owner,foreign)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.mine(societyB,owner)).rejects.toBeInstanceOf(ForbiddenException);
      await service.updateMine(societyA,tenant,{visible:true,displayName:'Tenant'});
      const attempts=await Promise.allSettled([
        service.requestContact(societyA,owner,tenant,'Hello'),service.requestContact(societyA,tenant,owner,'Hello'),
      ]);
      expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
      expect((attempts.find(a=>a.status==='rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      const request=(attempts.find(a=>a.status==='fulfilled') as PromiseFulfilledResult<Record<string,unknown>>).value;
      const requester=request.requesterUserId as string,recipient=request.recipientUserId as string,id=request.id as string;
      await expect(service.respond(societyA,requester,id,'ACCEPTED')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.withdraw(societyA,recipient,id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.respond(societyB,foreign,id,'ACCEPTED')).rejects.toBeInstanceOf(NotFoundException);
      const accepted=await service.respond(societyA,recipient,id,'ACCEPTED','Meet at the club');
      expect(accepted).toMatchObject({id,status:'ACCEPTED'});
      expect(accepted).not.toHaveProperty('phone');expect(accepted).not.toHaveProperty('email');
      await expect(service.respond(societyA,recipient,id,'DECLINED')).rejects.toBeInstanceOf(NotFoundException);
      const second=await service.requestContact(societyA,owner,tenant) as Record<string,unknown>;
      await expect(service.withdraw(societyA,owner,second.id as string)).resolves.toMatchObject({status:'WITHDRAWN'});
      await prisma.unitOccupancy.updateMany({where:{societyId:societyA,userId:tenant},data:{active:false}});
      const remaining=await service.listVisible(societyA,owner);
      expect(remaining.map(p=>p.userId)).toEqual([owner]);
      await expect(service.contactRequests(societyA,tenant)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.updateMine(societyA,tenant,{visible:true})).rejects.toBeInstanceOf(ForbiddenException);
      expect(await service.contactRequests(societyB,foreign)).toEqual([]);
    }finally{
      try{
        await prisma.$executeRaw(Prisma.sql`DELETE FROM "ResidentDirectoryContactRequest" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
        await prisma.$executeRaw(Prisma.sql`DELETE FROM "ResidentDirectoryProfile" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:{in:[owner,tenant,foreign]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
