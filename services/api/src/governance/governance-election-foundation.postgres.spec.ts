import { BadRequestException,ConflictException } from '@nestjs/common';
import { Prisma,UnitRelation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';
const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 election foundation on PostgreSQL',()=>{
  it('isolates policies/snapshots, retains immutable electorate and separation of duties, and rolls back member failures',async()=>{
    const prisma=new PrismaService(),controller=new GovernanceElectionFoundationController(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),author=randomUUID(),reviewer=randomUUID(),tenant=randomUUID();
    try{
      await prisma.society.createMany({data:[{id:societyA,name:'Election A',code:`elect-${societyA}`},{id:societyB,name:'Election B',code:`elect-${societyB}`}]});
      await prisma.user.createMany({data:[author,reviewer,tenant].map(id=>({id,phone:`elect-${id}`}))});
      const building=await prisma.building.create({data:{societyId:societyA,name:'Election fixture',code:'election'}});
      const unit=await prisma.unit.create({data:{societyId:societyA,buildingId:building.id,number:'1'}});
      const effectiveFrom=new Date(Date.now()-60_000);
      await prisma.unitOwnership.create({data:{societyId:societyA,unitId:unit.id,userId:author,verified:true,effectiveFrom}});
      await prisma.unitOccupancy.create({data:{societyId:societyA,unitId:unit.id,userId:author,relation:UnitRelation.OWNER,effectiveFrom}});
      await prisma.unitOccupancy.create({data:{societyId:societyA,unitId:unit.id,userId:tenant,relation:UnitRelation.TENANT,effectiveFrom}});
      const input={enabled:true,eligibilityMode:'VERIFIED_OWNERS_AND_ACTIVE_OCCUPANTS' as const,policyReference:' Fixture bye-laws '};
      await expect(controller.currentPolicy(societyB)).resolves.toEqual({configured:false,enabled:false});
      await expect(controller.createSnapshot(societyB,reviewer)).rejects.toBeInstanceOf(ConflictException);
      const policyA=await controller.recordPolicy(societyA,author,input);
      await controller.recordPolicy(societyB,author,{...input,eligibilityMode:'VERIFIED_OWNERS'});
      await expect(controller.createSnapshot(societyA,author)).rejects.toBeInstanceOf(ConflictException);
      const snapshotA=await controller.createSnapshot(societyA,reviewer),snapshotB=await controller.createSnapshot(societyB,reviewer);
      expect(snapshotA).toMatchObject({policyRevisionId:policyA.id,memberCount:2,ballotCastingEnabled:false});
      expect(snapshotB.memberCount).toBe(0);
      await expect(controller.getSnapshot(societyA,snapshotB.id)).rejects.toBeInstanceOf(BadRequestException);
      const detail=await controller.getSnapshot(societyA,snapshotA.id);
      const members=detail.members as Array<{userId:string;eligibilitySource:string}>;
      expect(members).toHaveLength(2);expect(members.find(m=>m.userId===author)?.eligibilitySource).toBe('VERIFIED_OWNER');
      await prisma.unitOccupancy.updateMany({where:{societyId:societyA,userId:tenant},data:{active:false}});
      expect(await controller.getSnapshot(societyA,snapshotA.id)).toEqual(detail);
      expect((await controller.createSnapshot(societyA,reviewer)).memberCount).toBe(1);
      const before=await controller.listSnapshots(societyA);
      const failing=new GovernanceElectionFoundationController({withTenantContext:<T>(id:string,run:(tx:Prisma.TransactionClient)=>Promise<T>)=>prisma.withTenantContext(id,tx=>{
        let writes=0;
        return run(new Proxy(tx,{get(target,key){if(key==='$executeRaw')return async(sql:Prisma.Sql)=>{if(++writes===2)throw new Error('Occupant insertion failed');return target.$executeRaw(sql);};return Reflect.get(target,key);}}));
      })} as unknown as PrismaService);
      await expect(failing.createSnapshot(societyA,reviewer)).rejects.toThrow('Occupant insertion failed');
      expect(await controller.listSnapshots(societyA)).toEqual(before);
      const revisions=await Promise.all([controller.recordPolicy(societyA,author,input),controller.recordPolicy(societyA,author,input)]);
      expect(revisions.map(p=>p.version).sort()).toEqual([2,3]);
      await controller.recordPolicy(societyA,author,{...input,enabled:false});
      await expect(controller.createSnapshot(societyA,reviewer)).rejects.toBeInstanceOf(ConflictException);
      await expect(prisma.$executeRaw(Prisma.sql`UPDATE "GovernanceElectionPolicyRevision" SET "enabled"=FALSE WHERE "id"=${policyA.id}::uuid`)).rejects.toThrow();
      await expect(prisma.$executeRaw(Prisma.sql`DELETE FROM "GovernanceElectorateSnapshot" WHERE "id"=${snapshotA.id}::uuid`)).rejects.toThrow();
      expect(await controller.listSnapshots(societyB)).toHaveLength(1);
    }finally{
      try{
        await prisma.$transaction(async tx=>{
          // Disposable fixtures only: DDL locks and rollback restore every append-only delete trigger.
          for(const table of ['GovernanceElectorateMember','GovernanceElectorateSnapshot','GovernanceElectionPolicyRevision']){
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} DISABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
            await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} ENABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
          }
        });
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});await prisma.user.deleteMany({where:{id:{in:[author,reviewer,tenant]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
