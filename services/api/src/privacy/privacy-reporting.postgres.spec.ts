import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.20 tenant-scoped privacy operational reporting', () => {
  it('separates society readiness, evidence and case context on native PostgreSQL', async () => {
    const prisma = new PrismaService();
    const privacy = new PrivacyService(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const actor = randomUUID(), subjectA = randomUUID(), subjectB = randomUUID();
    const caseA = randomUUID(), caseB = randomUUID();
    try {
      await prisma.society.createMany({data: [
        {id:societyA,name:'Privacy report A',code:'privacy-report-' + societyA},
        {id:societyB,name:'Privacy report B',code:'privacy-report-' + societyB},
      ]});
      await prisma.user.createMany({data:[actor,subjectA,subjectB].map(id=>({id,phone:'privacy-report-' + id}))});
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyDataCategory"
          ("societyId","code","name","purpose","retentionTrigger","createdByUserId")
        VALUES (${societyA}::uuid,'PROOF_A','Identity proof','Resident access','Data deletion',${actor}::uuid)
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyDataCategory"
          ("societyId","code","name","purpose","legalBasis","retentionTrigger","retentionDays","createdByUserId")
        VALUES (${societyB}::uuid,'PROOF_B','Payment history','Accounting','Recorded basis','Invoice close',365,${actor}::uuid)
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyGrievanceContact" ("societyId","displayName","active","updatedByUserId")
        VALUES (${societyA}::uuid,'Inactive A',false,${actor}::uuid),
               (${societyB}::uuid,'Active B',true,${actor}::uuid)
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestCase"
          ("id","societyId","subjectUserId","requestType","requestSummary","dueAt","createdByUserId")
        VALUES (${caseA}::uuid,${societyA}::uuid,${subjectA}::uuid,'ERASURE','Erase data',
                CURRENT_TIMESTAMP - INTERVAL '2 days',${actor}::uuid),
               (${caseB}::uuid,${societyB}::uuid,${subjectB}::uuid,'ACCESS','Access data',
                NULL,${actor}::uuid)
      `);

      const a = await privacy.programReadiness(societyA);
      const b = await privacy.programReadiness(societyB);
      expect(a.status).toBe('ACTION_REQUIRED');
      expect(a.metrics).toMatchObject({
        activeDataCategories:1,categoriesMissingLegalBasis:1,categoriesMissingRetention:1,
        overdueCases:1,grievanceContactActive:false,
      });
      expect(b.status).toBe('READY');
      expect(b.metrics).toMatchObject({
        activeDataCategories:1,categoriesMissingLegalBasis:0,categoriesMissingRetention:0,
        overdueCases:0,grievanceContactActive:true,
      });
      const evidenceA = await privacy.programEvidence(societyA);
      const evidenceB = await privacy.programEvidence(societyB);
      expect(evidenceA.readiness.metrics.overdueCases).toBe(1);
      expect(evidenceB.readiness.metrics.overdueCases).toBe(0);
      expect(evidenceA.caseEvidence).toMatchObject({open:1,erasure:1});
      expect(evidenceB.caseEvidence).toMatchObject({open:1,erasure:0});
      expect(evidenceA.certificationClaim).toBe(false);
      expect(evidenceA.registryEventCount).toBe(0);
      const readinessA = await privacy.caseReadiness(societyA,caseA);
      expect(readinessA.blockers).toEqual(expect.arrayContaining([
        'ASSIGNEE_MISSING','CASE_OVERDUE','RETENTION_REVIEW_NOT_ALLOWED',
      ]));
      expect(readinessA.privacyProgramContext).toMatchObject({activeDataCategories:1,grievanceContactActive:false});
      const readinessB = await privacy.caseReadiness(societyB,caseB);
      expect(readinessB.blockers).toEqual(['ASSIGNEE_MISSING']);
      expect(readinessB.privacyProgramContext.grievanceContactActive).toBe(true);
      await expect(privacy.caseReadiness(societyA,caseB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(privacy.caseReadiness(societyB,caseA)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      try {
        await prisma.$transaction(async tx => {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyRequestCase" WHERE "id" IN (${caseA}::uuid,${caseB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyGrievanceContact" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyDataCategory" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
        });
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:{in:[actor,subjectA,subjectB]}}});
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
