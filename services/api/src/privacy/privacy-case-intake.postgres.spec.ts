import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.18 society-scoped privacy case intake on PostgreSQL', () => {
  it('isolates case creation and evidence and retains independent-home history', async () => {
    const prisma = new PrismaService();
    const privacy = new PrivacyService(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const actor = randomUUID(), residentA = randomUUID(), residentB = randomUUID();
    const assigneeA = randomUUID(), assigneeB = randomUUID();
    const request = (subjectUserId: string, assignedToUserId?: string) => ({
      subjectUserId, assignedToUserId, requestType: 'ACCESS' as const,
      requestSummary: 'Obtain a copy of my personal information',
    });
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Case fixture A', code: 'case-' + societyA },
        { id: societyB, name: 'Case fixture B', code: 'case-' + societyB },
      ]});
      await prisma.user.createMany({ data: [actor, residentA, residentB, assigneeA, assigneeB].map(id => ({
        id, phone: 'case-' + id,
      }))});
      await prisma.societyMembership.createMany({ data: [
        { societyId: societyA, userId: residentA, role: 'TENANT' },
        { societyId: societyA, userId: assigneeA, role: 'COMMITTEE_MEMBER' },
        { societyId: societyB, userId: residentB, role: 'TENANT' },
        { societyId: societyB, userId: assigneeB, role: 'COMMITTEE_MEMBER' },
      ]});

      await expect(privacy.createCase(societyA, actor, request(residentB)))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(privacy.createCase(societyA, actor, request(residentA, assigneeB)))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(await privacy.listCases(societyA)).toEqual([]);
      const caseA = await privacy.createCase(societyA, actor, request(residentA, assigneeA));
      const caseB = await privacy.createCase(societyB, actor, request(residentB, assigneeB));
      expect((await privacy.listCases(societyA)).map(row => row.id)).toEqual([caseA.id]);
      expect((await privacy.listCases(societyB)).map(row => row.id)).toEqual([caseB.id]);
      await expect(privacy.history(societyA, caseB.id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await privacy.history(societyA, caseA.id) as Array<{ eventType: string }>).map(row => row.eventType))
        .toEqual(['CASE_CREATED']);
      expect((await privacy.history(societyB, caseB.id) as Array<{ eventType: string }>).map(row => row.eventType))
        .toEqual(['CASE_CREATED']);

      const personalCase = await privacy.createMine(actor, undefined, {
        requestType: 'ACCESS', requestSummary: 'Private account copy', requestKey: 'personal-' + actor,
      });
      expect((await privacy.history(undefined, personalCase.id) as Array<{ eventType: string }>).map(row => row.eventType))
        .toEqual(['SELF_SERVICE_CREATED']);
      await expect(privacy.history(societyA, personalCase.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PrivacyRequestEvent" WHERE "caseId"=${caseA.id}::uuid
      `)).rejects.toThrow();
    } finally {
      try {
        await prisma.$transaction(async tx => {
          // Fixture-only cleanup; restore append-only enforcement within the transaction.
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyRequestEvent" DISABLE TRIGGER "PrivacyRequestEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyRequestEvent" WHERE "actorUserId"=${actor}::uuid
          `);
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyRequestEvent" ENABLE TRIGGER "PrivacyRequestEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyRequestCase" WHERE "createdByUserId"=${actor}::uuid
          `);
        });
        await prisma.societyMembership.deleteMany({ where: { societyId: { in: [societyA, societyB] } } });
        await prisma.society.deleteMany({ where: { id: { in: [societyA, societyB] } } });
        await prisma.user.deleteMany({ where: { id: { in: [actor, residentA, residentB, assigneeA, assigneeB] } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
