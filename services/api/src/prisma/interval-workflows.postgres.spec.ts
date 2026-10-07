import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from './prisma.service';
import { ParcelsService } from '../parcels/parcels.service';
import { ParcelReminderService } from '../parcels/parcel-reminder.service';
import { HelpdeskSlaService } from '../helpdesk/helpdesk-sla.service';
import { ObjectStorageCleanupService } from '../scheduled-work/object-storage-cleanup.service';
import type { ObjectStoragePort } from '../services-marketplace/object-storage.port';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('Interval-dependent workflows on migrated PostgreSQL', () => {
  const prisma = new PrismaService();
  const societyId = randomUUID();
  const otherSocietyId = randomUUID();
  const userId = randomUUID();
  const unitId = randomUUID();
  const providerId = randomUUID();
  const previousStorageDriver = process.env.OBJECT_STORAGE_DRIVER;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, phone: `interval-${userId}` } });
    await prisma.society.createMany({ data: [societyId, otherSocietyId].map(id => ({ id, name: 'Interval fixture', code: `interval-${id}` })) });
    const building = await prisma.building.create({ data: { societyId, name: 'Fixture', code: 'T' } });
    await prisma.unit.create({ data: { id: unitId, societyId, buildingId: building.id, number: '1' } });
    await prisma.unitOccupancy.create({ data: { societyId, unitId, userId, relation: 'TENANT' } });
    await prisma.serviceProvider.create({ data: { id: providerId, businessName: 'Fixture', phone: `interval-${providerId}` } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousStorageDriver === undefined) delete process.env.OBJECT_STORAGE_DRIVER;
    else process.env.OBJECT_STORAGE_DRIVER = previousStorageDriver;
  });

  afterAll(async () => {
    try {
      await prisma.society.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
      await prisma.serviceProvider.delete({ where: { id: providerId } });
      await prisma.user.delete({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function databaseTest(name: string, run: (db: PrismaService) => Promise<void>) {
    it(name, async () => {
      const rollback = new Error('Rollback interval fixture');
      try {
        await prisma.$transaction(async tx => {
          // Real SQL, locks and audit triggers execute inside one outer
          // transaction. Nested service transactions reuse it; rollback avoids
          // deleting immutable ParcelEvent evidence or disabling audit triggers.
          const db = new Proxy(tx, {
            get(target, property) {
              if (property === '$transaction') return (callback: (client: typeof db) => Promise<unknown>) => callback(db);
              const value = Reflect.get(target, property);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }) as unknown as PrismaService;
          await run(db);
          throw rollback;
        }, { timeout: 15_000 });
      } catch (error) {
        if (error !== rollback) throw error;
      }
    }, 20_000);
  }

  async function overdueParcel(db: PrismaService) {
    const parcels = new ParcelsService(db);
    const parcel = await parcels.intake(societyId, userId, { unitId, recipientUserId: userId });
    await db.$executeRaw(Prisma.sql`
      UPDATE "Parcel" SET "receivedAt"=CURRENT_TIMESTAMP-INTERVAL '25 hours'
      WHERE "id"=${parcel.id}::uuid AND "societyId"=${societyId}::uuid
    `);
    return parcel;
  }

  databaseTest('lists overdue parcels, issues a ten-minute code and collects once without widening society/user scope', async db => {
    const parcels = new ParcelsService(db);
    const parcel = await overdueParcel(db);
    const own = await parcels.listOwn(societyId, userId) as Array<{ id: string; overdue: boolean }>;
    const desk = await parcels.listDesk(societyId) as Array<{ id: string; overdue: boolean }>;
    expect(own.find(item => item.id === parcel.id)?.overdue).toBe(true);
    expect(desk.find(item => item.id === parcel.id)?.overdue).toBe(true);
    await expect(parcels.listOwn(otherSocietyId, userId)).resolves.toEqual([]);
    await expect(parcels.listOwn(societyId, randomUUID())).resolves.toEqual([]);
    await expect(parcels.listDesk(otherSocietyId)).resolves.toEqual([]);
    await expect(parcels.issuePickupCode(otherSocietyId, userId, parcel.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(parcels.issuePickupCode(societyId, randomUUID(), parcel.id)).rejects.toBeInstanceOf(NotFoundException);
    const issued = await parcels.issuePickupCode(societyId, userId, parcel.id);
    expect(issued.maxAttempts).toBe(5);
    const [verifier] = await db.$queryRaw<Array<{ hashPresent: boolean; saltPresent: boolean }>>(Prisma.sql`
      SELECT "pickupCodeHash" IS NOT NULL AS "hashPresent","pickupCodeSalt" IS NOT NULL AS "saltPresent"
      FROM "Parcel" WHERE "id"=${parcel.id}::uuid AND "societyId"=${societyId}::uuid
    `);
    expect(verifier).toEqual({ hashPresent: true, saltPresent: true });
    const listedOwn = await parcels.listOwn(societyId, userId);
    const listedDesk = await parcels.listDesk(societyId);
    for (const listed of [listedOwn, listedDesk]) {
      expect(listed.find(item => item.id === parcel.id)).toMatchObject({ pickupCodeHash: null, pickupCodeSalt: null, pickupCodeAttempts: 0 });
    }
    const [stored] = await db.$queryRaw<Array<{ seconds: number }>>(Prisma.sql`
      SELECT EXTRACT(EPOCH FROM "pickupCodeExpiresAt"-"pickupCodeIssuedAt")::float8 AS "seconds"
      FROM "Parcel" WHERE "id"=${parcel.id}::uuid AND "societyId"=${societyId}::uuid
    `);
    expect(stored.seconds).toBe(600);
    await expect(parcels.collectWithPickupCode(societyId, userId, parcel.id, issued.code)).resolves.toMatchObject({ status: 'COLLECTED' });
    await expect(parcels.collectWithPickupCode(societyId, userId, parcel.id, issued.code)).rejects.toBeInstanceOf(BadRequestException);
    const after = await parcels.listOwn(societyId, userId) as Array<{ id: string; overdue: boolean }>;
    expect(after.find(item => item.id === parcel.id)?.overdue).toBe(false);
  });

  databaseTest('persists overdue reminder evidence and preserves the six-hour cooldown and tenant boundary', async db => {
    const reminders = new ParcelReminderService(db);
    const parcel = await overdueParcel(db);
    await expect(reminders.remind(otherSocietyId, userId, parcel.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(reminders.remind(societyId, userId, parcel.id)).resolves.toMatchObject({ parcelId: parcel.id, cooldownHours: 6 });
    await expect(reminders.remind(societyId, userId, parcel.id)).rejects.toBeInstanceOf(BadRequestException);
    const rows = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count" FROM "ParcelEvent"
      WHERE "societyId"=${societyId}::uuid AND "parcelId"=${parcel.id}::uuid AND "action"='REMINDER_SENT'
    `);
    expect(rows[0].count).toBe(1);
  });

  databaseTest('retains the 24-hour minimum age for reminders', async db => {
    const parcels = new ParcelsService(db);
    const reminders = new ParcelReminderService(db);
    const parcel = await parcels.intake(societyId, userId, { unitId, recipientUserId: userId });
    await expect(reminders.remind(societyId, userId, parcel.id)).rejects.toThrow('only after 24 hours');
  });

  databaseTest('reapplies SLA deadlines with audit evidence while protecting other societies and terminal tickets', async db => {
    const ticket = await db.helpdeskTicket.create({ data: { societyId, unitId, createdById: userId, title: 'Fixture', description: 'Fixture' } });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "HelpdeskSlaPolicy" ("societyId","priority","firstResponseMinutes","resolutionMinutes","escalationAfterMinutes","updatedByUserId")
      VALUES (${societyId}::uuid,'NORMAL',15,120,60,${userId}::uuid)
    `);
    const sla = new HelpdeskSlaService(db);
    await expect(sla.applyPolicy(otherSocietyId, userId, ticket.id)).rejects.toBeInstanceOf(NotFoundException);
    const updated = await sla.applyPolicy(societyId, userId, ticket.id) as { firstResponseDueAt: Date; resolutionDueAt: Date; slaState: string };
    expect(updated.firstResponseDueAt.getTime() - ticket.createdAt.getTime()).toBe(15 * 60_000);
    expect(updated.resolutionDueAt.getTime() - ticket.createdAt.getTime()).toBe(120 * 60_000);
    expect(updated.slaState).toBe('ON_TRACK');
    const audit = await db.$queryRaw<Array<{ eventType: string }>>(Prisma.sql`
      SELECT "eventType" FROM "HelpdeskSlaEvent" WHERE "ticketId"=${ticket.id}::uuid AND "societyId"=${societyId}::uuid
    `);
    expect(audit).toEqual([{ eventType: 'TRACKING_STARTED' }]);
    await db.$executeRaw(Prisma.sql`
      UPDATE "HelpdeskTicket" SET "status"='CLOSED',"closureCode"='RESOLVED_CONFIRMED'
      WHERE "id"=${ticket.id}::uuid AND "societyId"=${societyId}::uuid
    `);
    await expect(sla.applyPolicy(societyId, userId, ticket.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  databaseTest('persists the real cleanup failure backoff without claiming or deleting unrelated provider media', async db => {
    const mediaId = randomUUID();
    const storageKey = `providers/${providerId}/fixture.png`;
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "ServiceProviderMedia" ("id","providerId","kind","storageKey","status","storageDeleteAttemptCount")
      VALUES (${mediaId}::uuid,${providerId}::uuid,'GALLERY'::"ProviderMediaKind",${storageKey},'REMOVED'::"ProviderMediaStatus",2)
    `);
    // Only claim selection and the external provider are replaced. The failure
    // UPDATE runs on real PostgreSQL and targets this fixture ID exclusively.
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ id: mediaId, storageKey, attemptCount: 2 }]) };
    const scoped = {
      $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
      $executeRaw: db.$executeRaw.bind(db),
    } as unknown as PrismaService;
    const deleteObject = vi.fn().mockRejectedValue(new Error('fixture storage outage'));
    const cleanup = new ObjectStorageCleanupService(scoped, { deleteObject } as unknown as ObjectStoragePort);
    process.env.OBJECT_STORAGE_DRIVER = 's3';
    await expect(cleanup.runOnce()).resolves.toEqual({ skipped: false, deleted: 0, failed: 1 });
    expect(deleteObject).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledWith(storageKey);
    const [stored] = await db.$queryRaw<Array<{ minutes: number; lastError: string; deletedAt: Date | null }>>(Prisma.sql`
      SELECT EXTRACT(EPOCH FROM "storageDeleteNextAttemptAt"-"updatedAt")::float8/60 AS "minutes",
        "storageDeleteLastError" AS "lastError","storageDeletedAt" AS "deletedAt"
      FROM "ServiceProviderMedia" WHERE "id"=${mediaId}::uuid AND "providerId"=${providerId}::uuid
    `);
    expect(stored).toEqual({ minutes: 10, lastError: 'fixture storage outage', deletedAt: null });
  });
});
