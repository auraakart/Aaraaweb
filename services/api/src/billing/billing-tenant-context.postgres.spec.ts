import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';
import { PaymentOrderService } from './payment-order.service';
import { ResidentStatementService } from './resident-statement.service';
import { BillingService, type PaymentWebhookEvent } from './billing.service';
import { PushDeliveryOutboxService } from '../notifications/push-delivery-outbox.service';
import { PaymentReconciliationService } from '../accounting/payment-reconciliation.service';
import { PaymentReconciliationObservabilityService } from '../accounting/payment-reconciliation-observability.service';

// Creates a restricted role and isolated copies of migrated tables. Never run
// this DDL against an operator's database or enable RLS on shared public tables.
function disposableCiDatabase() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.AARAAGATE_BILLING_RLS_CI !== '1') return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return url.protocol === 'postgresql:' && ['localhost', '127.0.0.1'].includes(url.hostname)
      && url.port === '5432' && url.pathname === '/aaraagate_ci' && !url.searchParams.has('schema');
  } catch { return false; }
}

const database = disposableCiDatabase() ? describe : describe.skip;
database('Billing transactions under a non-owner RLS role', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `billing_rls_${suffix}`;
  const role = `billing_rls_${suffix}`;
  const password = randomUUID();
  const base = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/aaraagate_test');
  const fixtureUrl = new URL(base);
  fixtureUrl.searchParams.set('schema', schema);
  const runtimeUrl = new URL(fixtureUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  runtimeUrl.searchParams.set('connection_limit', '2');
  runtimeUrl.searchParams.set('connect_timeout', '5');
  const fixture = new PrismaService({ datasources: { db: { url: fixtureUrl.toString() } } });
  const runtime = new PrismaService({ datasources: { db: { url: runtimeUrl.toString() } } });
  const orders = new PaymentOrderService(runtime);
  const billing = new BillingService(runtime);
  const reconciliation = new PaymentReconciliationService(runtime);
  const owner = randomUUID(), tenant = randomUUID();
  const societyA = randomUUID(), societyB = randomUUID();
  const buildingA = randomUUID(), buildingB = randomUUID();
  const unitA = randomUUID(), unitB = randomUUID();
  const tables = ['User', 'Society', 'Building', 'Unit', 'UnitOwnership', 'UnitOccupancy',
    'MaintenanceInvoice', 'Payment', 'PaymentEvent', 'AmenityBooking', 'Amenity',
    'PaymentAutopayPreference', 'PushDeliveryOutbox', 'PaymentWebhookReceipt',
    'PaymentRefund', 'PaymentReconciliationCase', 'PaymentGatewayOperation'];
  let schemaCreated = false, roleCreated = false;

  function executeDdl(sql: string, url = base.toString()) {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--stdin', '--url', url], {
      input: sql, stdio: 'pipe', timeout: 30_000,
    });
  }

  beforeAll(async () => {
    // Identifiers/password below are generated UUID-derived test constants,
    // never request input. Public migrations and role grants remain untouched.
    executeDdl(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    executeDdl(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'`);
    roleCreated = true;
    // A domain preserves the migrated public enum while resolving the existing
    // webhook SQL cast inside this isolated schema. No enum values are copied.
    const definitions: string[] = ['PaymentStatus', 'PaymentReconciliationStatus', 'GatewayOperationType', 'GatewayOperationStatus']
      .map(type => `CREATE DOMAIN "${type}" AS public."${type}"`);
    for (const table of tables) {
      definitions.push(`CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`);
      if (table === 'User') continue; // Global identity is not a society record.
      const field = table === 'Society' ? 'id' : 'societyId';
      const predicate = `"${field}" = NULLIF(current_setting('${TENANT_CONTEXT_SETTING}', true), '')::uuid`;
      definitions.push(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      definitions.push(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      definitions.push(`CREATE POLICY tenant_scope ON "${table}" USING (${predicate}) WITH CHECK (${predicate})`);
    }
    executeDdl(definitions.join(';\n') + ';', fixtureUrl.toString());
    executeDdl(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
    executeDdl(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`, fixtureUrl.toString());
    for (const user of [owner, tenant]) await fixture.$executeRaw(Prisma.sql`
      INSERT INTO "User" ("id","phone","updatedAt") VALUES (${user}::uuid,${`rls-${user}`},CURRENT_TIMESTAMP)`);
    for (const society of [societyA, societyB]) await fixture.$executeRaw(Prisma.sql`
      INSERT INTO "Society" ("id","name","code","updatedAt")
      VALUES (${society}::uuid,'Isolated billing RLS fixture',${society},CURRENT_TIMESTAMP)`);
    for (const [society, building, unit] of [[societyA, buildingA, unitA], [societyB, buildingB, unitB]]) {
      await fixture.$executeRaw(Prisma.sql`INSERT INTO "Building" ("id","societyId","name","code")
        VALUES (${building}::uuid,${society}::uuid,'Fixture','T')`);
      await fixture.$executeRaw(Prisma.sql`INSERT INTO "Unit" ("id","societyId","buildingId","number")
        VALUES (${unit}::uuid,${society}::uuid,${building}::uuid,'1')`);
      await fixture.$executeRaw(Prisma.sql`INSERT INTO "UnitOwnership"
        ("id","societyId","unitId","userId","verified","active","effectiveFrom","updatedAt")
        VALUES (${randomUUID()}::uuid,${society}::uuid,${unit}::uuid,${owner}::uuid,TRUE,TRUE,
          CURRENT_TIMESTAMP-INTERVAL '1 day',CURRENT_TIMESTAMP)`);
    }
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "UnitOccupancy"
      ("id","societyId","unitId","userId","relation","active","effectiveFrom","updatedAt")
      VALUES (${randomUUID()}::uuid,${societyA}::uuid,${unitA}::uuid,${tenant}::uuid,'TENANT',TRUE,
        CURRENT_TIMESTAMP-INTERVAL '1 day',CURRENT_TIMESTAMP)`);
    await runtime.$connect();
  }, 40_000);

  afterAll(async () => {
    await runtime.$disconnect();
    await fixture.$disconnect();
    if (schemaCreated) executeDdl(`DROP SCHEMA "${schema}" CASCADE`);
    if (roleCreated) executeDdl(`DROP ROLE "${role}"`);
  });

  async function invoice(societyId = societyA, unitId = unitA) {
    const [row] = await fixture.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "MaintenanceInvoice"
        ("id","societyId","unitId","createdById","invoiceNumber","billingPeriod","amountPaise","dueDate","updatedAt")
      VALUES (${randomUUID()}::uuid,${societyId}::uuid,${unitId}::uuid,${owner}::uuid,${randomUUID()},
        '2026-10',1000,DATE '2026-10-31',CURRENT_TIMESTAMP) RETURNING "id"`);
    return row;
  }

  async function paymentReceipt(status: 'CREATED' | 'REFUNDED' = 'CREATED') {
    const bill = await invoice();
    const created = await orders.createPayment(societyA, owner, bill.id, randomUUID()) as { id: string };
    const [order] = await fixture.$queryRaw<Array<{ id: string; providerOrderId: string }>>(Prisma.sql`
      SELECT "id","providerOrderId" FROM "Payment" WHERE "id"=${created.id}::uuid`);
    if (status === 'REFUNDED') await fixture.$executeRaw(Prisma.sql`
      UPDATE "Payment" SET "status"='REFUNDED' WHERE "id"=${order.id}::uuid`);
    const event: PaymentWebhookEvent = { eventId: randomUUID(), providerOrderId: order.providerOrderId,
      providerPaymentId: randomUUID(), status: 'CAPTURED' };
    const [receipt] = await fixture.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "PaymentWebhookReceipt"
        ("societyId","paymentId","providerEventId","providerOrderId","providerPaymentId","eventStatus","payload","payloadDigest")
      VALUES (${societyA}::uuid,${order.id}::uuid,${event.eventId},${event.providerOrderId},${event.providerPaymentId},
        'CAPTURED',CAST(${JSON.stringify(event)} AS jsonb),${'a'.repeat(64)}) RETURNING "id"`);
    return { bill, order, receipt, event };
  }

  async function reconciliationPayment(societyId = societyA, unitId = unitA) {
    const bill = await invoice(societyId, unitId);
    const order = await orders.createPayment(societyId, owner, bill.id, randomUUID()) as { id: string };
    await fixture.$executeRaw(Prisma.sql`UPDATE "Payment" SET "status"='CAPTURED' WHERE "id"=${order.id}::uuid`);
    return order.id;
  }

  it('isolates reconciliation queue/detail/observation/resolution for two societies', async () => {
    const paymentA = await reconciliationPayment(), paymentB = await reconciliationPayment(societyB, unitB);
    const a = await reconciliation.openOrRefreshCase(societyA, paymentA, 'RLS_FIXTURE') as { id: string };
    const b = await reconciliation.openOrRefreshCase(societyB, paymentB, 'RLS_FIXTURE') as { id: string };
    expect(await reconciliation.listCases(societyA)).toEqual([expect.objectContaining({ id: a.id, priority: 'MEDIUM' })]);
    expect(await reconciliation.listCases(societyB)).toEqual([expect.objectContaining({ id: b.id })]);
    await expect(reconciliation.getCase(societyB, a.id)).rejects.toThrow('Reconciliation case not found');
    await expect(reconciliation.openOrRefreshCase(societyB, paymentA, 'RLS_FIXTURE')).rejects.toThrow('Payment not found');
    await expect(reconciliation.recordObservation(societyB, a.id, { observedProviderStatus: 'CAPTURED', observedAmountPaise: 1000 }))
      .rejects.toThrow('Reconciliation case not found');
    await expect(reconciliation.resolveCase(societyB, owner, a.id, 'Foreign attempt')).rejects.toThrow('missing or already resolved');
    await expect(reconciliation.recordObservation(societyA, a.id, { observedProviderStatus: 'CAPTURED', observedAmountPaise: 1000 }))
      .resolves.toMatchObject({ status: 'MATCHED', observedAmountPaise: '1000' });
    await expect(reconciliation.resolveCase(societyA, owner, a.id, 'Evidence verified'))
      .resolves.toMatchObject({ id: a.id, status: 'RESOLVED', resolvedByUserId: owner, reason: 'Evidence verified' });
    await expect(reconciliation.resolveCase(societyA, owner, a.id, 'Duplicate')).rejects.toThrow('already resolved');
    expect(await reconciliation.getCase(societyB, b.id)).toMatchObject({ status: 'PENDING' });
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentReconciliationCase"`)).toEqual([]);
  });

  it('isolates operation retries/results and retains settled evidence under RLS', async () => {
    const paymentA = await reconciliationPayment(), paymentB = await reconciliationPayment(societyB, unitB), key = randomUUID();
    const input = { operationType: 'STATUS_QUERY' as const, provider: 'RLS_FIXTURE', idempotencyKey: key };
    const a = await reconciliation.createOperation(societyA, owner, paymentA, input) as { id: string };
    const b = await reconciliation.createOperation(societyB, owner, paymentB, input) as { id: string };
    expect(a.id).not.toBe(b.id);
    expect(await reconciliation.createOperation(societyA, owner, paymentA, input)).toMatchObject({ id: a.id });
    await expect(reconciliation.createOperation(societyA, tenant, paymentA, input)).rejects.toThrow('different gateway operation request');
    expect(await reconciliation.listOperations(societyB, paymentA)).toEqual([]);
    await expect(reconciliation.recordOperationResult(societyB, a.id, { status: 'SETTLED' })).rejects.toThrow('Gateway operation not found');
    const settled = await reconciliation.recordOperationResult(societyA, a.id, { status: 'SETTLED', providerOperationId: 'rls-provider-op' });
    expect(await reconciliation.recordOperationResult(societyA, a.id, { status: 'SETTLED', providerOperationId: 'rls-provider-op' }))
      .toMatchObject({ settledAt: settled.settledAt });
    await expect(reconciliation.recordOperationResult(societyA, a.id, { status: 'FAILED' })).rejects.toThrow('cannot regress');
    await expect(reconciliation.recordOperationResult(societyA, a.id, { status: 'SETTLED', providerOperationId: 'changed' }))
      .rejects.toThrow('cannot change');
    expect(await reconciliation.listOperations(societyB, paymentB)).toEqual([expect.objectContaining({ id: b.id, status: 'REQUESTED' })]);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentGatewayOperation"`)).toEqual([]);
  });

  it('returns only selected-society reconciliation metrics', async () => {
    const metrics = new PaymentReconciliationObservabilityService(runtime);
    const beforeA = await metrics.metrics(societyA), beforeB = await metrics.metrics(societyB);
    const payment = await reconciliationPayment();
    await reconciliation.openOrRefreshCase(societyA, payment, 'RLS_FIXTURE');
    await reconciliation.createOperation(societyA, owner, payment, {
      operationType: 'REFUND', amountPaise: 500, provider: 'RLS_FIXTURE', idempotencyKey: randomUUID(),
    });
    const afterA = await metrics.metrics(societyA);
    expect(BigInt(afterA.cases.pending)).toBe(BigInt(beforeA.cases.pending) + 1n);
    expect(BigInt(afterA.operations.requested)).toBe(BigInt(beforeA.operations.requested) + 1n);
    expect(await metrics.metrics(societyB)).toEqual(beforeB);
  });

  it('rolls back case resolution when its response cannot be read in the same context', async () => {
    const payment = await reconciliationPayment();
    const c = await reconciliation.openOrRefreshCase(societyA, payment, 'RLS_FIXTURE') as { id: string };
    const failing = new PaymentReconciliationService({
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        runtime.withTenantContext(scope, tx => run(new Proxy(tx, {
          get(target, key) { return key === '$queryRaw' ? async () => { throw new Error('response unavailable'); } : Reflect.get(target, key); },
        }))),
    } as never);
    await expect(failing.resolveCase(societyA, owner, c.id, 'Evidence verified')).rejects.toThrow('response unavailable');
    expect(await reconciliation.getCase(societyA, c.id)).toMatchObject({ status: 'PENDING', resolvedAt: null });
    const [context] = await runtime.$queryRaw<Array<{ societyId: string | null }>>(Prisma.sql`
      SELECT current_setting(${TENANT_CONTEXT_SETTING}, true) AS "societyId"`);
    expect([societyA, societyB]).not.toContain(context.societyId);
  });

  it('keeps resident/admin invoice and payment reads inside their selected society', async () => {
    const local = await invoice(), foreign = await invoice(societyB, unitB);
    const mine = await billing.listMine(societyA, owner) as Array<{ id: string }>;
    expect(mine.some(row => row.id === local.id)).toBe(true);
    expect(mine.some(row => row.id === foreign.id)).toBe(false);
    expect(await billing.listMine(societyA, tenant)).toEqual([]);
    const payable = await billing.listPayable(societyA, tenant) as Array<{ id: string }>;
    expect(payable.some(row => row.id === local.id)).toBe(true);
    expect(await billing.listPayable(societyA, tenant, unitB)).toEqual([]);
    const remote = await billing.listForSociety(societyB) as Array<{ id: string }>;
    expect(remote.some(row => row.id === foreign.id)).toBe(true);
    expect(remote.some(row => row.id === local.id)).toBe(false);
    expect(await billing.listBillableUnits(societyA)).toEqual([{ id: unitA, unitNumber: '1', buildingName: 'Fixture' }]);
    const otherOrder = await orders.createPayment(societyB, owner, foreign.id, randomUUID()) as { id: string };
    const localOrder = await orders.createPayment(societyA, owner, local.id, randomUUID()) as { id: string };
    const audit = await billing.listPaymentAudit(societyA) as Array<{ id: string }>;
    expect(audit.some(row => row.id === localOrder.id)).toBe(true);
    expect(audit.some(row => row.id === otherOrder.id)).toBe(false);
  });

  it('keeps AutoPay preferences payer-private and rejects foreign property substitution', async () => {
    await billing.setAutopayPreference(societyA, owner, { unitId: unitA, enabled: true, debitDaysBefore: 2 });
    expect(await billing.getAutopayPreference(societyA, owner, unitA)).toMatchObject({ enabled: true, automaticDebitAvailable: false });
    expect(await billing.getAutopayPreference(societyA, tenant, unitA)).toMatchObject({ enabled: false, automaticDebitAvailable: false });
    await expect(billing.setAutopayPreference(societyA, owner, { unitId: unitB, enabled: true, debitDaysBefore: 1 }))
      .rejects.toThrow('Current owner or tenant relationship is required');
  });

  it('commits owner/tenant dues delivery intent with issuance and rolls back failed delivery persistence', async () => {
    const published: unknown[] = [];
    const service = new BillingService(runtime, { publishResident: (event: unknown) => published.push(event) } as never,
      new PushDeliveryOutboxService(runtime));
    const issued = await service.issue(societyA, owner, { unitId: unitA, billingPeriod: '2026-11', amountPaise: 1000, dueDate: '2026-11-30' });
    const delivery = await fixture.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT "userId" FROM "PushDeliveryOutbox" WHERE "societyId"=${societyA}::uuid AND "payload"->>'invoiceId'=${issued.id}`);
    expect(delivery.map(row => row.userId).sort()).toEqual([owner, tenant].sort());
    expect(published).toHaveLength(2);
    const failing = new BillingService(runtime, { publishResident: () => { throw new Error('uncommitted publication'); } } as never,
      { enqueue: async () => { throw new Error('outbox unavailable'); } } as never);
    await expect(failing.issue(societyA, owner, { unitId: unitA, billingPeriod: '2026-12', amountPaise: 1000, dueDate: '2026-12-31' }))
      .rejects.toThrow('outbox unavailable');
    const rolledBack = await fixture.$queryRaw(Prisma.sql`
      SELECT "id" FROM "MaintenanceInvoice" WHERE "societyId"=${societyA}::uuid AND "billingPeriod"='2026-12'`);
    expect(rolledBack).toEqual([]);
  });

  it('scopes webhook visibility/replay and applies a captured event exactly once', async () => {
    const { bill, order, receipt, event } = await paymentReceipt();
    const local = await billing.listWebhookReceipts(societyA) as Array<{ id: string }>;
    const foreign = await billing.listWebhookReceipts(societyB) as Array<{ id: string }>;
    expect(local.some(row => row.id === receipt.id)).toBe(true);
    expect(foreign.some(row => row.id === receipt.id)).toBe(false);
    await expect(billing.replayWebhookReceipt(societyB, owner, receipt.id)).rejects.toThrow('receipt not found');
    await expect(billing.replayWebhookReceipt(societyA, owner, receipt.id)).resolves.toMatchObject({ ok: true, paymentId: order.id });
    await expect(billing.replayWebhookReceipt(societyA, owner, receipt.id)).resolves.toMatchObject({ duplicate: true });
    const [saved] = await fixture.$queryRaw<Array<{ status: string }>>(Prisma.sql`SELECT "status" FROM "MaintenanceInvoice" WHERE "id"=${bill.id}::uuid`);
    expect(saved.status).toBe('PAID');
    const events = await fixture.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentEvent" WHERE "providerEventId"=${event.eventId}`);
    expect(events).toHaveLength(1);
  });

  it('persists scoped failure evidence after rolling back a rejected payment transition', async () => {
    const { order, receipt, event } = await paymentReceipt('REFUNDED');
    await expect(billing.replayWebhookReceipt(societyA, owner, receipt.id)).rejects.toThrow('Invalid payment state transition');
    const [saved] = await fixture.$queryRaw<Array<{ processingStatus: string; replayCount: number; lastError: string }>>(Prisma.sql`
      SELECT "processingStatus","replayCount","lastError" FROM "PaymentWebhookReceipt" WHERE "id"=${receipt.id}::uuid`);
    expect(saved).toMatchObject({ processingStatus: 'FAILED', replayCount: 1, lastError: 'Invalid payment state transition' });
    const [unchanged] = await fixture.$queryRaw<Array<{ status: string }>>(Prisma.sql`SELECT "status" FROM "Payment" WHERE "id"=${order.id}::uuid`);
    expect(unchanged.status).toBe('REFUNDED');
    expect(await fixture.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentEvent" WHERE "providerEventId"=${event.eventId}`)).toEqual([]);
  });

  it('uses a real non-owner role without superuser or RLS bypass privileges', async () => {
    const [identity] = await runtime.$queryRaw<Array<{ superuser: boolean; bypass: boolean; owns: boolean }>>(Prisma.sql`
      SELECT r.rolsuper AS superuser, r.rolbypassrls AS bypass,
        r.oid = (SELECT c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=${schema} AND c.relname='Payment') AS owns
      FROM pg_roles r WHERE r.rolname=current_user`);
    expect(identity).toEqual({ superuser: false, bypass: false, owns: false });
  });

  it('denies context-free reads and writes even when SQL knows an invoice id', async () => {
    const bill = await invoice();
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "MaintenanceInvoice" WHERE "id"=${bill.id}::uuid`)).toEqual([]);
    await expect(runtime.$executeRaw(Prisma.sql`
      INSERT INTO "PaymentEvent" ("societyId","paymentId","type") VALUES (${societyA}::uuid,${randomUUID()}::uuid,'TEST')`)).rejects.toThrow(/row-level security/i);
  });

  it('creates owner and current-tenant orders inside their selected society', async () => {
    for (const user of [owner, tenant]) {
      const bill = await invoice();
      const order = await orders.createPayment(societyA, user, bill.id, randomUUID());
      expect(order).toMatchObject({ societyId: societyA, payerUserId: user });
    }
  });

  it('creates only the requesting resident\'s snapshotted amenity deposit', async () => {
    const startsAt = new Date(Date.now() + 3_600_000);
    const [booking] = await fixture.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "AmenityBooking"
        ("id","societyId","amenityId","unitId","userId","startsAt","endsAt","status","depositPaise","depositStatus","depositDueAt","updatedAt")
      VALUES (${randomUUID()}::uuid,${societyA}::uuid,${randomUUID()}::uuid,${unitA}::uuid,${tenant}::uuid,
        ${startsAt},${new Date(startsAt.getTime()+3_600_000)},'CONFIRMED',25000,'PAYMENT_REQUIRED',${startsAt},CURRENT_TIMESTAMP)
      RETURNING "id"`);
    const order = await orders.createAmenityDepositPayment(societyA, tenant, booking.id, randomUUID());
    expect(order).toMatchObject({ amenityBookingId: booking.id, amountPaise: 25000, payerUserId: tenant });
    await expect(orders.createAmenityDepositPayment(societyA, owner, booking.id, randomUUID()))
      .rejects.toThrow('Amenity booking not found');
    await expect(orders.createAmenityDepositPayment(societyB, tenant, booking.id, randomUUID()))
      .rejects.toThrow('Amenity booking not found');
  });

  it('isolates shared payer retry keys and denies foreign invoice substitution', async () => {
    const a = await invoice(), b = await invoice(societyB, unitB), key = randomUUID();
    const first = await orders.createPayment(societyA, owner, a.id, key) as { id: string };
    const second = await orders.createPayment(societyB, owner, b.id, key) as { id: string };
    expect(first.id).not.toBe(second.id);
    await expect(orders.createPayment(societyA, owner, b.id, randomUUID())).rejects.toThrow('Invoice not found');
    expect(await runtime.withTenantContext(societyA, tx => tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Payment" WHERE "societyId"=${societyB}::uuid`))).toEqual([]);
  });

  it('keeps revoked ownership denied even inside a valid tenant context', async () => {
    const bill = await invoice();
    await fixture.$executeRaw(Prisma.sql`UPDATE "UnitOwnership" SET "active"=FALSE WHERE "societyId"=${societyA}::uuid`);
    try {
      await expect(orders.createPayment(societyA, owner, bill.id, randomUUID())).rejects.toThrow('Invoice not found');
    } finally { await fixture.$executeRaw(Prisma.sql`UPDATE "UnitOwnership" SET "active"=TRUE WHERE "societyId"=${societyA}::uuid`); }
  });

  it('enforces RLS on cross-tenant insert, update and delete operations', async () => {
    const foreign = await invoice(societyB, unitB);
    const hidden = await runtime.withTenantContext(societyA, async tx => [
      await tx.$executeRaw(Prisma.sql`UPDATE "MaintenanceInvoice" SET "description"='forbidden' WHERE "id"=${foreign.id}::uuid`),
      await tx.$executeRaw(Prisma.sql`DELETE FROM "MaintenanceInvoice" WHERE "id"=${foreign.id}::uuid`),
    ]);
    expect(hidden).toEqual([0, 0]);
    await expect(runtime.withTenantContext(societyA, tx => tx.$executeRaw(Prisma.sql`
      INSERT INTO "PaymentEvent" ("societyId","paymentId","type") VALUES (${societyB}::uuid,${randomUUID()}::uuid,'TEST')`))).rejects.toThrow(/row-level security/i);
    const own = await invoice();
    await expect(runtime.withTenantContext(societyA, tx => tx.$executeRaw(Prisma.sql`
      UPDATE "MaintenanceInvoice" SET "societyId"=${societyB}::uuid WHERE "id"=${own.id}::uuid`)))
      .rejects.toThrow(/row-level security/i);
  });

  it('exports a private repeatable-read statement and leaves pooled context clear', async () => {
    const bills = await Promise.all([invoice(), invoice()]);
    const payments = await Promise.all([owner, tenant].map(async (payer, index) => {
      const [payment] = await fixture.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "Payment"
          ("id","societyId","invoiceId","payerUserId","amountPaise","idempotencyKey","provider","providerOrderId","status","updatedAt")
        VALUES (${randomUUID()}::uuid,${societyA}::uuid,${bills[index].id}::uuid,${payer}::uuid,1000,
          ${randomUUID()},'RLS_FIXTURE',${randomUUID()},'CAPTURED',CURRENT_TIMESTAMP) RETURNING "id"`);
      return payment;
    }));
    const day = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
    const statement = await new ResidentStatementService(runtime).statement(societyA, tenant, unitA, day, day);
    expect(statement).toMatchObject({ unitId: unitA, scope: 'MAINTENANCE_ACTIVITY' });
    expect(statement.payments.some(row => row.id === payments[1].id)).toBe(true);
    expect(statement.payments.some(row => row.id === payments[0].id)).toBe(false);
    const history = await billing.listPaymentsMine(societyA, tenant) as Array<{ id: string }>;
    expect(history.some(row => row.id === payments[1].id)).toBe(true);
    expect(history.some(row => row.id === payments[0].id)).toBe(false);
    expect(await billing.getReceipt(societyA, owner, payments[1].id)).toMatchObject({ paymentId: payments[1].id });
    await expect(billing.getReceipt(societyA, tenant, payments[0].id)).rejects.toThrow('Receipt not found');
    await expect(new ResidentStatementService(runtime).statement(societyA, tenant, unitB, day, day)).rejects.toThrow('Property not found');
    const [context] = await runtime.$queryRaw<Array<{ societyId: string | null }>>(Prisma.sql`
      SELECT current_setting(${TENANT_CONTEXT_SETTING}, true) AS "societyId"`);
    expect([societyA, societyB]).not.toContain(context.societyId);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "MaintenanceInvoice"`)).toEqual([]);
  });

  it('keeps simultaneous societies and rolled-back pooled connections isolated', async () => {
    const scopes = Array.from({ length: 8 }, (_, index) => index % 2 ? societyA : societyB);
    const observed = await Promise.all(scopes.map(scope => runtime.withTenantContext(scope, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT 1::int AS ok FROM pg_sleep(0.005)`);
      return tx.$queryRaw<Array<{ societyId: string }>>(Prisma.sql`SELECT DISTINCT "societyId" FROM "MaintenanceInvoice"`);
    })));
    expect(observed.map(rows => rows.map(row => row.societyId))).toEqual(scopes.map(scope => [scope]));
    const failed = await Promise.allSettled([societyA, societyB].map(scope => runtime.withTenantContext(scope, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT 1::int AS ok FROM pg_sleep(0.005)`);
      throw new Error('fixture rollback');
    })));
    expect(failed.every(result => result.status === 'rejected')).toBe(true);
    const unscoped = await Promise.all([0, 1].map(() => runtime.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT 1::int AS ok FROM pg_sleep(0.005)`);
      return tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MaintenanceInvoice"`);
    })));
    expect(unscoped).toEqual([[], []]);
    const isolation = await runtime.withTenantContext(societyA, tx => tx.$queryRaw(Prisma.sql`SHOW transaction_isolation`),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    expect(isolation).toEqual([{ transaction_isolation: 'repeatable read' }]);
  });
});
