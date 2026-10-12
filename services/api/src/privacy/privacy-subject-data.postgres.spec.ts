import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacySubjectDataService } from './privacy-subject-data.service';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;

withDatabase('V5.2.22 tenant-context privacy data export and erasure plans on PostgreSQL',()=>{
  it('authorizes exports and erasure plans inside the selected society without leaking personal cases',async()=>{
    const prisma=new PrismaService();
    const subjectData=new PrivacySubjectDataService(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),subjectA=randomUUID(),subjectB=randomUUID(),actor=randomUUID();
    const accessCaseA=randomUUID(),accessCaseB=randomUUID(),erasureCaseA=randomUUID(),personalErasure=randomUUID();
    try{
      await prisma.society.createMany({data:[
        {id:societyA,name:'Data fixture A',code:'data-'+societyA},
        {id:societyB,name:'Data fixture B',code:'data-'+societyB},
      ]});
      await prisma.user.createMany({data:[subjectA,subjectB,actor].map(id=>({id,phone:'data-'+id}))});
      await prisma.societyMembership.createMany({data:[
        {societyId:societyA,userId:subjectA,role:'TENANT'},
        {societyId:societyB,userId:subjectB,role:'TENANT'},
      ]});
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestCase"
          ("id","societyId","subjectUserId","requestType","requestSummary","status","closedAt","createdByUserId")
        VALUES
          (${accessCaseA}::uuid,${societyA}::uuid,${subjectA}::uuid,'ACCESS','Export A','COMPLETED',CURRENT_TIMESTAMP,${actor}::uuid),
          (${accessCaseB}::uuid,${societyB}::uuid,${subjectB}::uuid,'ACCESS','Export B','COMPLETED',CURRENT_TIMESTAMP,${actor}::uuid)
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestCase"
          ("id","societyId","subjectUserId","requestType","requestSummary","status","legalHold","retentionDecision","createdByUserId")
        VALUES
          (${erasureCaseA}::uuid,${societyA}::uuid,${subjectA}::uuid,'ERASURE','Erase A','IN_REVIEW',false,'ALLOW',${actor}::uuid),
          (${personalErasure}::uuid,NULL,${subjectA}::uuid,'ERASURE','Erase personal','IN_REVIEW',false,'ALLOW',${actor}::uuid)
      `);

      const exportA=await subjectData.exportMine(subjectA,societyA,accessCaseA);
      expect(exportA).toMatchObject({
        requestId:accessCaseA,context:{societyId:societyA},
        account:{id:subjectA},consumerHomes:[],consumerServiceBookings:[],
      });
      expect((exportA.privacyRequests as Array<{id:string}>).map(row=>row.id).sort())
        .toEqual([accessCaseA,erasureCaseA].sort());
      const exportB=await subjectData.exportMine(subjectB,societyB,accessCaseB);
      expect(exportB).toMatchObject({requestId:accessCaseB,context:{societyId:societyB},account:{id:subjectB}});
      expect((exportB.privacyRequests as Array<{id:string}>).map(row=>row.id)).toEqual([accessCaseB]);
      await expect(subjectData.exportMine(subjectA,societyA,accessCaseB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(subjectData.exportMine(subjectB,societyA,accessCaseA)).rejects.toBeInstanceOf(NotFoundException);
      await expect(subjectData.exportMine(subjectA,undefined,accessCaseA)).rejects.toBeInstanceOf(NotFoundException);

      const planA=await subjectData.erasurePlan(societyA,erasureCaseA);
      expect(planA).toMatchObject({scope:'SOCIETY',executable:false});
      expect(planA.blockers).toContain('ACTIVE_SOCIETY_RELATIONSHIP');
      await expect(subjectData.erasurePlan(societyB,erasureCaseA)).rejects.toBeInstanceOf(NotFoundException);
      const personal=await subjectData.erasurePlan(undefined,personalErasure);
      expect(personal.scope).toBe('PLATFORM');
      expect(personal.blockers).toContain('ACTIVE_ACCOUNT_RELATIONSHIP');
      await expect(subjectData.executeErasure(societyA,actor,erasureCaseA))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(subjectData.executeErasure(undefined,actor,personalErasure))
        .rejects.toBeInstanceOf(BadRequestException);
      const stillOpen=await prisma.$queryRaw<Array<{status:string}>>(Prisma.sql`
        SELECT "status" FROM "PrivacyRequestCase" WHERE "id"=${erasureCaseA}::uuid
      `);
      expect(stillOpen[0]?.status).toBe('IN_REVIEW');
    }finally{
      try{
        await prisma.$executeRaw(Prisma.sql`
          DELETE FROM "PrivacyRequestCase" WHERE "id" IN (
            ${accessCaseA}::uuid,${accessCaseB}::uuid,${erasureCaseA}::uuid,${personalErasure}::uuid
          )
        `);
        await prisma.societyMembership.deleteMany({where:{societyId:{in:[societyA,societyB]}}});
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:{in:[subjectA,subjectB,actor]}}});
      }finally{
        await prisma.$disconnect();
      }
    }
  });
});
