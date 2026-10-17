import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.21 privacy self-service and operator contexts in PostgreSQL', () => {
  it('keeps society self requests, consent views and operator audiences isolated, without losing personal requests', async () => {
    const prisma = new PrismaService();
    const privacy = new PrivacyService(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const residentA = randomUUID(), residentB = randomUUID(), operatorA = randomUUID();
    const input = (requestKey: string) => ({
      requestType: 'ACCESS' as const, requestSummary: 'A copy of my information', requestKey,
    });
    try {
      await prisma.society.createMany({data:[
        {id:societyA,name:'Self privacy A',code:'self-privacy-'+societyA},
        {id:societyB,name:'Self privacy B',code:'self-privacy-'+societyB},
      ]});
      await prisma.user.createMany({data:[residentA,residentB,operatorA].map(id=>({
        id,phone:'self-privacy-'+id,
      }))});
      await prisma.societyMembership.createMany({data:[
        {societyId:societyA,userId:residentA,role:'TENANT'},
        {societyId:societyA,userId:operatorA,role:'COMMITTEE_MEMBER'},
        {societyId:societyB,userId:residentB,role:'TENANT'},
      ]});
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyDataCategory"
        ("societyId","code","name","purpose","retentionTrigger","createdByUserId")
        VALUES
          (${societyA}::uuid,'CONTACT_A','A contact info','Access review','Departure',${operatorA}::uuid),
          (${societyB}::uuid,'CONTACT_B','B contact info','Access review','Departure',${operatorA}::uuid)
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyConsentRecord"
        ("societyId","subjectUserId","purpose","status","grantedAt","createdByUserId")
        VALUES
          (${societyA}::uuid,${residentA}::uuid,'Society A consent','GRANTED',CURRENT_TIMESTAMP,${operatorA}::uuid),
          (${societyB}::uuid,${residentB}::uuid,'Society B consent','WITHDRAWN',CURRENT_TIMESTAMP,${operatorA}::uuid)
      `);

      const aContext = await privacy.selfContext(residentA,societyA);
      expect(aContext.categories.map(row=>row.code)).toEqual(['CONTACT_A']);
      expect(aContext.consents.map(row=>row.purpose)).toEqual(['Society A consent']);
      expect(aContext.activeConsentCount).toBe(1);
      const bContext = await privacy.selfContext(residentB,societyB);
      expect(bContext.categories.map(row=>row.code)).toEqual(['CONTACT_B']);
      expect(bContext.consents.map(row=>row.purpose)).toEqual(['Society B consent']);
      expect(bContext.activeConsentCount).toBe(0);
      expect((await privacy.selfContext(residentA,societyB)).consents).toEqual([]);

      const operatorContextA = await privacy.operatorContext(societyA);
      const operatorContextB = await privacy.operatorContext(societyB);
      expect(operatorContextA.subjects.map(row=>row.id).sort()).toEqual([residentA,operatorA].sort());
      expect(operatorContextA.assignees.map(row=>row.id).sort()).toEqual([residentA,operatorA].sort());
      expect(operatorContextB.subjects.map(row=>row.id)).toEqual([residentB]);
      expect(operatorContextB.assignees.map(row=>row.id)).toEqual([residentB]);

      const societyCaseA = await privacy.createMine(residentA,societyA,input('society-'+societyA));
      const societyCaseB = await privacy.createMine(residentB,societyB,input('society-'+societyB));
      const personalCaseA = await privacy.createMine(residentA,undefined,input('personal-'+residentA));
      expect((await privacy.listMine(residentA,societyA)).map(row=>row.id)).toEqual([societyCaseA.id]);
      expect((await privacy.listMine(residentB,societyB)).map(row=>row.id)).toEqual([societyCaseB.id]);
      expect((await privacy.listMine(residentA,undefined)).map(row=>row.id)).toEqual([personalCaseA.id]);
      expect(await privacy.listMine(residentA,societyB)).toEqual([]);
      expect(await privacy.listMine(residentB,societyA)).toEqual([]);
      expect(await privacy.createMine(residentA,societyA,input('society-'+societyA)))
        .toMatchObject({id:societyCaseA.id});
      await expect(privacy.createMine(residentA,societyB,input('society-'+societyA)))
        .rejects.toBeInstanceOf(ConflictException);
      expect((await privacy.history(societyA,societyCaseA.id) as Array<{eventType:string}>)
        .map(row=>row.eventType)).toEqual(['SELF_SERVICE_CREATED']);
      expect((await privacy.history(undefined,personalCaseA.id) as Array<{eventType:string}>)
        .map(row=>row.eventType)).toEqual(['SELF_SERVICE_CREATED']);
      await expect(privacy.history(societyB,societyCaseA.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PrivacyRequestEvent" WHERE "caseId"=${societyCaseA.id}::uuid
      `)).rejects.toThrow();
    } finally {
      try {
        await prisma.$transaction(async tx => {
          // Fixture cleanup restores append-only event enforcement in the same transaction.
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyRequestEvent" DISABLE TRIGGER "PrivacyRequestEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyRequestEvent" WHERE "actorUserId" IN (${residentA}::uuid,${residentB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyRequestEvent" ENABLE TRIGGER "PrivacyRequestEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyRequestCase" WHERE "createdByUserId" IN (${residentA}::uuid,${residentB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyConsentRecord" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyDataCategory" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
        });
        await prisma.societyMembership.deleteMany({where:{societyId:{in:[societyA,societyB]}}});
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:{in:[residentA,residentB,operatorA]}}});
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
