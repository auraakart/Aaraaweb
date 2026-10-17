import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyIncidentService } from './privacy-incident.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.23 privacy grievance and incident society boundaries on PostgreSQL', () => {
  it('denies foreign categories/assignees/history and keeps incident state and audit atomic', async () => {
    const prisma = new PrismaService();
    const incidents = new PrivacyIncidentService(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const actor = randomUUID(), memberA = randomUUID(), memberB = randomUUID();
    const incidentInput = (code: string, assignedToUserId?: string) => ({
      category: 'UNAUTHORIZED_ACCESS' as const,
      severity: 'HIGH' as const,
      summary: 'Incident reviewed with society operators',
      affectedDataCategoryCodes: [code],
      minorDataSuspected: false,
      detectedAt: '2026-09-14T10:00:00.000Z',
      assignedToUserId,
    });
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Incident fixture A', code: 'incident-' + societyA },
        { id: societyB, name: 'Incident fixture B', code: 'incident-' + societyB },
      ] });
      await prisma.user.createMany({ data: [actor, memberA, memberB].map(id => ({
        id, phone: 'incident-' + id,
      })) });
      await prisma.societyMembership.createMany({ data: [
        { societyId: societyA, userId: memberA, role: 'COMMITTEE_MEMBER' },
        { societyId: societyB, userId: memberB, role: 'COMMITTEE_MEMBER' },
      ] });
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyDataCategory"
          ("societyId","code","name","purpose","retentionTrigger","createdByUserId")
        VALUES
          (${societyA}::uuid,'ID_A','Identity data A','Security incident review','Incident close',${actor}::uuid),
          (${societyB}::uuid,'ID_B','Identity data B','Security incident review','Incident close',${actor}::uuid)
      `);

      await expect(incidents.createIncident(societyA, actor, incidentInput('ID_B')))
        .rejects.toBeInstanceOf(BadRequestException);
      await expect(incidents.createIncident(societyA, actor, incidentInput('ID_A', memberB)))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(await incidents.listIncidents(societyA)).toEqual([]);
      expect(await incidents.listIncidents(societyB)).toEqual([]);

      const a = await incidents.createIncident(societyA, actor, incidentInput('ID_A', memberA));
      const b = await incidents.createIncident(societyB, actor, incidentInput('ID_B', memberB));
      expect((await incidents.listIncidents(societyA)).map(row => row.id)).toEqual([a.id]);
      expect((await incidents.listIncidents(societyB)).map(row => row.id)).toEqual([b.id]);
      await expect(incidents.history(societyA, b.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(incidents.updateStatus(societyA, actor, b.id, 'INVESTIGATING'))
        .rejects.toBeInstanceOf(NotFoundException);

      expect((await incidents.history(societyA, a.id)).map(row => row.eventType))
        .toEqual(['INCIDENT_CREATED']);
      await expect(incidents.updateStatus(societyA, actor, a.id, 'INVESTIGATING', 'x'.repeat(1001)))
        .rejects.toThrow();
      expect((await incidents.listIncidents(societyA))[0].status).toBe('OPEN');
      expect((await incidents.history(societyA, a.id)).map(row => row.eventType))
        .toEqual(['INCIDENT_CREATED']);

      await incidents.updateStatus(societyA, actor, a.id, 'INVESTIGATING', 'Investigating');
      const closed = await incidents.updateStatus(societyA, actor, a.id, 'CLOSED', 'Remediation recorded');
      expect(closed.status).toBe('CLOSED');
      await expect(incidents.updateStatus(societyA, actor, a.id, 'CLOSED'))
        .resolves.toMatchObject({status: 'CLOSED'});
      await expect(incidents.updateStatus(societyA, actor, a.id, 'OPEN'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect((await incidents.history(societyA, a.id)).map(row => row.eventType))
        .toEqual(['INCIDENT_CREATED', 'STATUS_CHANGED', 'STATUS_CHANGED']);
      expect((await incidents.listIncidents(societyB))[0].status).toBe('OPEN');

      await incidents.upsertGrievanceContact(societyA, actor, {
        displayName: 'Privacy contact A', email: 'a@example.com', active: true,
      });
      await incidents.upsertGrievanceContact(societyB, actor, {
        displayName: 'Privacy contact B', phone: '+919000000001', active: false,
      });
      const contactA = await incidents.getGrievanceContact(societyA);
      const contactB = await incidents.getGrievanceContact(societyB);
      expect(contactA[0].displayName).toBe('Privacy contact A');
      expect(contactB[0].displayName).toBe('Privacy contact B');
      await incidents.upsertGrievanceContact(societyA, actor, {
        displayName: 'Privacy contact A updated', email: 'new-a@example.com', active: true,
      });
      expect((await incidents.getGrievanceContact(societyA))[0].displayName)
        .toBe('Privacy contact A updated');
      expect((await incidents.getGrievanceContact(societyB))[0].displayName)
        .toBe('Privacy contact B');
      await expect(prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PrivacySecurityIncidentEvent" WHERE "incidentId"=${a.id}::uuid
      `)).rejects.toThrow();
    } finally {
      try {
        await prisma.$transaction(async tx => {
          // Fixture-only cleanup restores append-only enforcement in this transaction.
          await tx.$executeRaw(Prisma.sql`
            ALTER TABLE "PrivacySecurityIncidentEvent" DISABLE TRIGGER "PrivacySecurityIncidentEvent_append_only_delete"
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacySecurityIncidentEvent" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            ALTER TABLE "PrivacySecurityIncidentEvent" ENABLE TRIGGER "PrivacySecurityIncidentEvent_append_only_delete"
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacySecurityIncident" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyGrievanceContact" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyDataCategory" WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)
          `);
        });
        await prisma.societyMembership.deleteMany({ where: { societyId: { in: [societyA,societyB] } } });
        await prisma.society.deleteMany({ where: { id: { in: [societyA,societyB] } } });
        await prisma.user.deleteMany({ where: { id: { in: [actor,memberA,memberB] } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
