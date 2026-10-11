import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementService } from './settlement.service';
import { PaymentExceptionsService } from './payment-exceptions.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

// The append-only accounting schema intentionally forbids deleting receipts,
// allocations and reversals. This concurrent, committed-transaction suite may
// run ONLY on the disposable PostgreSQL service in GitHub Actions API CI.
// Never enable it with an operator's or a developer's persistent database.
function isDisposableCiDatabase(): boolean {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.AARAAGATE_FINANCE_CONCURRENCY_CI !== '1') return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return url.protocol === 'postgresql:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      url.port === '5432' && url.pathname === '/aaraagate_ci' &&
      !url.searchParams.has('schema');
  } catch {
    return false;
  }
}

const disposable = isDisposableCiDatabase() ? describe : describe.skip;
disposable('V4.90.16 finance concurrent acceptance on migrated disposable PostgreSQL', () => {
  const prisma = new PrismaService();
  const settlement = new SettlementService(prisma);
  const exceptions = new PaymentExceptionsService(prisma);
  const reconciliation = new PaymentReconciliationService(prisma);
  const societyId = randomUUID();
  const userId = randomUUID();
  let unitId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, phone: `finance-race-${userId}` } });
    await prisma.society.create({ data: { id: societyId, name: 'Disposable finance acceptance', code: `race-${societyId}` } });
    const building = await prisma.building.create({ data: { societyId, name: 'Fixture', code: 'T' } });
    const unit = await prisma.unit.create({ data: { societyId, buildingId: building.id, number: '1' } });
    unitId = unit.id;
  }, 20_000);

  afterAll(async () => {
    // No production-style trigger suppression or unsafe ledger cleanup.
    // The dedicated GitHub Actions PostgreSQL container is discarded.
    await prisma.$disconnect();
  });

  async function createReceivable(amountPaise: number): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Receivable" ("id","societyId","unitId","receivableNumber","billingPeriod",
        "description","amountPaise","dueDate","issuedByUserId")
      VALUES (${id}::uuid,${societyId}::uuid,${unitId}::uuid,${`accept-${id}`},
        '2026-10','Concurrency acceptance',${amountPaise},'2026-10-31'::date,${userId}::uuid)
    `);
    return id;
  }

  async function createCapturedPayment(amountPaise: number): Promise<string> {
    const invoice = await prisma.maintenanceInvoice.create({ data: {
      societyId, unitId, createdById: userId, invoiceNumber: `accept-${randomUUID()}`,
      billingPeriod: '2026-10', amountPaise, dueDate: new Date('2026-10-31T00:00:00Z'),
    } });
    const payment = await prisma.payment.create({ data: {
      societyId, invoiceId: invoice.id, payerUserId: userId, idempotencyKey: randomUUID(),
      provider: 'CI_TEST_ONLY', providerOrderId: `ci-${randomUUID()}`, amountPaise, status: 'CAPTURED',
    } });
    return payment.id;
  }

  function winners<T>(outcomes: PromiseSettledResult<T>[]): T[] {
    return outcomes.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  }

  it('serializes competing allocations against one captured payment', async () => {
    const paymentId = await createCapturedPayment(1000);
    const [r1, r2] = await Promise.all([createReceivable(1000), createReceivable(1000)]);
    const results = await Promise.allSettled([
      settlement.allocate(societyId, userId, r1, { paymentId, amountPaise: 700, idempotencyKey: randomUUID() }),
      settlement.allocate(societyId, userId, r2, { paymentId, amountPaise: 700, idempotencyKey: randomUUID() }),
    ]);
    expect(winners(results)).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const availability = await settlement.paymentAvailability(societyId, paymentId);
    expect(availability).toMatchObject({ grossAllocatedPaise: '700', reversedPaise: '0', refundedPaise: '0', availablePaise: '300' });
    const allocations = await settlement.listPaymentAllocations(societyId, paymentId) as unknown[];
    expect(allocations).toHaveLength(1);
  }, 25_000);

  it('serializes two payments racing against the same receivable', async () => {
    const receivableId = await createReceivable(1000);
    const [p1, p2] = await Promise.all([createCapturedPayment(1000), createCapturedPayment(1000)]);
    const results = await Promise.allSettled([
      settlement.allocate(societyId, userId, receivableId, { paymentId: p1, amountPaise: 700, idempotencyKey: randomUUID() }),
      settlement.allocate(societyId, userId, receivableId, { paymentId: p2, amountPaise: 700, idempotencyKey: randomUUID() }),
    ]);
    expect(winners(results)).toHaveLength(1);
    const [row] = await prisma.$queryRaw<Array<{ total: bigint; status: string }>>(Prisma.sql`
      SELECT COALESCE(SUM(a."amountPaise"),0)::bigint AS total, MAX(r."status"::text) AS status
      FROM "Receivable" r LEFT JOIN "ReceivableAllocation" a
        ON a."receivableId"=r."id" AND a."societyId"=r."societyId"
      WHERE r."societyId"=${societyId}::uuid AND r."id"=${receivableId}::uuid
    `);
    expect(row.total).toBe(700n);
    expect(row.status).toBe('PARTIALLY_SETTLED');
  }, 25_000);

  it('never records two over-limit refunds competing for one payment', async () => {
    const paymentId = await createCapturedPayment(1000);
    const results = await Promise.allSettled([
      exceptions.recordRefund(societyId, userId, paymentId, { amountPaise: 700, reason: 'Adjustment', idempotencyKey: randomUUID() }),
      exceptions.recordRefund(societyId, userId, paymentId, { amountPaise: 700, reason: 'Adjustment', idempotencyKey: randomUUID() }),
    ]);
    expect(winners(results)).toHaveLength(1);
    const snapshot = await exceptions.paymentSnapshot(societyId, paymentId);
    expect(snapshot).toMatchObject({ refundedPaise: '700', netAllocatedPaise: '0', refundablePaise: '300' });
    const refunds = await exceptions.listRefunds(societyId, paymentId) as unknown[];
    expect(refunds).toHaveLength(1);
  }, 25_000);

  it('serializes partial reversals and permits refund only against released funds', async () => {
    const paymentId = await createCapturedPayment(1000);
    const receivableId = await createReceivable(1000);
    const allocation = await settlement.allocate(societyId, userId, receivableId, { paymentId, amountPaise: 1000, idempotencyKey: randomUUID() }) as { id: string };
    const attempts = await Promise.allSettled([
      exceptions.reverseAllocation(societyId, userId, allocation.id, { amountPaise: 700, reason: 'Correction', idempotencyKey: randomUUID() }),
      exceptions.reverseAllocation(societyId, userId, allocation.id, { amountPaise: 700, reason: 'Correction', idempotencyKey: randomUUID() }),
    ]);
    expect(winners(attempts)).toHaveLength(1);
    const reversed = await exceptions.listAllocationReversals(societyId, paymentId) as unknown[];
    expect(reversed).toHaveLength(1);
    await expect(exceptions.recordRefund(societyId, userId, paymentId, {
      amountPaise: 701, reason: 'Exceeds released funds', idempotencyKey: randomUUID(),
    })).rejects.toThrow();
    await exceptions.recordRefund(societyId, userId, paymentId, {
      amountPaise: 600, reason: 'Partial refund', idempotencyKey: randomUUID(),
    });
    expect(await settlement.paymentAvailability(societyId, paymentId)).toMatchObject({
      grossAllocatedPaise: '1000', reversedPaise: '700', refundedPaise: '600', availablePaise: '100',
    });
    const [receivable] = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status"::text AS status FROM "Receivable"
      WHERE "societyId"=${societyId}::uuid AND "id"=${receivableId}::uuid
    `);
    expect(receivable.status).toBe('PARTIALLY_SETTLED');
  }, 25_000);


  it('restores ISSUED after a fully reversed allocation, without rewriting history', async () => {
    const paymentId = await createCapturedPayment(1000);
    const receivableId = await createReceivable(1000);
    const allocation = await settlement.allocate(societyId, userId, receivableId, {
      paymentId, amountPaise: 1000, idempotencyKey: randomUUID(),
    }) as { id: string };
    await exceptions.reverseAllocation(societyId, userId, allocation.id, {
      amountPaise: 1000, reason: 'Full reversal', idempotencyKey: randomUUID(),
    });
    const [receivable] = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status"::text AS status FROM "Receivable"
      WHERE "societyId"=${societyId}::uuid AND "id"=${receivableId}::uuid
    `);
    expect(receivable.status).toBe('ISSUED');
    expect(await settlement.paymentAvailability(societyId, paymentId)).toMatchObject({
      grossAllocatedPaise: '1000', reversedPaise: '1000', availablePaise: '1000',
    });
  }, 25_000);

  it('never allows a concurrent refund and allocation to exceed captured funds', async () => {
    const paymentId = await createCapturedPayment(1000);
    const receivableId = await createReceivable(1000);
    const attempts = await Promise.allSettled([
      settlement.allocate(societyId, userId, receivableId, { paymentId, amountPaise: 700, idempotencyKey: randomUUID() }),
      exceptions.recordRefund(societyId, userId, paymentId, { amountPaise: 700, reason: 'Overpayment', idempotencyKey: randomUUID() }),
    ]);
    expect(winners(attempts)).toHaveLength(1);
    const balance = await settlement.paymentAvailability(societyId, paymentId);
    expect(balance.availablePaise).toBe('300');
    expect(BigInt(balance.allocatedPaise) + BigInt(balance.refundedPaise)).toBe(700n);
  }, 25_000);

  it('keeps same-key concurrent refund retries idempotent', async () => {
    const paymentId = await createCapturedPayment(1000);
    const key = randomUUID();
    const values = await Promise.all([
      exceptions.recordRefund(societyId, userId, paymentId, { amountPaise: 300, reason: 'Correction', idempotencyKey: key }),
      exceptions.recordRefund(societyId, userId, paymentId, { amountPaise: 300, reason: 'Correction', idempotencyKey: key }),
    ]);
    expect((values[0] as { id: string }).id).toBe((values[1] as { id: string }).id);
    expect(await exceptions.listRefunds(societyId, paymentId) as unknown[]).toHaveLength(1);
  }, 25_000);

  it('reconciles partial refunds and invalidates a previously matched provider observation', async () => {
    const paymentId = await createCapturedPayment(1200);
    const receivableId = await createReceivable(1200);
    const allocation = await settlement.allocate(societyId, userId, receivableId, { paymentId, amountPaise: 800, idempotencyKey: randomUUID() }) as { id: string };
    await exceptions.reverseAllocation(societyId, userId, allocation.id, {
      amountPaise: 500, reason: 'Correct charge', idempotencyKey: randomUUID(),
    });
    await exceptions.recordRefund(societyId, userId, paymentId, {
      amountPaise: 400, reason: 'First refund', idempotencyKey: randomUUID(),
    });
    const opened = await reconciliation.openOrRefreshCase(societyId, paymentId, 'CI_TEST_ONLY') as { id: string };
    const matched = await reconciliation.recordObservation(societyId, opened.id, {
      observedAmountPaise: 800, observedProviderStatus: 'PARTIALLY_REFUNDED',
    });
    expect(matched).toMatchObject({ status: 'MATCHED', expectedCapturedPaise: '1200', expectedRefundedPaise: '400' });
    await exceptions.recordRefund(societyId, userId, paymentId, {
      amountPaise: 200, reason: 'Second refund', idempotencyKey: randomUUID(),
    });
    const reopened = await reconciliation.openOrRefreshCase(societyId, paymentId, 'CI_TEST_ONLY');
    expect(reopened).toMatchObject({ id: opened.id, status: 'PENDING', expectedRefundedPaise: '600' });
    const updated = await reconciliation.recordObservation(societyId, opened.id, {
      observedAmountPaise: 600, observedProviderStatus: 'PARTIALLY_REFUNDED',
    });
    expect(updated).toMatchObject({ status: 'MATCHED', expectedRefundedPaise: '600' });
    expect(await settlement.paymentAvailability(societyId, paymentId)).toMatchObject({
      allocatedPaise: '300', refundedPaise: '600', availablePaise: '300',
    });
  }, 25_000);
});
