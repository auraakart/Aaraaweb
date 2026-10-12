import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyConsentService } from './privacy-consent.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.16 privacy consent society transactions on PostgreSQL', () => {
  it('isolates society consent, serializes withdrawal and rolls back failed event evidence', async () => {
    const prisma = new PrismaService();
    const consents = new PrivacyConsentService(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const actor = randomUUID(), subjectA = randomUUID(), subjectB = randomUUID();
    const input = (subjectUserId: string) => ({
      subjectUserId, purpose: 'Optional resident photo consent', minorAtRecord: false,
      grantedAt: '2026-09-14T00:00:00.000Z',
    });
    try {
      await prisma.society.createMany({data: [
        {id: societyA, name: 'Consent fixture A', code: 'consent-' + societyA},
        {id: societyB, name: 'Consent fixture B', code: 'consent-' + societyB},
      ]});
      await prisma.user.createMany({data: [actor, subjectA, subjectB].map(id => ({
        id, phone: 'consent-' + id,
      }))});
      await prisma.societyMembership.createMany({data: [
        {societyId: societyA, userId: subjectA, role: 'TENANT'},
        {societyId: societyB, userId: subjectB, role: 'TENANT'},
      ]});

      await expect(consents.record(societyA, actor, input(subjectB)))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(consents.record(societyA, actor, {
        ...input(subjectA), minorAtRecord: true, representativeUserId: subjectB,
        relationshipReference: 'Parent',
      })).rejects.toBeInstanceOf(BadRequestException);

      const consentA = await consents.record(societyA, actor, input(subjectA));
      const consentB = await consents.record(societyB, actor, input(subjectB));
      expect((await consents.list(societyA)).map(row => row.id)).toEqual([consentA.id]);
      expect((await consents.list(societyB)).map(row => row.id)).toEqual([consentB.id]);
      await expect(consents.history(societyA, consentB.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(consents.withdraw(societyA, actor, consentB.id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await consents.history(societyA, consentA.id)).map(row => row.eventType))
        .toEqual(['CONSENT_RECORDED']);

      // Consent UPDATE succeeds but the oversized append-only event summary fails,
      // proving that record state and audit evidence share the same transaction.
      await expect(consents.withdraw(societyA, actor, consentA.id, 'x'.repeat(1001)))
        .rejects.toThrow();
      expect((await consents.list(societyA))[0].status).toBe('GRANTED');
      expect((await consents.history(societyA, consentA.id)).map(row => row.eventType))
        .toEqual(['CONSENT_RECORDED']);

      const results = await Promise.all([
        consents.withdraw(societyA, actor, consentA.id, 'Withdrawn by subject'),
        consents.withdraw(societyA, actor, consentA.id, 'Withdrawn by subject'),
      ]);
      expect(results.map(row => row.status)).toEqual(['WITHDRAWN', 'WITHDRAWN']);
      await expect(consents.withdraw(societyA, actor, consentA.id))
        .resolves.toMatchObject({status: 'WITHDRAWN'});
      const historyA = await consents.history(societyA, consentA.id);
      expect(historyA.map(row => row.eventType))
        .toEqual(['CONSENT_RECORDED', 'CONSENT_WITHDRAWN']);
      expect((await consents.list(societyB))[0].status).toBe('GRANTED');

      await expect(prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PrivacyConsentEvent" WHERE "societyId"=${societyA}::uuid
      `)).rejects.toThrow();
    } finally {
      try {
        await prisma.$transaction(async tx => {
          // Fixture-only cleanup; the append-only trigger is restored atomically.
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyConsentEvent" DISABLE TRIGGER "PrivacyConsentEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyConsentEvent" WHERE "societyId" IN (${societyA}::uuid, ${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyConsentEvent" ENABLE TRIGGER "PrivacyConsentEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyConsentRecord" WHERE "societyId" IN (${societyA}::uuid, ${societyB}::uuid)
          `);
        });
        await prisma.societyMembership.deleteMany({where: {societyId: {in: [societyA, societyB]}}});
        await prisma.society.deleteMany({where: {id: {in: [societyA, societyB]}}});
        await prisma.user.deleteMany({where: {id: {in: [actor, subjectA, subjectB]}}});
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
