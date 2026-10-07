import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PushDeliveryOutboxService } from '../notifications/push-delivery-outbox.service';
import { GateRecipientService } from '../notifications/gate-recipient.service';
import { BillingService } from './billing.service';
import { PaymentOrderService } from './payment-order.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('Payment integrity on migrated PostgreSQL', () => {
  const prisma = new PrismaService();
  const ownerId = randomUUID();
  const tenantId = randomUUID();
  const societyId = randomUUID();
  const otherSocietyId = randomUUID();
  const buildingId = randomUUID();
  const otherBuildingId = randomUUID();
  const unitId = randomUUID();
  const secondUnitId = randomUUID();
  const otherUnitId = randomUUID();
  const societies = [societyId, otherSocietyId];
  const orders = new PaymentOrderService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({ data: [
      { id: ownerId, phone: `test-owner-${ownerId}` },
      { id: tenantId, phone: `test-tenant-${tenantId}` },
    ] });
    await prisma.society.createMany({ data: societies.map(id => ({ id, name: 'Payment test', code: `test-${id}` })) });
    await prisma.building.createMany({ data: [
      { id: buildingId, societyId, name: 'Test building', code: 'T' },
      { id: otherBuildingId, societyId: otherSocietyId, name: 'Other building', code: 'T' },
    ] });
    await prisma.unit.createMany({ data: [
      { id: unitId, societyId, buildingId, number: '1' },
      { id: secondUnitId, societyId, buildingId, number: '2' },
      { id: otherUnitId, societyId: otherSocietyId, buildingId: otherBuildingId, number: '1' },
    ] });
    await prisma.unitOwnership.createMany({ data: [
      { societyId, unitId, userId: ownerId, verified: true },
      { societyId, unitId: secondUnitId, userId: ownerId, verified: true },
      { societyId: otherSocietyId, unitId: otherUnitId, userId: ownerId, verified: true },
    ] });
    // The owner has no occupancy. Only the tenant is a current resident here.
    await prisma.unitOccupancy.create({ data: { societyId, unitId, userId: tenantId, relation: 'TENANT' } });
  }, 20_000);

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    // Cleanup is restricted to random fixture societies/users, never all rows.
    try {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM "PushDeliveryOutbox" WHERE "societyId" IN (${societyId}::uuid,${otherSocietyId}::uuid)`);
      await prisma.paymentEvent.deleteMany({ where: { societyId: { in: societies } } });
      await prisma.payment.deleteMany({ where: { societyId: { in: societies } } });
      await prisma.maintenanceInvoice.deleteMany({ where: { societyId: { in: societies } } });
      await prisma.society.deleteMany({ where: { id: { in: societies } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, tenantId] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function invoice(targetUnitId = unitId, targetSocietyId = societyId) {
    return prisma.maintenanceInvoice.create({ data: {
      societyId: targetSocietyId, unitId: targetUnitId, createdById: ownerId,
      invoiceNumber: `test-${randomUUID()}`, billingPeriod: '2026-10',
      amountPaise: 1000, dueDate: new Date('2026-10-31T00:00:00Z'),
    } });
  }

  it('routes gate notifications to the current occupant rather than the non-resident owner', async () => {
    const recipients = new GateRecipientService(prisma);
    await expect(recipients.notificationRecipients(societyId, unitId)).resolves.toEqual([
      { userId: tenantId, gateApprovalEnabled: true },
    ]);
    await expect(recipients.notificationRecipients(otherSocietyId, unitId)).resolves.toEqual([]);
  });

  it('rejects a cross-society invoice even when the user owns that other property', async () => {
    const other = await invoice(otherUnitId, otherSocietyId);
    await expect(orders.createPayment(societyId, ownerId, other.id, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.payment.count({ where: { invoiceId: other.id } })).toBe(0);
  });

  it('recovers a captured same-key order without creating a second order or audit event', async () => {
    const issued = await invoice();
    const key = randomUUID();
    const original = await orders.createPayment(societyId, ownerId, issued.id, key) as { id: string };
    await prisma.$transaction([
      prisma.payment.update({ where: { id: original.id }, data: { status: 'CAPTURED' } }),
      prisma.maintenanceInvoice.update({ where: { id: issued.id }, data: { status: 'PAID' } }),
    ]);
    await expect(orders.createPayment(societyId, ownerId, issued.id, key)).resolves.toMatchObject({ id: original.id, status: 'CAPTURED' });
    expect(await prisma.payment.count({ where: { invoiceId: issued.id } })).toBe(1);
    expect(await prisma.paymentEvent.count({ where: { paymentId: original.id, type: 'ORDER_CREATED' } })).toBe(1);
  });

  it('serializes owner and tenant attempts for the same invoice', async () => {
    const issued = await invoice();
    const results = await Promise.allSettled([
      orders.createPayment(societyId, ownerId, issued.id, randomUUID()),
      orders.createPayment(societyId, tenantId, issued.id, randomUUID()),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.payment.count({ where: { invoiceId: issued.id } })).toBe(1);
  }, 20_000);

  it('rejects the real unique-key conflict winner for a different invoice', async () => {
    const [first, second] = await Promise.all([invoice(), invoice(secondUnitId)]);
    const key = randomUUID();
    let arrivals = 0;
    let release!: () => void;
    const bothLookedUp = new Promise<void>(resolve => { release = resolve; });
    // Hold both real SELECT results until both transactions observe an absent
    // key. This makes the cross-invoice race deterministic without replacing SQL.
    const synchronized = new PaymentOrderService({
      $queryRaw: prisma.$queryRaw.bind(prisma),
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction(async tx => {
        const observed = new Proxy(tx, {
          get(target, property) {
            if (property !== '$queryRaw') return Reflect.get(target, property);
            return async (query: Prisma.Sql) => {
              const rows = await target.$queryRaw(query);
              const sql = query.strings.join(' ');
              if (sql.includes('SELECT * FROM "Payment"') && sql.includes('"idempotencyKey"')) {
                arrivals += 1;
                if (arrivals === 2) release();
                await bothLookedUp;
              }
              return rows;
            };
          },
        });
        return run(observed);
      }, { timeout: 15_000 }),
    } as unknown as PrismaService);
    const results = await Promise.allSettled([
      synchronized.createPayment(societyId, ownerId, first.id, key),
      synchronized.createPayment(societyId, ownerId, second.id, key),
    ]);
    expect(arrivals).toBe(2);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    const stored = await prisma.payment.findMany({ where: { societyId, payerUserId: ownerId, idempotencyKey: key } });
    expect(stored).toHaveLength(1);
    expect(await prisma.paymentEvent.count({ where: { paymentId: stored[0].id, type: 'ORDER_CREATED' } })).toBe(1);
    const successful = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<{ invoiceId: string }>;
    expect(successful.value.invoiceId).toBe(stored[0].invoiceId);
  }, 20_000);

  it('commits dues and owner/tenant delivery intents together without a realtime transport', async () => {
    const billing = new BillingService(prisma, undefined, new PushDeliveryOutboxService(prisma));
    const issued = await billing.issue(societyId, ownerId, {
      unitId, billingPeriod: '2026-11', amountPaise: 1000, dueDate: '2026-11-30',
    });
    const queued = await prisma.$queryRaw<Array<{ userId: string; payload: { unitId: string; invoiceId: string } }>>(Prisma.sql`
      SELECT "userId","payload" FROM "PushDeliveryOutbox"
      WHERE "societyId"=${societyId}::uuid AND "payload"->>'invoiceId'=${issued.id}
    `);
    expect(queued.map(row => row.userId).sort()).toEqual([ownerId, tenantId].sort());
    expect(queued.every(row => row.payload.unitId === unitId && row.payload.invoiceId === issued.id)).toBe(true);
  });

  it('rolls back both invoice and queued intent if persistence fails before commit', async () => {
    const outbox = new PushDeliveryOutboxService(prisma);
    const enqueue = outbox.enqueue.bind(outbox);
    vi.spyOn(outbox, 'enqueue').mockImplementation(async (event, tx) => {
      await enqueue(event, tx);
      throw new Error('forced post-enqueue failure');
    });
    const before = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*) AS "count" FROM "PushDeliveryOutbox" WHERE "societyId"=${societyId}::uuid`);
    const billing = new BillingService(prisma, undefined, outbox);
    await expect(billing.issue(societyId, ownerId, {
      unitId, billingPeriod: '2026-12', amountPaise: 1000, dueDate: '2026-12-31',
    })).rejects.toThrow('forced post-enqueue failure');
    expect(await prisma.maintenanceInvoice.count({ where: { societyId, billingPeriod: '2026-12' } })).toBe(0);
    const after = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*) AS "count" FROM "PushDeliveryOutbox" WHERE "societyId"=${societyId}::uuid`);
    expect(after[0].count).toBe(before[0].count);
  });

  it('revokes expired tenant gate and payment eligibility while preserving owner payment authority', async () => {
    const issued = await invoice();
    const where = { societyId, unitId, userId: tenantId };
    try {
      await prisma.unitOccupancy.updateMany({ where, data: {
        effectiveFrom: new Date(Date.now() - 2 * 86_400_000),
        effectiveTo: new Date(Date.now() - 86_400_000),
      } });
      await expect(new GateRecipientService(prisma).notificationRecipients(societyId, unitId)).resolves.toEqual([]);
      await expect(orders.createPayment(societyId, tenantId, issued.id, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
      await expect(orders.createPayment(societyId, ownerId, issued.id, randomUUID())).resolves.toMatchObject({ invoiceId: issued.id });
    } finally {
      await prisma.unitOccupancy.updateMany({ where, data: {
        effectiveFrom: new Date(Date.now() - 1000), effectiveTo: null,
      } });
    }
  });
});
