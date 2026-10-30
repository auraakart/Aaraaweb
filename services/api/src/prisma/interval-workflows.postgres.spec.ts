import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccessSubjectType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ParkingPermitService } from '../parking/parking-permit.service';
import { VisitorService } from '../visitors/visitor.service';
import { VisitorVerificationService } from '../visitors/visitor-verification.service';
import { GatesController } from '../gates/gates.controller';
import { GateAuditService } from '../gates/gate-audit.service';
import { AccessService } from '../access/access.service';
import { GateArrivalService } from '../access/gate-arrival.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PrismaService } from './prisma.service';
import { ParcelsService } from '../parcels/parcels.service';
import { ParcelReminderService } from '../parcels/parcel-reminder.service';
import { HelpdeskSlaService } from '../helpdesk/helpdesk-sla.service';
import { ObjectStorageCleanupService } from '../scheduled-work/object-storage-cleanup.service';
import type { ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { CommunityServices3Service } from '../services-marketplace/community-services-3.service';

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

  databaseTest('routes quick arrivals to an unexpired current occupant and writes immutable audit evidence on real migrated tables', async db => {
    await db.society.update({ where: { id: societyId }, data: { featureOverrides: { DELIVERY_MANAGEMENT: true } } });
    const gate = await db.gate.create({ data: { societyId, name: 'Quick arrival fixture', code: randomUUID() } });
    const expiredUser = await db.user.create({ data: { phone: `expired-arrival-${randomUUID()}` } });
    await db.unitOccupancy.create({ data: { societyId, unitId, userId: expiredUser.id, relation: 'OWNER',
      primaryGateContact: true, escalationOrder: 0, gateApprovalExpiresAt: new Date(Date.now() - 86_400_000) } });
    const scoped = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT set_config('app.aaraagate_society_id',${scope},true)`);
        return run(tx);
      }),
    };
    const request = await new GateArrivalService(scoped as never, new EntitlementService(db))
      .create(societyId, userId, gate.id, unitId, AccessSubjectType.DELIVERY, 'Courier');
    expect(request).toMatchObject({ societyId, unitId, requestedById: userId, status: 'PENDING' });
    expect(await db.auditEvent.findMany({ where: { accessRequestId: request.id } })).toEqual([
      expect.objectContaining({ societyId, actorUserId: userId, gateId: gate.id, event: 'ACCESS_CREATED' }),
    ]);
  });

  databaseTest('retains visitor approval, single-use credential transitions and audit joins on real migrated tables', async db => {
    const gate = await db.gate.create({ data: { societyId, name: 'Visitor fixture', code: randomUUID() } });
    const scoped = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT set_config('app.aaraagate_society_id',${scope},true)`);
        return run(tx);
      }),
    } as never;
    const visitors = new VisitorService(scoped);
    const audit = new GateAuditService(scoped);
    const verification = new VisitorVerificationService(scoped, audit);
    const pending = await visitors.createRequest(societyId, userId, unitId, 'Migrated visitor');
    const issued = await visitors.approve(societyId, userId, pending.id, new Date(Date.now() - 60_000), new Date(Date.now() + 3_600_000));
    await verification.verify(societyId, gate.id, issued.credential, userId);
    await verification.checkIn(societyId, gate.id, issued.credential, userId);
    await expect(verification.checkIn(societyId, gate.id, issued.credential, userId)).rejects.toThrow('used');
    await verification.checkOut(societyId, gate.id, issued.credential, userId);
    const events = await audit.list(societyId, gate.id);
    expect(events.map(row => row.event).sort()).toEqual(['VISITOR_CHECKED_IN', 'VISITOR_CHECKED_OUT', 'VISITOR_VERIFIED']);
    expect(events.every(row => row.visitorPassId === issued.pass.id && row.actorUserId === userId)).toBe(true);
    expect(await db.visitor.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'CHECKED_OUT' });
    expect((await visitors.listForHost(societyId, userId))[0].passes).toEqual([expect.objectContaining({ id: issued.pass.id, status: 'USED', checkedOutAt: expect.any(Date) })]);
  });

  databaseTest('retains current access walk-in approvals, invite recovery and idempotent gate receipts on migrated tables', async db => {
    const gate = await db.gate.create({ data: { societyId, name: 'Access fixture', code: randomUUID() } });
    const scoped = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT set_config('app.aaraagate_society_id',${scope},true)`);
        return run(tx);
      }),
    } as never;
    const service = new AccessService(scoped, new EntitlementService(db));
    const from = new Date(Date.now() - 1000), until = new Date(Date.now() + 60_000);
    const request = await service.createWalkInVisitor(societyId, userId, gate.id, unitId, 'Walk in');
    const approved = await service.approve(societyId, userId, request.id, from, until);
    const entryKey = randomUUID();
    await service.checkInRequest(societyId, gate.id, request.id, userId, entryKey);
    expect(await service.checkIn(societyId, gate.id, approved.credential, userId, entryKey)).toMatchObject({ status: 'CHECKED_IN' });
    await service.checkOut(societyId, gate.id, approved.credential, userId, randomUUID());
    expect(await db.gateMutationReceipt.count({ where: { accessRequestId: request.id } })).toBe(2);
    expect((await db.auditEvent.findMany({ where: { accessRequestId: request.id } })).map(row => row.event).sort())
      .toEqual(['ACCESS_APPROVED', 'ACCESS_CHECKED_IN', 'ACCESS_CHECKED_OUT', 'ACCESS_CREATED']);
    const key = randomUUID();
    const first = await service.inviteVisitor(societyId, userId, unitId, 'Invite', from, until, key);
    const recovered = await service.inviteVisitor(societyId, userId, unitId, 'Invite', from, until, key);
    expect(recovered).toMatchObject({ replayed: true, request: { id: first.request.id } });
    await expect(service.verify(societyId, gate.id, first.credential)).rejects.toThrow('not found');
    expect(await service.verify(societyId, gate.id, recovered.credential)).toMatchObject({ status: 'APPROVED' });
  });

  databaseTest('retains gate creation, duplicate handling and tenant-bound activation on real migrated tables', async db => {
    const scoped = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT set_config('app.aaraagate_society_id',${scope},true)`);
        return run(tx);
      }),
    } as never;
    const gates = new GatesController(scoped, {} as never, {} as never);
    const code = randomUUID();
    const a = await gates.create({ name: ' Local ', code: ` ${code} ` }, societyId);
    const b = await gates.create({ name: 'Foreign', code }, otherSocietyId);
    expect(a).toMatchObject({ societyId, name: 'Local', code: code.toUpperCase(), active: true });
    await expect(gates.create({ name: 'Duplicate', code }, societyId)).rejects.toThrow('Gate code already exists');
    expect((await gates.list(societyId)).map(row => row.id)).toEqual([a.id]);
    await expect(gates.deactivate(b.id, societyId)).rejects.toThrow('Gate does not belong');
    expect(await gates.deactivate(a.id, societyId)).toMatchObject({ active: false });
    expect(await gates.activate(a.id, societyId)).toMatchObject({ active: true });
    expect(await db.gate.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ active: true });
  });

  databaseTest('preserves visitor parking permit constraints, terminal states and append-only events on real migrated tables', async db => {
    const scoped = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT set_config('app.aaraagate_society_id',${scope},true)`);
        return run(tx);
      }),
    } as never;
    const visitor = await new VisitorService(scoped).createPass(societyId, userId, unitId, 'Parking fixture', '999',
      new Date(Date.now() - 60_000), new Date(Date.now() + 3_600_000));
    const [slot] = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "ParkingSlot" ("societyId","code","slotType") VALUES (${societyId}::uuid,${randomUUID()},'VISITOR') RETURNING "id"`);
    const service = new ParkingPermitService(scoped);
    const input = { slotId: slot.id, visitorId: visitor.visitor.id, visitorPassId: visitor.pass.id, plateNumber: ' tn 01 1234 ',
      startsAt: new Date(Date.now() + 600_000).toISOString(), endsAt: new Date(Date.now() + 1_200_000).toISOString() };
    const first = await service.create(societyId, userId, input);
    expect(await service.list(societyId)).toEqual([expect.objectContaining({ id: first.id, plateNumber: 'TN 01 1234' })]);
    await expect(service.create(societyId, userId, input)).rejects.toThrow('overlapping active permit');
    await expect(service.cancel(otherSocietyId, userId, first.id)).rejects.toThrow('not found');
    await service.cancel(societyId, userId, first.id);
    await expect(service.complete(societyId, userId, first.id)).rejects.toThrow('not found');
    const second = await service.create(societyId, userId, input);
    await service.complete(societyId, userId, second.id);
    const events = await db.$queryRaw<Array<{ id: string; action: string }>>(Prisma.sql`
      SELECT "id","action" FROM "ParkingEvent" WHERE "slotId"=${slot.id}::uuid ORDER BY "action"`);
    expect(events.map(row => row.action)).toEqual(['PERMIT_CANCELLED', 'PERMIT_COMPLETED', 'PERMIT_CREATED', 'PERMIT_CREATED']);
    await db.$executeRaw(Prisma.sql`SAVEPOINT parking_event_probe`);
    await expect(db.$executeRaw(Prisma.sql`UPDATE "ParkingEvent" SET "note"='forbidden' WHERE "id"=${events[0].id}::uuid`)).rejects.toThrow('append-only');
    await db.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT parking_event_probe`);
    await db.$executeRaw(Prisma.sql`RELEASE SAVEPOINT parking_event_probe`);
  });

  it('deserializes advisory locks while retaining transaction ownership and release', async () => {
    const key = `interval-lock:${randomUUID()}`;
    await prisma.$transaction(async tx => {
      const [held] = await tx.$queryRaw<Array<{ locked: string }>>(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS "locked"
      `);
      expect(typeof held.locked).toBe('string');
      const [contender] = await prisma.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS "locked"
      `);
      expect(contender.locked).toBe(false);
    });
    const [released] = await prisma.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS "locked"
    `);
    expect(released.locked).toBe(true);
    // The extended-hash variant is used by helpdesk/workforce/service paths.
    await prisma.$transaction(async tx => {
      const [held] = await tx.$queryRaw<Array<{ locked: string }>>(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "locked"
      `);
      expect(typeof held.locked).toBe('string');
    });
  });

  async function overdueParcel(db: PrismaService) {
    const parcels = new ParcelsService(db);
    const parcel = await parcels.intake(societyId, userId, { unitId, recipientUserId: userId });
    await db.$executeRaw(Prisma.sql`
      UPDATE "Parcel" SET "receivedAt"=CURRENT_TIMESTAMP-INTERVAL '25 hours'
      WHERE "id"=${parcel.id}::uuid AND "societyId"=${societyId}::uuid
    `);
    return parcel;
  }

  databaseTest('creates and updates one recurring preference through the multiline two-key lock', async db => {
    const category = await db.serviceCategory.create({ data: { name: 'Fixture', slug: `recurring-${randomUUID()}` } });
    const offering = await db.serviceOffering.create({ data: { providerId, categoryId: category.id, name: 'Fixture', pricePaise: 100 } });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "ServiceOfferingExperiencePolicy" ("offeringId","recurrenceCadences")
      VALUES (${offering.id}::uuid,'["WEEKLY","MONTHLY"]'::jsonb)
    `);
    // Location eligibility has independent coverage. Keep this case scoped to
    // the real policy, lock and recurring-plan SQL, inside the rollback fixture.
    const locations = {
      resolveLocation: vi.fn().mockResolvedValue({ label: 'Fixture unit' }),
      listServiceableOfferings: vi.fn().mockResolvedValue([{ id: offering.id }]),
    };
    const service = new CommunityServices3Service(db, {} as never, locations as never);
    const input = { offeringId: offering.id, locationType: 'SOCIETY_UNIT' as const, locationId: unitId, cadence: 'WEEKLY' as const };
    const created = await service.createRecurringPlan(userId, input);
    const updated = await service.createRecurringPlan(userId, { ...input, cadence: 'MONTHLY' });
    expect(updated).toMatchObject({ id: created.id, userId, offeringId: offering.id, cadence: 'MONTHLY', status: 'ACTIVE' });
    const [stored] = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count" FROM "ConsumerServiceRecurringPlan"
      WHERE "userId"=${userId}::uuid AND "offeringId"=${offering.id}::uuid
        AND "locationId"=${unitId}::uuid AND "locationType"='SOCIETY_UNIT'
    `);
    expect(stored.count).toBe(1);
    await expect(service.createRecurringPlan(userId, { ...input, cadence: 'QUARTERLY' })).rejects.toThrow('Provider has not enabled');
  });

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
