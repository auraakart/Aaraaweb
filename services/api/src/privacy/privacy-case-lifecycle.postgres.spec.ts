import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.19 privacy lifecycle case-lock and society context PostgreSQL', () => {
  it('serializes case lifecycle decisions, rolls back failed evidence, and preserves personal cases', async () => {
    const prisma = new PrismaService();
    const privacy = new PrivacyService(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const actor = randomUUID(), subjectA = randomUUID(), subjectB = randomUUID();
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Lifecycle A', code: 'lifecycle-' + societyA },
        { id: societyB, name: 'Lifecycle B', code: 'lifecycle-' + societyB },
      ] });
      await prisma.user.createMany({ data: [actor, subjectA, subjectB].map(id => ({
        id, phone: 'lifecycle-' + id,
      })) });
      await prisma.societyMembership.createMany({ data: [
        { societyId: societyA, userId: subjectA, role: 'TENANT' },
        { societyId: societyB, userId: subjectB, role: 'TENANT' },
      ] });

      const erasureInput = (subjectUserId: string) => ({
        subjectUserId, requestType: 'ERASURE' as const, requestSummary: 'Remove my retained data',
      });
      const caseA = await privacy.createCase(societyA, actor, erasureInput(subjectA));
      const caseB = await privacy.createCase(societyB, actor, erasureInput(subjectB));
      await expect(privacy.updateStatus(societyA, actor, caseB.id, 'IN_REVIEW'))
        .rejects.toBeInstanceOf(NotFoundException);
      await expect(privacy.updateLegalHold(societyA, actor, caseB.id, true, 'Legal hold'))
        .rejects.toBeInstanceOf(NotFoundException);
      await expect(privacy.updateRetentionReview(societyA, actor, caseB.id, 'ALLOW', 'Checked'))
        .rejects.toBeInstanceOf(NotFoundException);

      await expect(privacy.updateStatus(societyA, actor, caseA.id, 'COMPLETED'))
        .rejects.toThrow('Erasure case cannot be completed until retention review allows completion');
      await privacy.updateRetentionReview(societyA, actor, caseA.id, 'ALLOW', 'Reviewed obligations');
      await privacy.updateLegalHold(societyA, actor, caseA.id, true, 'Dispute preservation');
      await expect(privacy.updateStatus(societyA, actor, caseA.id, 'COMPLETED'))
        .rejects.toThrow('Erasure case cannot be completed while legal hold is active');
      await expect(privacy.updateRetentionReview(societyA, actor, caseA.id, 'ALLOW', 'Reviewed'))
        .rejects.toThrow('Retention review cannot allow erasure while legal hold is active');

      await privacy.updateLegalHold(societyA, actor, caseA.id, false);
      await expect(privacy.updateStatus(societyA, actor, caseA.id, 'COMPLETED'))
        .rejects.toThrow('Erasure case cannot be completed until retention review allows completion');
      await privacy.updateRetentionReview(societyA, actor, caseA.id, 'ALLOW', 'Fresh review after hold');
      const historyBefore = (await privacy.history(societyA, caseA.id)) as Array<{eventType: string}>;
      await expect(privacy.updateStatus(societyA, actor, caseA.id, 'WAITING', 'x'.repeat(1001)))
        .rejects.toThrow();
      const historyAfter = (await privacy.history(societyA, caseA.id)) as Array<{eventType: string}>;
      expect(historyAfter.map(row => row.eventType)).toEqual(historyBefore.map(row => row.eventType));
      expect((await privacy.listCases(societyA))[0].status).toBe('OPEN');

      await expect(privacy.updateStatus(societyA, actor, caseA.id, 'COMPLETED'))
        .resolves.toMatchObject({status: 'COMPLETED'});
      const closedEvents = (await privacy.history(societyA, caseA.id)) as Array<{eventType: string}>;
      await expect(privacy.updateStatus(societyA, actor, caseA.id, 'COMPLETED'))
        .resolves.toMatchObject({status: 'COMPLETED'});
      expect(await privacy.history(societyA, caseA.id)).toHaveLength(closedEvents.length);
      await expect(privacy.updateLegalHold(societyA, actor, caseA.id, true, 'Late request'))
        .rejects.toThrow('Closed privacy request cases cannot change legal-hold state');
      expect((await privacy.listCases(societyB))[0].status).toBe('OPEN');

      const personal = await privacy.createMine(actor, undefined, {
        requestType: 'ERASURE', requestSummary: 'Private account information',
        requestKey: 'lifecycle-personal-' + actor,
      });
      await expect(privacy.updateStatus(undefined, actor, personal.id, 'IN_REVIEW'))
        .resolves.toMatchObject({status: 'IN_REVIEW'});
      await expect(privacy.updateLegalHold(undefined, actor, personal.id, true, 'Account dispute'))
        .resolves.toMatchObject({legalHold: true});
      await expect(privacy.updateRetentionReview(undefined, actor, personal.id, 'ALLOW', 'Review'))
        .rejects.toThrow('Retention review cannot allow erasure while legal hold is active');
      expect((await privacy.history(undefined, personal.id)) as Array<unknown>).toHaveLength(3);
      await expect(privacy.history(societyA, personal.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PrivacyRequestEvent" WHERE "caseId"=${caseA.id}::uuid
      `)).rejects.toThrow();
    } finally {
      try {
        await prisma.$transaction(async tx => {
          // Test fixture teardown restores append-only evidence enforcement atomically.
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
        await prisma.user.deleteMany({ where: { id: { in: [actor, subjectA, subjectB] } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
