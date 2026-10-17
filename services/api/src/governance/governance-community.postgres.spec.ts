import { BadRequestException } from '@nestjs/common';
import { Prisma,UnitRelation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceService } from './governance.service';
import { GovernanceArtifactsController } from './governance-artifacts.controller';
import { GovernanceCommunityController } from './governance-community.controller';
const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 community governance visibility on PostgreSQL',()=>{
  it('preserves owner/occupant visibility, rejects foreign and revoked access, and rolls back failed audience audit',async()=>{
    const prisma=new PrismaService(),governance=new GovernanceService(prisma);
    const controller=new GovernanceCommunityController(prisma,governance),artifacts=new GovernanceArtifactsController(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),owner=randomUUID(),tenant=randomUUID();
    try{
      await prisma.society.createMany({data:[{id:societyA,name:'Visibility A',code:`visibility-${societyA}`},{id:societyB,name:'Visibility B',code:`visibility-${societyB}`}]});
      await prisma.user.createMany({data:[{id:owner,phone:`visibility-${owner}`},{id:tenant,phone:`visibility-${tenant}`}]});
      const building=await prisma.building.create({data:{societyId:societyA,name:'Visibility fixture',code:'visibility'}});
      const unit=await prisma.unit.create({data:{societyId:societyA,buildingId:building.id,number:'1'}});
      const effectiveFrom=new Date(Date.now()-60_000);
      await prisma.unitOwnership.create({data:{societyId:societyA,unitId:unit.id,userId:owner,verified:true,effectiveFrom}});
      await prisma.unitOccupancy.create({data:{societyId:societyA,unitId:unit.id,userId:tenant,relation:UnitRelation.TENANT,effectiveFrom}});
      const input={meetingType:'COMMITTEE' as const,title:'Visibility fixture',scheduledAt:new Date()};
      const meetingA=(await governance.createMeeting(societyA,owner,input)).id as string;
      const meetingB=(await governance.createMeeting(societyB,owner,input)).id as string;
      const document=(await artifacts.addDocument(societyA,owner,meetingA,{kind:'MINUTES',fileReference:'fixture/minutes.pdf'})).id as string;
      const poll=(await artifacts.createPoll(societyA,owner,{pollType:'ADVISORY',title:'Fixture poll',options:['Yes','No']})).id;
      // Exercise owner-only visibility before enabling the community audience.
      await controller.setAudience(societyA,owner,'meeting',meetingA,{audienceScope:'OWNER_ONLY'});
      await expect(controller.getMeeting(societyA,tenant,meetingA)).rejects.toBeInstanceOf(BadRequestException);
      await controller.setAudience(societyA,owner,'meeting',meetingA,{audienceScope:'COMMUNITY'});
      await controller.setAudience(societyA,owner,'document',document,{audienceScope:'COMMUNITY'});
      await expect(controller.getMeeting(societyA,tenant,meetingA)).resolves.toMatchObject({id:meetingA});
      expect(await controller.listMeetings(societyA,tenant)).toEqual([expect.objectContaining({id:meetingA})]);
      expect(await controller.listDocuments(societyA,tenant)).toEqual([expect.objectContaining({id:document})]);
      await expect(controller.getMeeting(societyA,owner,meetingB)).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.setAudience(societyA,owner,'meeting',meetingB,{audienceScope:'COMMUNITY'})).rejects.toBeInstanceOf(BadRequestException);
      const failing=new GovernanceCommunityController({withTenantContext:<T>(id:string,run:(tx:Prisma.TransactionClient)=>Promise<T>)=>prisma.withTenantContext(id,tx=>run(new Proxy(tx,{get(target,key){if(key==='$executeRaw')return async()=>{throw new Error('Audit unavailable');};return Reflect.get(target,key);}})))} as unknown as PrismaService,governance);
      for(const [kind,id] of [['meeting',meetingA],['document',document],['poll',poll]]){
        await controller.setAudience(societyA,owner,kind,id,{audienceScope:'COMMUNITY'});
        await expect(failing.setAudience(societyA,owner,kind,id,{audienceScope:'OWNER_ONLY'})).rejects.toThrow('Audit unavailable');
        await expect(controller.setAudience(societyA,owner,kind,id,{audienceScope:'COMMUNITY'})).resolves.toMatchObject({idempotent:true});
      }
      await controller.setAudience(societyA,owner,'meeting',meetingA,{audienceScope:'OWNER_ONLY'});
      expect(await controller.listDocuments(societyA,tenant)).toEqual([]);
      await expect(controller.getMeeting(societyA,tenant,meetingA)).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getMeeting(societyA,owner,meetingA)).resolves.toMatchObject({id:meetingA});
      await controller.setAudience(societyA,owner,'meeting',meetingA,{audienceScope:'COMMUNITY'});
      await prisma.unitOccupancy.updateMany({where:{societyId:societyA,userId:tenant},data:{active:false}});
      expect(await controller.listMeetings(societyA,tenant)).toEqual([]);expect(await controller.listDocuments(societyA,tenant)).toEqual([]);
      await expect(controller.getMeeting(societyA,tenant,meetingA)).rejects.toBeInstanceOf(BadRequestException);
    }finally{
      try{
        await prisma.$transaction(async tx=>{
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "GovernanceEvidenceEvent" DISABLE TRIGGER "GovernanceEvidenceEvent_append_only_delete"`);
          for(const table of ['GovernanceAudienceAudit','GovernancePoll','GovernanceDocumentReference','GovernanceEvidenceEvent','GovernanceMeeting'])await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "GovernanceEvidenceEvent" ENABLE TRIGGER "GovernanceEvidenceEvent_append_only_delete"`);
        });
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});await prisma.user.deleteMany({where:{id:{in:[owner,tenant]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
