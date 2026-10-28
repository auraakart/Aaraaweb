import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';
import { PaymentOrderService } from './payment-order.service';
import { ResidentStatementService } from './resident-statement.service';
import { BillingService, type PaymentWebhookEvent } from './billing.service';
import { PushDeliveryOutboxService } from '../notifications/push-delivery-outbox.service';
import { PaymentReconciliationService } from '../accounting/payment-reconciliation.service';
import { PaymentReconciliationObservabilityService } from '../accounting/payment-reconciliation-observability.service';
import { AccountingExportService, ACCOUNTING_EXPORT_CONTRACT_V1 } from '../accounting/accounting-export.service';
import { AccountingConnectorDeliveryService } from '../accounting/accounting-connector-delivery.service';
import { AccountingExportRunner } from '../accounting/accounting-export.runner';
import { AccountingConnectorDeliveryRunner } from '../accounting/accounting-connector-delivery.runner';

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
  const lookupOwner = `${role}_lookup`;
  const claimsOwner = `${role}_claims`;
  const accountingOwner = `${role}_accounting`;
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
    'PaymentRefund', 'PaymentReconciliationCase', 'PaymentGatewayOperation',
    'AccountingExportJob', 'AccountingExportArtifact', 'AccountingConnectorDelivery',
    'AccountingConnectorDeliveryAction', 'AuditEvent', 'JournalEntry', 'JournalLine', 'LedgerAccount', 'AccountingFund'];
  let schemaCreated = false, roleCreated = false, lookupOwnerCreated = false, claimsOwnerCreated = false, accountingOwnerCreated = false;

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
    const definitions: string[] = ['PaymentStatus', 'PaymentReconciliationStatus', 'GatewayOperationType', 'GatewayOperationStatus', 'AuditEventType']
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
    // Exercise the migrated capability with a non-owner, NOBYPASSRLS owner.
    // Its only global policy and column grants apply to this isolated schema.
    executeDdl(`CREATE ROLE "${lookupOwner}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    lookupOwnerCreated = true;
    const resolverMigration = readFileSync(join(__dirname,
      '../../prisma/migrations/20261028060000_v510_payment_callback_resolver/migration.sql'), 'utf8');
    executeDdl(resolverMigration.replaceAll('public.', `"${schema}".`), fixtureUrl.toString());
    executeDdl(`GRANT USAGE, CREATE ON SCHEMA "${schema}" TO "${lookupOwner}";
      GRANT SELECT ("id", "societyId", "providerOrderId", "provider") ON "${schema}"."Payment" TO "${lookupOwner}";
      CREATE POLICY callback_route ON "${schema}"."Payment" FOR SELECT TO "${lookupOwner}" USING (true);
      ALTER FUNCTION "${schema}".aaraagate_resolve_payment_webhook_order(text) OWNER TO "${lookupOwner}";
      REVOKE CREATE ON SCHEMA "${schema}" FROM "${lookupOwner}";`);
    executeDdl(`CREATE ROLE "${claimsOwner}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    claimsOwnerCreated = true;
    const claimsMigration = readFileSync(join(__dirname,
      '../../prisma/migrations/20261028070000_v510_reconciliation_claim_capabilities/migration.sql'), 'utf8');
    executeDdl(claimsMigration.replaceAll('public.', `"${schema}".`), fixtureUrl.toString());
    executeDdl(`GRANT USAGE, CREATE ON SCHEMA "${schema}" TO "${claimsOwner}";
      GRANT SELECT ("id","societyId","paymentId","operationType","provider","providerOperationId","amountPaise","idempotencyKey","attemptCount","status","nextAttemptAt","requestedAt")
        ON "${schema}"."PaymentGatewayOperation" TO "${claimsOwner}";
      GRANT UPDATE ("attemptCount","lastAttemptAt","nextAttemptAt","updatedAt") ON "${schema}"."PaymentGatewayOperation" TO "${claimsOwner}";
      GRANT SELECT ("id","societyId","paymentId","provider","status","lastCheckedAt","createdAt") ON "${schema}"."PaymentReconciliationCase" TO "${claimsOwner}";
      GRANT UPDATE ("lastCheckedAt","updatedAt") ON "${schema}"."PaymentReconciliationCase" TO "${claimsOwner}";
      CREATE POLICY worker_read ON "${schema}"."PaymentGatewayOperation" FOR SELECT TO "${claimsOwner}" USING (true);
      CREATE POLICY worker_update ON "${schema}"."PaymentGatewayOperation" FOR UPDATE TO "${claimsOwner}" USING (true) WITH CHECK (true);
      CREATE POLICY worker_read ON "${schema}"."PaymentReconciliationCase" FOR SELECT TO "${claimsOwner}" USING (true);
      CREATE POLICY worker_update ON "${schema}"."PaymentReconciliationCase" FOR UPDATE TO "${claimsOwner}" USING (true) WITH CHECK (true);
      ALTER FUNCTION "${schema}".aaraagate_claim_payment_gateway_operations() OWNER TO "${claimsOwner}";
      ALTER FUNCTION "${schema}".aaraagate_claim_payment_reconciliation_cases(integer) OWNER TO "${claimsOwner}";
      REVOKE CREATE ON SCHEMA "${schema}" FROM "${claimsOwner}";`);
    executeDdl(`CREATE ROLE "${accountingOwner}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    accountingOwnerCreated = true;
    const accountingMigration = readFileSync(join(__dirname,
      '../../prisma/migrations/20261028080000_v510_accounting_worker_capabilities/migration.sql'), 'utf8');
    executeDdl(accountingMigration.replaceAll('public.', `"${schema}".`), fixtureUrl.toString());
    executeDdl(`GRANT USAGE, CREATE ON SCHEMA "${schema}" TO "${accountingOwner}";
      GRANT SELECT ("id","societyId","format","fromDate","toDate","status","createdAt","leaseUntil","attemptCount")
        ON "${schema}"."AccountingExportJob" TO "${accountingOwner}";
      GRANT UPDATE ("status","attemptCount","lastAttemptAt","leaseUntil","errorCode") ON "${schema}"."AccountingExportJob" TO "${accountingOwner}";
      GRANT SELECT ("jobId","societyId") ON "${schema}"."AccountingExportArtifact" TO "${accountingOwner}";
      GRANT SELECT ("id","societyId","exportJobId","provider","idempotencyKey","attemptCount","status","nextAttemptAt","leaseUntil","createdAt")
        ON "${schema}"."AccountingConnectorDelivery" TO "${accountingOwner}";
      GRANT INSERT ("societyId","exportJobId","provider","idempotencyKey") ON "${schema}"."AccountingConnectorDelivery" TO "${accountingOwner}";
      GRANT UPDATE ("status","attemptCount","lastAttemptAt","leaseUntil","updatedAt") ON "${schema}"."AccountingConnectorDelivery" TO "${accountingOwner}";
      CREATE POLICY accounting_read ON "${schema}"."AccountingExportJob" FOR SELECT TO "${accountingOwner}" USING (true);
      CREATE POLICY accounting_update ON "${schema}"."AccountingExportJob" FOR UPDATE TO "${accountingOwner}" USING (true) WITH CHECK (true);
      CREATE POLICY accounting_read ON "${schema}"."AccountingExportArtifact" FOR SELECT TO "${accountingOwner}" USING (true);
      CREATE POLICY accounting_read ON "${schema}"."AccountingConnectorDelivery" FOR SELECT TO "${accountingOwner}" USING (true);
      CREATE POLICY accounting_update ON "${schema}"."AccountingConnectorDelivery" FOR UPDATE TO "${accountingOwner}" USING (true) WITH CHECK (true);
      CREATE POLICY accounting_insert ON "${schema}"."AccountingConnectorDelivery" FOR INSERT TO "${accountingOwner}" WITH CHECK (true);
      ALTER FUNCTION "${schema}".aaraagate_claim_accounting_export(integer) OWNER TO "${accountingOwner}";
      ALTER FUNCTION "${schema}".aaraagate_seed_accounting_deliveries(text) OWNER TO "${accountingOwner}";
      ALTER FUNCTION "${schema}".aaraagate_claim_accounting_deliveries(integer) OWNER TO "${accountingOwner}";
      REVOKE CREATE ON SCHEMA "${schema}" FROM "${accountingOwner}";`);
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
    if (lookupOwnerCreated) executeDdl(`DROP ROLE "${lookupOwner}"`);
    if (claimsOwnerCreated) executeDdl(`DROP ROLE "${claimsOwner}"`);
    if (accountingOwnerCreated) executeDdl(`DROP ROLE "${accountingOwner}"`);
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

  async function callbackOrder(scope = societyA, unit = unitA) {
    const bill = await invoice(scope, unit);
    const created = await orders.createPayment(scope, owner, bill.id, randomUUID()) as { id: string };
    const [order] = await fixture.$queryRaw<Array<{ id: string; providerOrderId: string }>>(Prisma.sql`
      SELECT "id","providerOrderId" FROM "Payment" WHERE "id"=${created.id}::uuid`);
    return order;
  }

  async function connectorJob(scope = societyA) {
    const id = randomUUID(), exportJobId = randomUUID(), artifactId = randomUUID(), key = randomUUID();
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "AccountingExportJob"
      ("id","societyId","requestedByUserId","idempotencyKey","requestHash","contractVersion","format","fromDate","toDate","status","recordCount","artifactKey","completedAt")
      VALUES (${exportJobId}::uuid,${scope}::uuid,${owner}::uuid,${key},${'a'.repeat(64)},'aaraagate.accounting.journal.v1','CSV',
        DATE '2026-10-01',DATE '2026-10-31','COMPLETED',1,${artifactId},CURRENT_TIMESTAMP)`);
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "AccountingExportArtifact"
      ("id","societyId","jobId","filename","contentType","sha256","byteLength","content")
      VALUES (${artifactId}::uuid,${scope}::uuid,${exportJobId}::uuid,'journal.csv','text/csv',${'a'.repeat(64)},4,'a,b\n')`);
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "AccountingConnectorDelivery"
      ("id","societyId","exportJobId","provider","idempotencyKey","status","attemptCount","leaseUntil")
      VALUES (${id}::uuid,${scope}::uuid,${exportJobId}::uuid,'RLS_CONNECTOR',${key},'PROCESSING',1,CURRENT_TIMESTAMP+INTERVAL '1 hour')`);
    return { id, societyId: scope, exportJobId, provider: 'RLS_CONNECTOR', idempotencyKey: key, attemptCount: 1 };
  }

  async function executeConnector(job: Awaited<ReturnType<typeof connectorJob>>, fail = false) {
    const sent: unknown[] = [];
    // Global dispatch is a simulated, server-owned handoff. Only per-job I/O is
    // under test here; this does not certify global seeding/claim permissions.
    const dispatch = {
      $executeRaw: async () => 0,
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ $queryRaw: async () => [job] }),
      $queryRaw: async (sql: Prisma.Sql) => {
        if (sql.sql.includes('aaraagate_seed_accounting_deliveries')) return [];
        if (sql.sql.includes('aaraagate_claim_accounting_deliveries')) return [job];
        throw new Error('unscoped artifact access');
      },
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.withTenantContext(scope, run),
    };
    await new AccountingConnectorDeliveryRunner(dispatch as never, {
      provider: 'RLS_CONNECTOR', deliver: async (input: unknown) => {
        sent.push(input);
        if (fail) throw new Error('Bearer confidential-provider-token');
        return { status: 'DELIVERED', providerReceiptId: 'rls-receipt' };
      },
    } as never).runOnce();
    return sent;
  }

  it('delivers connector artifacts in each stored society and commits scoped result evidence', async () => {
    for (const scope of [societyA, societyB]) {
      const job = await connectorJob(scope);
      expect(await executeConnector(job)).toEqual([expect.objectContaining({ societyId: scope, exportJobId: job.exportJobId,
        idempotencyKey: job.idempotencyKey, content: Buffer.from('a,b\n'), sha256: 'a'.repeat(64) })]);
      const [saved] = await fixture.$queryRaw<Array<{ status: string; providerReceiptId: string; leaseUntil: Date | null }>>(Prisma.sql`
        SELECT "status","providerReceiptId","leaseUntil" FROM "AccountingConnectorDelivery" WHERE "id"=${job.id}::uuid`);
      expect(saved).toEqual({ status: 'DELIVERED', providerReceiptId: 'rls-receipt', leaseUntil: null });
    }
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "content" FROM "AccountingExportArtifact"`)).toEqual([]);
  });

  it('denies foreign connector routing without sending bytes or updating the foreign delivery', async () => {
    const job = await connectorJob(societyB);
    expect(await executeConnector({ ...job, societyId: societyA })).toEqual([]);
    const [saved] = await fixture.$queryRaw<Array<{ status: string; failureMessage: string | null }>>(Prisma.sql`
      SELECT "status","failureMessage" FROM "AccountingConnectorDelivery" WHERE "id"=${job.id}::uuid`);
    expect(saved).toEqual({ status: 'PROCESSING', failureMessage: null });
  });

  it('records sanitized connector failure and retry state in the selected society', async () => {
    const job = await connectorJob();
    expect(await executeConnector(job, true)).toHaveLength(1);
    const [saved] = await fixture.$queryRaw<Array<{ status: string; failureCode: string; failureMessage: string; leaseUntil: Date | null; retrySeconds: number }>>(Prisma.sql`
      SELECT "status","failureCode","failureMessage","leaseUntil",EXTRACT(EPOCH FROM ("nextAttemptAt"-"updatedAt"))::integer AS "retrySeconds"
      FROM "AccountingConnectorDelivery" WHERE "id"=${job.id}::uuid`);
    expect(saved).toEqual({ status: 'UNKNOWN', failureCode: 'DELIVERY_RETRY', failureMessage: 'Error', leaseUntil: null, retrySeconds: 60 });
  });

  it('denies a connector export whose artifact relationship crosses societies', async () => {
    const job = await connectorJob();
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingExportArtifact" SET "societyId"=${societyB}::uuid WHERE "jobId"=${job.exportJobId}::uuid`);
    expect(await executeConnector(job)).toEqual([]);
    const [saved] = await fixture.$queryRaw<Array<{ status: string; failureCode: string }>>(Prisma.sql`
      SELECT "status","failureCode" FROM "AccountingConnectorDelivery" WHERE "id"=${job.id}::uuid`);
    expect(saved).toEqual({ status: 'UNKNOWN', failureCode: 'DELIVERY_RETRY' });
  });

  it('creates and replays export requests in each society with exactly one audit event', async () => {
    const exports = new AccountingExportService(runtime);
    for (const scope of [societyA, societyB]) {
      const input = { idempotencyKey: randomUUID(), contractVersion: ACCOUNTING_EXPORT_CONTRACT_V1,
        format: 'CSV' as const, fromDate: '2026-10-01', toDate: '2026-10-31' };
      const created = await exports.create(scope, owner, input);
      expect((await exports.create(scope, owner, input)).id).toBe(created.id);
      await expect(exports.create(scope, owner, { ...input, format: 'JSONL' })).rejects.toThrow(/different export request/);
      expect((await exports.get(scope, created.id)).id).toBe(created.id);
      expect((await exports.list(scope)).some(row => row.id === created.id)).toBe(true);
      await expect(exports.get(scope === societyA ? societyB : societyA, created.id)).rejects.toThrow(/not found/);
      const audits = await fixture.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::integer AS count FROM "AuditEvent" WHERE "societyId"=${scope}::uuid AND "event"='ACCOUNTING_EXPORT_REQUESTED'`);
      expect(audits[0].count).toBe(1);
    }
    expect(await runtime.$queryRaw(Prisma.sql`SELECT * FROM "AuditEvent"`)).toEqual([]);
  });

  it('executes a scoped empty export and downloads only the owning society artifact', async () => {
    const exports = new AccountingExportService(runtime);
    const created = await exports.create(societyA, owner, { idempotencyKey: randomUUID(), contractVersion: ACCOUNTING_EXPORT_CONTRACT_V1,
      format: 'JSONL', fromDate: '2026-10-01', toDate: '2026-10-31' });
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingExportJob" SET "status"='PROCESSING' WHERE "id"=${created.id}::uuid`);
    await exports.executeClaimed({ ...created, societyId: societyA });
    expect(await exports.get(societyA, created.id)).toMatchObject({ status: 'COMPLETED', recordCount: 0, errorCode: null });
    expect(await exports.artifact(societyA, created.id)).toMatchObject({ content: '', byteLength: 0 });
    await expect(exports.artifact(societyB, created.id)).rejects.toThrow(/not found/);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT * FROM "AccountingExportArtifact"`)).toEqual([]);
  });

  it('retains isolated connector retry audit, evidence and metrics without changing provider keys', async () => {
    const service = new AccountingConnectorDeliveryService(runtime, {} as never);
    for (const scope of [societyA, societyB]) {
      const job = await connectorJob(scope);
      await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingConnectorDelivery" SET "status"='FAILED',"attemptCount"=5,"failureCode"='DELIVERY_RETRY_EXHAUSTED',"completedAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL WHERE "id"=${job.id}::uuid`);
      const foreign = scope === societyA ? societyB : societyA;
      await expect(service.retry(foreign, owner, job.id)).rejects.toThrow(/not found/);
      await expect(service.evidence(foreign, job.id)).rejects.toThrow(/not found/);
      expect((await service.retry(scope, owner, job.id))).toMatchObject({ status: 'QUEUED', attemptCount: 0, completedAt: null });
      await expect(service.retry(scope, owner, job.id)).rejects.toThrow(/Only failed or unknown/);
      const evidence = await service.evidence(scope, job.id);
      expect(evidence.delivery.idempotencyKey).toBe(job.idempotencyKey);
      expect(evidence.actions).toEqual([expect.objectContaining({ actorUserId: owner, fromStatus: 'FAILED', previousAttemptCount: 5 })]);
      expect(evidence.artifact).not.toHaveProperty('content');
      expect((await service.actions(foreign)).some(row => row.deliveryId === job.id)).toBe(false);
      expect((await service.list(foreign)).some(row => row.id === job.id)).toBe(false);
      expect((await service.actions(scope)).some(row => row.deliveryId === job.id)).toBe(true);
      const metrics = await service.metrics(scope);
      const [expected] = await fixture.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::integer AS count FROM "AccountingConnectorDelivery" WHERE "societyId"=${scope}::uuid`);
      expect(metrics.totals.totalCount).toBe(expected.count);
      expect(metrics.providers.reduce((sum, row) => sum + row.totalCount, 0)).toBe(expected.count);
    }
    expect(await runtime.$queryRaw(Prisma.sql`SELECT * FROM "AccountingConnectorDeliveryAction"`)).toEqual([]);
  });

  type AccountingClaim = { id: string; societyId: string; attemptCount?: number };
  function claimAccounting(client: Prisma.TransactionClient, kind: 'export' | 'delivery', seconds: number | null = 300) {
    return kind === 'export'
      ? client.$queryRaw<AccountingClaim[]>(Prisma.sql`SELECT * FROM aaraagate_claim_accounting_export(${seconds}::integer)`)
      : client.$queryRaw<AccountingClaim[]>(Prisma.sql`SELECT * FROM aaraagate_claim_accounting_deliveries(${seconds}::integer)`);
  }
  async function clearAccountingFixture() {
    // UUID-isolated copied tables only. Public append-only evidence is retained.
    for (const table of ['AccountingConnectorDeliveryAction', 'AccountingConnectorDelivery', 'AccountingExportArtifact', 'AccountingExportJob']) {
      await fixture.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)}`);
    }
  }
  async function queuedExports(count: number) {
    const jobs = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), scope: i % 2 ? societyA : societyB,
      at: new Date(Date.now() - 86_400_000 + i * 1000), key: randomUUID() }));
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "AccountingExportJob"
      ("id","societyId","requestedByUserId","idempotencyKey","requestHash","contractVersion","format","fromDate","toDate","createdAt")
      VALUES ${Prisma.join(jobs.map(j => Prisma.sql`(${j.id}::uuid,${j.scope}::uuid,${owner}::uuid,${j.key},${'a'.repeat(64)},'aaraagate.accounting.journal.v1','JSONL',DATE '2026-10-01',DATE '2026-10-31',${j.at})`))}`);
    return jobs;
  }

  it('denies accounting capabilities until granted and limits non-owner privilege to dispatch metadata', async () => {
    await expect(claimAccounting(runtime, 'export')).rejects.toThrow(/permission denied for function/);
    await expect(claimAccounting(runtime, 'delivery')).rejects.toThrow(/permission denied for function/);
    await expect(runtime.$queryRaw(Prisma.sql`SELECT aaraagate_seed_accounting_deliveries('RLS_CONNECTOR')`)).rejects.toThrow(/permission denied for function/);
    const [identity] = await runtime.$queryRaw<Array<Record<string, boolean>>>(Prisma.sql`
      SELECT pg_has_role(current_user,r.oid,'MEMBER') AS member,r.rolsuper AS superuser,r.rolbypassrls AS bypass,r.rolcanlogin AS login,
        has_column_privilege(r.oid,a.oid,'content','SELECT') AS "contentRead",
        has_table_privilege(r.oid,j.oid,'DELETE') AS "deleteJobs",j.relowner=r.oid AS owns
      FROM pg_roles r JOIN pg_class j ON j.relname='AccountingExportJob' JOIN pg_namespace n ON n.oid=j.relnamespace
      JOIN pg_class a ON a.relnamespace=n.oid AND a.relname='AccountingExportArtifact'
      WHERE r.rolname=${accountingOwner} AND n.nspname=${schema}`);
    expect(identity).toEqual({ member: false, superuser: false, bypass: false, login: false, contentRead: false, deleteJobs: false, owns: false });
    const metadata = await runtime.$queryRaw<Array<{ definer: boolean; strict: boolean; settings: string[]; publicExecute: boolean }>>(Prisma.sql`
      SELECT p.prosecdef AS definer,p.proisstrict AS strict,p.proconfig AS settings,
        EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=${schema} AND p.proname IN ('aaraagate_claim_accounting_export','aaraagate_seed_accounting_deliveries','aaraagate_claim_accounting_deliveries')`);
    expect(metadata).toHaveLength(3);
    for (const row of metadata) {
      expect(row).toMatchObject({ definer: true, strict: true, publicExecute: false });
      expect(row.settings).toEqual(expect.arrayContaining(['search_path=pg_catalog, pg_temp','row_security=on']));
    }
    executeDdl(`GRANT EXECUTE ON FUNCTION "${schema}".aaraagate_claim_accounting_export(integer),
      "${schema}".aaraagate_seed_accounting_deliveries(text),"${schema}".aaraagate_claim_accounting_deliveries(integer) TO "${role}"`);
  });

  it('seeds only completed same-society artifacts and keeps duplicate-safe provider keys', async () => {
    await clearAccountingFixture();
    const a = await connectorJob(), b = await connectorJob(societyB), bad = await connectorJob();
    await fixture.$executeRaw(Prisma.sql`DELETE FROM "AccountingConnectorDelivery"`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingExportArtifact" SET "societyId"=${societyB}::uuid WHERE "jobId"=${bad.exportJobId}::uuid`);
    await queuedExports(1);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT aaraagate_seed_accounting_deliveries(NULL::text) AS count`)).toEqual([{count:null}]);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT aaraagate_seed_accounting_deliveries('RLS_CONNECTOR') AS count`)).toEqual([{count:2n}]);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT aaraagate_seed_accounting_deliveries('RLS_CONNECTOR') AS count`)).toEqual([{count:0n}]);
    const saved = await fixture.$queryRaw<Array<{ exportJobId: string; societyId: string; idempotencyKey: string }>>(Prisma.sql`
      SELECT "exportJobId","societyId","idempotencyKey" FROM "AccountingConnectorDelivery"`);
    expect(saved).toHaveLength(2);
    for (const job of [a,b]) expect(saved).toContainEqual({ exportJobId: job.exportJobId, societyId: job.societyId, idempotencyKey: `accounting-export:${job.exportJobId}:RLS_CONNECTOR` });
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "AccountingConnectorDelivery"`)).toEqual([]);
    await clearAccountingFixture();
  });

  it('claims one oldest queued or expired export and exposes only execution fields', async () => {
    await clearAccountingFixture();
    const jobs = await queuedExports(5);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingExportJob" SET "status"='PROCESSING',"leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE "id"=${jobs[0].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingExportJob" SET "status"='PROCESSING',"leaseUntil"=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE "id"=${jobs[2].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingExportJob" SET "status"='FAILED',"completedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobs[3].id}::uuid`);
    for (const seconds of [null,0,59,-1]) expect(await claimAccounting(runtime,'export',seconds)).toEqual([]);
    const first = await claimAccounting(runtime,'export');
    expect(first).toEqual([{ id:jobs[0].id, societyId:jobs[0].scope, format:'JSONL', fromDate:new Date('2026-10-01'), toDate:new Date('2026-10-31') }]);
    expect((await claimAccounting(runtime,'export')).map(j=>j.id)).toEqual([jobs[1].id]);
    expect((await claimAccounting(runtime,'export')).map(j=>j.id)).toEqual([jobs[4].id]);
    expect(await claimAccounting(runtime,'export')).toEqual([]);
    const [saved] = await fixture.$queryRaw<Array<{ attemptCount: number; seconds: number; key: string }>>(Prisma.sql`
      SELECT "attemptCount",EXTRACT(EPOCH FROM ("leaseUntil"-"lastAttemptAt"))::integer AS seconds,"idempotencyKey" AS key FROM "AccountingExportJob" WHERE "id"=${jobs[0].id}::uuid`);
    expect(saved).toEqual({ attemptCount:1, seconds:300, key:jobs[0].key });
    await clearAccountingFixture();
  });

  it('claims twenty due deliveries, retains stored keys and excludes terminal or fresh leases', async () => {
    await clearAccountingFixture();
    const jobs = await queuedExports(25);
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "AccountingConnectorDelivery"
      ("id","societyId","exportJobId","provider","idempotencyKey","status","createdAt")
      VALUES ${Prisma.join(jobs.map(j=>Prisma.sql`(${j.id}::uuid,${j.scope}::uuid,${j.id}::uuid,'RLS_CONNECTOR',${j.key},'QUEUED',${j.at})`))}`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingConnectorDelivery" SET "status"='PROCESSING',"leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE "id"=${jobs[0].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingConnectorDelivery" SET "status"='UNKNOWN' WHERE "id"=${jobs[1].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingConnectorDelivery" SET "status"='ACCEPTED' WHERE "id"=${jobs[2].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingConnectorDelivery" SET "status"='DELIVERED',"completedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobs[22].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingConnectorDelivery" SET "nextAttemptAt"=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE "id"=${jobs[23].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "AccountingConnectorDelivery" SET "status"='PROCESSING',"leaseUntil"=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE "id"=${jobs[24].id}::uuid`);
    for (const seconds of [null,0,59,-1]) expect(await claimAccounting(runtime,'delivery',seconds)).toEqual([]);
    const first = await claimAccounting(runtime,'delivery');
    expect(first.map(j=>j.id)).toEqual(jobs.slice(0,20).map(j=>j.id));
    expect(first[0]).toEqual({ id:jobs[0].id, societyId:jobs[0].scope, exportJobId:jobs[0].id, provider:'RLS_CONNECTOR', idempotencyKey:jobs[0].key, attemptCount:1 });
    expect((await claimAccounting(runtime,'delivery')).map(j=>j.id)).toEqual(jobs.slice(20,22).map(j=>j.id));
    expect(await claimAccounting(runtime,'delivery')).toEqual([]);
    const [saved] = await fixture.$queryRaw<Array<{ attemptCount: number; seconds: number }>>(Prisma.sql`
      SELECT "attemptCount",EXTRACT(EPOCH FROM ("leaseUntil"-"lastAttemptAt"))::integer AS seconds FROM "AccountingConnectorDelivery" WHERE "id"=${jobs[0].id}::uuid`);
    expect(saved).toEqual({ attemptCount:1, seconds:300 });
    await clearAccountingFixture();
  });

  it.each(['export','delivery'] as const)('skips locked accounting %s work and restores rolled-back claims', async kind => {
    await clearAccountingFixture();
    const jobs = await queuedExports(kind === 'export' ? 2 : 21), limit = kind === 'export' ? 1 : 20;
    if (kind === 'delivery') await fixture.$executeRaw(Prisma.sql`INSERT INTO "AccountingConnectorDelivery"
      ("id","societyId","exportJobId","provider","idempotencyKey","createdAt")
      VALUES ${Prisma.join(jobs.map(j=>Prisma.sql`(${j.id}::uuid,${j.scope}::uuid,${j.id}::uuid,'RLS_CONNECTOR',${j.key},${j.at})`))}`);
    let release!: () => void, ready!: (rows: AccountingClaim[]) => void;
    const gate = new Promise<void>(resolve=>{release=resolve;});
    const started = new Promise<AccountingClaim[]>(resolve=>{ready=resolve;});
    const pending = runtime.$transaction(async tx=>{
      const claimed=await claimAccounting(tx,kind);ready(claimed);await gate;throw new Error('accounting rollback');
    },{timeout:10000});
    const rejected=expect(pending).rejects.toThrow('accounting rollback');
    try {
      expect((await started).map(j=>j.id)).toEqual(jobs.slice(0,limit).map(j=>j.id));
      expect((await claimAccounting(runtime,kind)).map(j=>j.id)).toEqual(jobs.slice(limit).map(j=>j.id));
    } finally {release();}
    await rejected;
    expect((await claimAccounting(runtime,kind)).map(j=>j.id)).toEqual(jobs.slice(0,limit).map(j=>j.id));
    await clearAccountingFixture();
  });

  it('executes both real worker handoffs under restricted RLS without returning artifact bytes globally', async () => {
    await clearAccountingFixture();
    const jobs=await queuedExports(2);
    await new AccountingExportRunner(runtime,new AccountingExportService(runtime)).runOnce();
    const sent:Array<{societyId:string;exportJobId:string;content:Buffer;idempotencyKey:string}>=[];
    await new AccountingConnectorDeliveryRunner(runtime, {provider:'RLS_CONNECTOR',deliver:async(input:typeof sent[number])=>{
      sent.push(input);return {status:'DELIVERED',providerReceiptId:'rls-worker-receipt'};
    }} as never).runOnce();
    expect(sent).toHaveLength(2);
    for(const job of jobs) expect(sent).toContainEqual(expect.objectContaining({societyId:job.scope,exportJobId:job.id,
      content:Buffer.from(''),idempotencyKey:`accounting-export:${job.id}:RLS_CONNECTOR`}));
    const saved=await fixture.$queryRaw<Array<{status:string;providerReceiptId:string}>>(Prisma.sql`SELECT "status","providerReceiptId" FROM "AccountingConnectorDelivery"`);
    expect(saved).toEqual([expect.objectContaining({status:'DELIVERED',providerReceiptId:'rls-worker-receipt'}),expect.objectContaining({status:'DELIVERED',providerReceiptId:'rls-worker-receipt'})]);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "content" FROM "AccountingExportArtifact"`)).toEqual([]);
    await clearAccountingFixture();
  });

  it('denies capability execution until explicitly granted and never grants owner membership', async () => {
    await expect(runtime.$queryRaw(Prisma.sql`SELECT * FROM aaraagate_resolve_payment_webhook_order('unknown')`))
      .rejects.toThrow(/permission denied for function/i);
    const [privileges] = await runtime.$queryRaw<Array<{ member: boolean; superuser: boolean; bypass: boolean; login: boolean }>>(Prisma.sql`
      SELECT pg_has_role(current_user, r.oid, 'MEMBER') AS member, r.rolsuper AS superuser,
        r.rolbypassrls AS bypass, r.rolcanlogin AS login FROM pg_roles r WHERE r.rolname=${lookupOwner}`);
    expect(privileges).toEqual({ member: false, superuser: false, bypass: false, login: false });
    executeDdl(`GRANT EXECUTE ON FUNCTION "${schema}".aaraagate_resolve_payment_webhook_order(text) TO "${role}"`);
  });

  it('resolves only exact gateway orders to routing identifiers while raw RLS reads stay hidden', async () => {
    const ids: string[] = [];
    for (const [scope, unit] of [[societyA, unitA], [societyB, unitB]]) {
      const order = await callbackOrder(scope, unit);
      ids.push(order.id);
      expect(await runtime.$queryRaw(Prisma.sql`SELECT * FROM aaraagate_resolve_payment_webhook_order(${order.providerOrderId})`))
        .toEqual([{ id: order.id, societyId: scope }]);
      if (scope === societyB) {
        await fixture.$executeRaw(Prisma.sql`UPDATE "Payment" SET "provider"='OTHER' WHERE "id"=${order.id}::uuid`);
        expect(await runtime.$queryRaw(Prisma.sql`SELECT * FROM aaraagate_resolve_payment_webhook_order(${order.providerOrderId})`)).toEqual([]);
      }
    }
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "Payment" WHERE "id" IN (${ids[0]}::uuid,${ids[1]}::uuid)`)).toEqual([]);
    for (const input of [null, '', "' OR true --", randomUUID()]) {
      expect(await runtime.$queryRaw(Prisma.sql`SELECT * FROM aaraagate_resolve_payment_webhook_order(${input})`)).toEqual([]);
    }
  });

  it('pins function settings, shape and public ACL and restricts its owner to routing columns', async () => {
    const [metadata] = await runtime.$queryRaw<Array<{ definer: boolean; stable: string; strict: boolean; settings: string[]; publicExecute: boolean; amountAccess: boolean; tableOwner: boolean }>>(Prisma.sql`
      SELECT p.prosecdef AS definer, p.provolatile::text AS stable, p.proisstrict AS strict, p.proconfig AS settings,
        EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute",
        has_column_privilege(${lookupOwner},c.oid,'amountPaise','SELECT') AS "amountAccess", c.relowner=p.proowner AS "tableOwner"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_class c ON c.relnamespace=n.oid AND c.relname='Payment'
      WHERE n.nspname=${schema} AND p.proname='aaraagate_resolve_payment_webhook_order'`);
    expect(metadata).toMatchObject({ definer: true, stable: 's', strict: true, publicExecute: false, amountAccess: false, tableOwner: false });
    expect(metadata.settings).toEqual(expect.arrayContaining(['search_path=pg_catalog, pg_temp', 'row_security=on']));
  });

  it('ignores caller temporary tables when resolving orders', async () => {
    const order = await callbackOrder();
    await runtime.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`CREATE TEMP TABLE "Payment" ("id" uuid, "societyId" uuid, "providerOrderId" text, "provider" text) ON COMMIT DROP`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO pg_temp."Payment" VALUES (${randomUUID()}::uuid,${societyB}::uuid,${order.providerOrderId},'gateway-adapter')`);
      expect(await tx.$queryRaw(Prisma.sql`SELECT * FROM aaraagate_resolve_payment_webhook_order(${order.providerOrderId})`))
        .toEqual([{ id: order.id, societyId: societyA }]);
    });
  });

  type Claim = { id: string; societyId: string; attemptCount?: number };
  async function claimWorker(client: Prisma.TransactionClient, kind: 'operations' | 'cases') {
    return kind === 'operations'
      ? client.$queryRaw<Claim[]>(Prisma.sql`SELECT * FROM aaraagate_claim_payment_gateway_operations()`)
      : client.$queryRaw<Claim[]>(Prisma.sql`SELECT * FROM aaraagate_claim_payment_reconciliation_cases(300)`);
  }
  async function clearWorkerFixture() {
    // Only the UUID-isolated copied tables; public append-only records are untouched.
    await fixture.$executeRaw(Prisma.sql`DELETE FROM "PaymentGatewayOperation"`);
    await fixture.$executeRaw(Prisma.sql`DELETE FROM "PaymentReconciliationCase"`);
  }
  async function seedWorker(kind: 'operations' | 'cases', count: number) {
    const rows = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), scope: i % 2 ? societyA : societyB,
      payment: randomUUID(), key: randomUUID(), attempts: [0, 1, 6, 100][i % 4],
      at: new Date(Date.now() - 86_400_000 + i * 1000) }));
    if (kind === 'operations') await fixture.$executeRaw(Prisma.sql`
      INSERT INTO "PaymentGatewayOperation" ("id","societyId","paymentId","operationType","provider","amountPaise","idempotencyKey","attemptCount","requestedAt")
      VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${row.id}::uuid,${row.scope}::uuid,${row.payment}::uuid,'STATUS_QUERY','WORKER_TEST',500,${row.key},${row.attempts},${row.at})`))}`);
    else await fixture.$executeRaw(Prisma.sql`
      INSERT INTO "PaymentReconciliationCase" ("id","societyId","paymentId","provider","expectedCapturedPaise","createdAt")
      VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${row.id}::uuid,${row.scope}::uuid,${row.payment}::uuid,'WORKER_TEST',500,${row.at})`))}`);
    return rows;
  }

  it('denies worker capabilities without EXECUTE and exposes no owner membership', async () => {
    for (const kind of ['operations', 'cases'] as const) await expect(claimWorker(runtime, kind)).rejects.toThrow(/permission denied for function/i);
    const [identity] = await runtime.$queryRaw<Array<{ member: boolean; superuser: boolean; bypass: boolean; login: boolean }>>(Prisma.sql`
      SELECT pg_has_role(current_user,r.oid,'MEMBER') AS member,r.rolsuper AS superuser,r.rolbypassrls AS bypass,r.rolcanlogin AS login
      FROM pg_roles r WHERE r.rolname=${claimsOwner}`);
    expect(identity).toEqual({ member: false, superuser: false, bypass: false, login: false });
    executeDdl(`GRANT EXECUTE ON FUNCTION "${schema}".aaraagate_claim_payment_gateway_operations(),
      "${schema}".aaraagate_claim_payment_reconciliation_cases(integer) TO "${role}"`);
  });

  it('restricts worker ownership to claim metadata and pins public ACL/settings', async () => {
    const metadata = await runtime.$queryRaw<Array<{ name: string; definer: boolean; volatile: string; settings: string[]; publicExecute: boolean }>>(Prisma.sql`
      SELECT p.proname AS name,p.prosecdef AS definer,p.provolatile::text AS volatile,p.proconfig AS settings,
        EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS "publicExecute"
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=${schema} AND p.proname IN ('aaraagate_claim_payment_gateway_operations','aaraagate_claim_payment_reconciliation_cases')`);
    expect(metadata).toHaveLength(2);
    for (const row of metadata) {
      expect(row).toMatchObject({ definer: true, volatile: 'v', publicExecute: false });
      expect(row.settings).toEqual(expect.arrayContaining(['search_path=pg_catalog, pg_temp', 'row_security=on']));
    }
    const [rights] = await runtime.$queryRaw<Array<{ statusWrite: boolean; amountWrite: boolean; deleteRows: boolean; owns: boolean }>>(Prisma.sql`
      SELECT has_column_privilege(${claimsOwner},c.oid,'status','UPDATE') AS "statusWrite",
        has_column_privilege(${claimsOwner},c.oid,'amountPaise','UPDATE') AS "amountWrite",
        has_table_privilege(${claimsOwner},c.oid,'DELETE') AS "deleteRows",c.relowner=r.oid AS owns
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.rolname=${claimsOwner}
      WHERE n.nspname=${schema} AND c.relname='PaymentGatewayOperation'`);
    expect(rights).toEqual({ statusWrite: false, amountWrite: false, deleteRows: false, owns: false });
  });

  it('claims only 25 oldest due operations with exact retry metadata and unchanged economics', async () => {
    await clearWorkerFixture();
    const rows = await seedWorker('operations', 34);
    await fixture.$executeRaw(Prisma.sql`UPDATE "PaymentGatewayOperation" SET "status"='SETTLED' WHERE "id"=${rows[31].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "PaymentGatewayOperation" SET "nextAttemptAt"=CURRENT_TIMESTAMP+INTERVAL '1 day' WHERE "id"=${rows[32].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "PaymentGatewayOperation" SET "status"='FAILED' WHERE "id"=${rows[33].id}::uuid`);
    const claimed = await claimWorker(runtime, 'operations');
    expect(claimed.map(row => row.id)).toEqual(rows.slice(0, 25).map(row => row.id));
    expect(claimed[0]).toEqual({ id: rows[0].id, societyId: rows[0].scope, paymentId: rows[0].payment,
      operationType: 'STATUS_QUERY', provider: 'WORKER_TEST', providerOperationId: null, amountPaise: 500n,
      idempotencyKey: rows[0].key, attemptCount: 1 });
    const saved = await fixture.$queryRaw<Array<{ id: string; status: string; attemptCount: number; delay: number }>>(Prisma.sql`
      SELECT "id","status","attemptCount",EXTRACT(EPOCH FROM ("nextAttemptAt"-"lastAttemptAt"))::integer AS delay
      FROM "PaymentGatewayOperation" WHERE "id" IN (${Prisma.join(rows.slice(0, 4).map(row => Prisma.sql`${row.id}::uuid`))}) ORDER BY "requestedAt"`);
    expect(saved.map(row => [row.status,row.attemptCount,row.delay])).toEqual([
      ['REQUESTED',1,60],['REQUESTED',2,120],['REQUESTED',7,3600],['REQUESTED',101,3600],
    ]);
    expect((await claimWorker(runtime, 'operations')).map(row => row.id)).toEqual(rows.slice(25,31).map(row => row.id));
    expect(await claimWorker(runtime, 'operations')).toEqual([]);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentGatewayOperation"`)).toEqual([]);
    await clearWorkerFixture();
  });

  it('claims only 25 stale open cases and rejects unsafe stale intervals', async () => {
    await clearWorkerFixture();
    const rows = await seedWorker('cases', 34);
    await fixture.$executeRaw(Prisma.sql`UPDATE "PaymentReconciliationCase" SET "status"='MATCHED' WHERE "id"=${rows[31].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "PaymentReconciliationCase" SET "lastCheckedAt"=CURRENT_TIMESTAMP WHERE "id"=${rows[32].id}::uuid`);
    await fixture.$executeRaw(Prisma.sql`UPDATE "PaymentReconciliationCase" SET "status"='RESOLVED',"resolvedAt"=CURRENT_TIMESTAMP WHERE "id"=${rows[33].id}::uuid`);
    for (const seconds of [null, -1, 0, 59]) expect(await runtime.$queryRaw(Prisma.sql`
      SELECT * FROM aaraagate_claim_payment_reconciliation_cases(${seconds}::integer)`)).toEqual([]);
    const claimed = await claimWorker(runtime, 'cases');
    expect(claimed.map(row => row.id)).toEqual(rows.slice(0,25).map(row => row.id));
    expect(claimed[0]).toEqual({ id: rows[0].id, societyId: rows[0].scope, paymentId: rows[0].payment, provider: 'WORKER_TEST' });
    expect((await claimWorker(runtime, 'cases')).map(row => row.id)).toEqual(rows.slice(25,31).map(row => row.id));
    expect(await claimWorker(runtime, 'cases')).toEqual([]);
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentReconciliationCase"`)).toEqual([]);
    await clearWorkerFixture();
  });

  it.each(['operations', 'cases'] as const)('skips concurrently locked %s and restores rolled-back claims', async kind => {
    await clearWorkerFixture();
    const rows = await seedWorker(kind, 30);
    let release!: () => void;
    let ready!: (rows: Claim[]) => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<Claim[]>(resolve => { ready = resolve; });
    const pending = runtime.$transaction(async tx => {
      const claimed = await claimWorker(tx, kind);
      ready(claimed);
      await gate;
      throw new Error('worker claim rollback');
    }, { timeout: 10000 });
    const rejected = expect(pending).rejects.toThrow('worker claim rollback');
    try {
      expect((await started).map(row => row.id)).toEqual(rows.slice(0,25).map(row => row.id));
      expect((await claimWorker(runtime, kind)).map(row => row.id)).toEqual(rows.slice(25).map(row => row.id));
    } finally { release(); }
    await rejected;
    expect((await claimWorker(runtime, kind)).map(row => row.id)).toEqual(rows.slice(0,25).map(row => row.id));
    expect(await claimWorker(runtime, kind)).toEqual([]);
    await clearWorkerFixture();
  });

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
