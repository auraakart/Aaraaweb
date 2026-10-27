import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';
import { PaymentOrderService } from './payment-order.service';
import { ResidentStatementService } from './resident-statement.service';

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
  const owner = randomUUID(), tenant = randomUUID();
  const societyA = randomUUID(), societyB = randomUUID();
  const buildingA = randomUUID(), buildingB = randomUUID();
  const unitA = randomUUID(), unitB = randomUUID();
  const tables = ['User', 'Society', 'Building', 'Unit', 'UnitOwnership', 'UnitOccupancy',
    'MaintenanceInvoice', 'Payment', 'PaymentEvent', 'AmenityBooking'];
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
    const definitions: string[] = [];
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
