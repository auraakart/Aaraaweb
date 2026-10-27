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

  it('pages payment history without rounding microseconds or losing UUID ties', async () => {
    const ids:string[]=[randomUUID(),randomUUID(),randomUUID()].sort();
    const timestamps=['2026-10-22T00:00:00.123455Z','2026-10-22T00:00:00.123456Z','2026-10-22T00:00:00.123456Z'];
    for(let index=0;index<ids.length;index++) {
      const bill=await invoice();
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "Payment"
        ("id","societyId","invoiceId","payerUserId","idempotencyKey","provider","providerOrderId","amountPaise","status","createdAt","updatedAt")
        VALUES (${ids[index]}::uuid,${societyId}::uuid,${bill.id}::uuid,${ownerId}::uuid,
          ${ids[index]},'TEST',${ids[index]},1000,'CAPTURED',${timestamps[index]}::timestamptz,CURRENT_TIMESTAMP)`);
    }
    const service=new BillingService(prisma);
    const rows=await service.listPaymentsMine(societyId,ownerId,unitId,{beforeDate:timestamps[2],beforeId:ids[2]}) as Array<{id:string;historyTimestamp:string}>;
    expect(rows.filter(row=>ids.includes(row.id)).map(row=>row.id)).toEqual([ids[1],ids[0]]);
    expect(rows.find(row=>row.id===ids[1])?.historyTimestamp).toBe(timestamps[1]);
    const tail=await service.listPaymentsMine(societyId,ownerId,unitId,{beforeDate:timestamps[1],beforeId:ids[1]}) as Array<{id:string}>;
    expect(tail.filter(row=>ids.includes(row.id)).map(row=>row.id)).toEqual([ids[0]]);
  });

  it('exports current-property activity without disclosing another payer receipt to a tenant', async () => {
    const first = await invoice(), second = await invoice();
    const ownerPayment = await prisma.payment.create({data:{societyId,invoiceId:first.id,payerUserId:ownerId,
      idempotencyKey:randomUUID(),provider:'TEST',providerOrderId:randomUUID(),amountPaise:1000,status:'CAPTURED'}});
    const tenantPayment = await prisma.payment.create({data:{societyId,invoiceId:second.id,payerUserId:tenantId,
      idempotencyKey:randomUUID(),provider:'TEST',providerOrderId:randomUUID(),amountPaise:1000,status:'REFUNDED'}});
    const day=new Date(Date.now()+19800000).toISOString().slice(0,10), service=new BillingService(prisma);
    const tenant=await service.statement(societyId,tenantId,unitId,day,day);
    expect(tenant.payments.map(row=>row.id)).toContain(tenantPayment.id);
    expect(tenant.payments.map(row=>row.id)).not.toContain(ownerPayment.id);
    const owner=await service.statement(societyId,ownerId,unitId,day,day);
    expect(owner.payments.map(row=>row.id)).toEqual(expect.arrayContaining([ownerPayment.id,tenantPayment.id]));
    const receipt=await service.getReceipt(societyId,ownerId,ownerPayment.id) as {receiptNumber:string;legacyReceiptNumber:string};
    expect(receipt.receiptNumber).toBe('AGRP-'+ownerPayment.id.replaceAll('-','').toUpperCase());
    expect(receipt.legacyReceiptNumber).toBe('AGR-'+ownerPayment.id.slice(0,8).toUpperCase());
    await expect(service.getReceipt(societyId,tenantId,ownerPayment.id)).rejects.toThrow('Receipt not found');
    await expect(service.statement(societyId,tenantId,otherUnitId,day,day)).rejects.toThrow('Property not found');
    await prisma.unitOccupancy.updateMany({where:{societyId,unitId,userId:tenantId},data:{active:false}});
    try { await expect(service.statement(societyId,tenantId,unitId,day,day)).rejects.toThrow('Property not found'); }
    finally { await prisma.unitOccupancy.updateMany({where:{societyId,unitId,userId:tenantId},data:{active:true}}); }
  });

  it('routes gate notifications to the current occupant rather than the non-resident owner', async () => {
    const recipients = new GateRecipientService(prisma);
    await expect(recipients.notificationRecipients(societyId, unitId)).resolves.toEqual([
      { userId: tenantId, gateApprovalEnabled: true },
    ]);
    await expect(recipients.notificationRecipients(otherSocietyId, unitId)).resolves.toEqual([]);
  });

  it('keeps a shared tenant within each society and enforces gate opt-out and exact expiry on migrated PostgreSQL', async () => {
    // One global person can be a tenant in more than one society, including
    // societies owned by different partners. Neither society may cross-route.
    const cutoff = new Date(Date.now() + 60_000);
    const beforeCutoff = new Date(cutoff.getTime() - 1);
    const other = await prisma.unitOccupancy.create({ data: {
      societyId: otherSocietyId, unitId: otherUnitId, userId: tenantId,
      relation: 'TENANT', effectiveFrom: new Date(cutoff.getTime() - 60_000),
      effectiveTo: cutoff, gateNotificationEnabled: true,
    } });
    const recipients = new GateRecipientService(prisma);
    try {
      const tenantContact = [{ userId: tenantId, gateApprovalEnabled: true }];
      await expect(recipients.notificationRecipients(societyId, unitId, beforeCutoff))
        .resolves.toEqual(tenantContact);
      await expect(recipients.notificationRecipients(otherSocietyId, otherUnitId, beforeCutoff))
        .resolves.toEqual(tenantContact);
      await expect(recipients.notificationRecipients(societyId, otherUnitId, beforeCutoff))
        .resolves.toEqual([]);
      await expect(recipients.notificationRecipients(otherSocietyId, unitId, beforeCutoff))
        .resolves.toEqual([]);

      // The database uses an exclusive effectiveTo boundary, not <=.
      await expect(recipients.notificationRecipients(otherSocietyId, otherUnitId, cutoff))
        .resolves.toEqual([]);
      // The other society's expiration does not revoke a still-current
      // occupancy record for the original society.
      await expect(recipients.notificationRecipients(societyId, unitId, cutoff))
        .resolves.toEqual(tenantContact);

      await prisma.unitOccupancy.update({
        where: { id: other.id }, data: { gateNotificationEnabled: false },
      });
      await expect(recipients.notificationRecipients(otherSocietyId, otherUnitId, beforeCutoff))
        .resolves.toEqual([]);
      await expect(recipients.notificationRecipients(societyId, unitId, beforeCutoff))
        .resolves.toEqual(tenantContact);
    } finally {
      await prisma.unitOccupancy.delete({ where: { id: other.id } });
    }
  });

  it('isolates same-tenant payment keys and revocation across two societies on migrated PostgreSQL', async () => {
    // The same global user may legitimately rent in two distinct societies.
    // Idempotency and authority must be checked per society and invoice.
    const secondOccupancy = await prisma.unitOccupancy.create({ data: {
      societyId: otherSocietyId, unitId: otherUnitId, userId: tenantId, relation: 'TENANT',
    } });
    try {
      const localInvoice = await invoice();
      const remoteInvoice = await invoice(otherUnitId, otherSocietyId);
      const sharedKey = randomUUID();
      const localOrder = await orders.createPayment(
        societyId, tenantId, localInvoice.id, sharedKey,
      ) as { id: string; societyId: string; invoiceId: string };
      const remoteOrder = await orders.createPayment(
        otherSocietyId, tenantId, remoteInvoice.id, sharedKey,
      ) as { id: string; societyId: string; invoiceId: string };
      expect(localOrder).toMatchObject({
        societyId, invoiceId: localInvoice.id,
      });
      expect(remoteOrder).toMatchObject({
        societyId: otherSocietyId, invoiceId: remoteInvoice.id,
      });
      expect(remoteOrder.id).not.toBe(localOrder.id);
      await expect(orders.createPayment(societyId, tenantId, remoteInvoice.id, sharedKey))
        .rejects.toBeInstanceOf(NotFoundException);
      await expect(orders.createPayment(otherSocietyId, tenantId, localInvoice.id, sharedKey))
        .rejects.toBeInstanceOf(NotFoundException);

      // An earlier valid order must not be recoverable after this society's
      // occupancy expires, while independent occupancy remains authorized.
      await prisma.unitOccupancy.update({
        where: { id: secondOccupancy.id },
        data: {
          effectiveFrom: new Date(Date.now() - 86_400_000),
          effectiveTo: new Date(Date.now() - 1_000),
        },
      });
      await expect(orders.createPayment(otherSocietyId, tenantId, remoteInvoice.id, sharedKey))
        .rejects.toBeInstanceOf(NotFoundException);
      await expect(orders.createPayment(societyId, tenantId, localInvoice.id, sharedKey))
        .resolves.toMatchObject({ id: localOrder.id, societyId, invoiceId: localInvoice.id });

      expect(await prisma.payment.count({
        where: { societyId, invoiceId: localInvoice.id, payerUserId: tenantId },
      })).toBe(1);
      expect(await prisma.payment.count({
        where: { societyId: otherSocietyId, invoiceId: remoteInvoice.id, payerUserId: tenantId },
      })).toBe(1);
      expect(await prisma.paymentEvent.count({
        where: { paymentId: remoteOrder.id, type: 'ORDER_CREATED' },
      })).toBe(1);
    } finally {
      await prisma.unitOccupancy.delete({ where: { id: secondOccupancy.id } });
    }
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

  it('denies recovery of an existing order after ownership is revoked', async () => {
    const issued = await invoice(secondUnitId);
    const key = randomUUID();
    const original = await orders.createPayment(societyId, ownerId, issued.id, key) as { id: string };
    const where = { societyId, unitId: secondUnitId, userId: ownerId };
    try {
      await prisma.unitOwnership.updateMany({ where, data: { active: false } });
      await expect(orders.createPayment(societyId, ownerId, issued.id, key)).rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.payment.count({ where: { invoiceId: issued.id } })).toBe(1);
      expect(await prisma.paymentEvent.count({ where: { paymentId: original.id, type: 'ORDER_CREATED' } })).toBe(1);
    } finally {
      await prisma.unitOwnership.updateMany({ where, data: { active: true } });
    }
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
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.withTenantContext(scope, async tx => {
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

  it('bounds property summary reads and preserves owner/tenant payment visibility', async () => {
    const billing = new BillingService(prisma);
    const units = Array.from({ length: 32 }, (_, index) => ({
      id: randomUUID(), societyId, buildingId, number: `summary-${index}`,
    }));
    await prisma.unit.createMany({ data: units });
    await prisma.unitOwnership.createMany({ data: units.map(unit => ({
      societyId, unitId: unit.id, userId: ownerId, verified: true,
    })) });
    const target = units[0].id;
    await prisma.unitOccupancy.create({ data: { societyId, unitId: target, userId: tenantId, relation: 'TENANT' } });
    const invoices = units.map(unit => ({
      id: randomUUID(), societyId, unitId: unit.id, createdById: ownerId,
      invoiceNumber: `summary-${randomUUID()}`, billingPeriod: '2026-10',
      amountPaise: 2500, dueDate: new Date('2000-01-01T00:00:00Z'),
    }));
    await prisma.maintenanceInvoice.createMany({ data: invoices });
    const payment = (invoiceId: string, payerUserId: string) => ({
      societyId, invoiceId, payerUserId, idempotencyKey: randomUUID(),
      provider: 'TEST', providerOrderId: `summary-${randomUUID()}`, amountPaise: 2500,
      status: 'FAILED' as const,
    });
    await prisma.payment.createMany({ data: [
      ...invoices.map(invoice => payment(invoice.id, ownerId)),
      payment(invoices[0].id, tenantId),
    ] });
    const allInvoices = await billing.listPayable(societyId, ownerId) as Array<{ status: string }>;
    const allPayments = await billing.listPaymentsMine(societyId, ownerId) as unknown[];
    const query = vi.spyOn(prisma, '$queryRaw');
    const owner = await billing.residentSummary(societyId, ownerId, target);
    const invoiceRows = await query.mock.results[0].value as unknown[];
    const paymentRows = await query.mock.results[1].value as unknown[];
    expect(invoiceRows).toHaveLength(1);
    expect(paymentRows).toHaveLength(2);
    expect(allInvoices.length).toBeGreaterThanOrEqual(32);
    expect(allPayments.length).toBeGreaterThanOrEqual(33);
    expect(owner).toMatchObject({
      unitId: target, outstandingPaise: 2500, overduePaise: 2500,
      openInvoiceCount: 1, overdueInvoiceCount: 1, paymentRecoveryCount: 2,
      capturedPaymentCount: 0, nextDueDate: '2000-01-01',
    });
    const tenant = await billing.residentSummary(societyId, tenantId, target);
    expect(tenant).toEqual({ ...owner, paymentRecoveryCount: 1 });
    const aggregate = await billing.residentSummary(societyId, ownerId);
    expect(aggregate.openInvoiceCount).toBe(allInvoices.filter(invoice => invoice.status === 'ISSUED').length);
    console.info(`Summary query rows: invoices ${allInvoices.length}->${invoiceRows.length}; payments ${allPayments.length}->${paymentRows.length} (32-property fixture, not production latency)`);
  });

  it('does not widen summary scope to another society or an unauthorized property', async () => {
    const billing = new BillingService(prisma);
    const empty = { outstandingPaise: 0, openInvoiceCount: 0, paymentRecoveryCount: 0, capturedPaymentCount: 0 };
    await expect(billing.residentSummary(societyId, ownerId, otherUnitId)).resolves.toMatchObject(empty);
    await expect(billing.residentSummary(societyId, tenantId, secondUnitId)).resolves.toMatchObject(empty);
    await expect(billing.residentSummary(societyId, ownerId, randomUUID())).resolves.toMatchObject(empty);
  });

  it('blocks a departed tenant from replaying a previously authorized payment retry', async () => {
    const issued = await invoice();
    const key = randomUUID();
    const initial = await orders.createPayment(societyId, tenantId, issued.id, key) as { id: string };
    const where = { societyId, unitId, userId: tenantId };
    try {
      await prisma.unitOccupancy.updateMany({ where, data: {
        effectiveFrom: new Date(Date.now() - 2 * 86_400_000),
        effectiveTo: new Date(Date.now() - 86_400_000),
      } });
      await expect(orders.createPayment(societyId, tenantId, issued.id, key))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(await prisma.payment.count({ where: { invoiceId: issued.id } })).toBe(1);
      expect(await prisma.paymentEvent.count({ where: {
        paymentId: initial.id, type: 'ORDER_CREATED',
      } })).toBe(1);
      // Active verified ownership is independent of the departed tenant.
      const another = await invoice(secondUnitId);
      await expect(orders.createPayment(societyId, ownerId, another.id, randomUUID()))
        .resolves.toMatchObject({ invoiceId: another.id });
    } finally {
      await prisma.unitOccupancy.updateMany({ where, data: {
        effectiveFrom: new Date(Date.now() - 1000), effectiveTo: null,
      } });
    }
  });

  it('does not leak owner-only unit payment evidence to a tenant of another unit', async () => {
    const ownerOnly = await invoice(secondUnitId);
    const paid = await orders.createPayment(societyId, ownerId, ownerOnly.id, randomUUID()) as { id: string };
    await prisma.$transaction([
      prisma.payment.update({ where: { id: paid.id }, data: { status: 'CAPTURED' } }),
      prisma.maintenanceInvoice.update({ where: { id: ownerOnly.id }, data: { status: 'PAID' } }),
    ]);
    const billing = new BillingService(prisma);
    await expect(billing.listPayable(societyId, tenantId, secondUnitId)).resolves.toEqual([]);
    await expect(billing.listPaymentsMine(societyId, tenantId, secondUnitId)).resolves.toEqual([]);
    await expect(billing.getReceipt(societyId, tenantId, paid.id))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(billing.getReceipt(societyId, ownerId, paid.id))
      .resolves.toMatchObject({ paymentId: paid.id });
  });

  it('rejects cross-society key replay even when the same owner controls both properties', async () => {
    const other = await invoice(otherUnitId, otherSocietyId);
    const key = randomUUID();
    const original = await orders.createPayment(otherSocietyId, ownerId, other.id, key) as { id: string };
    await expect(orders.createPayment(societyId, ownerId, other.id, key))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.payment.count({ where: { invoiceId: other.id } })).toBe(1);
    expect(await prisma.paymentEvent.count({ where: { paymentId: original.id, type: 'ORDER_CREATED' } })).toBe(1);
  });

});
