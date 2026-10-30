import { AccessSubjectType, MembershipRole, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { VisitorService } from '../visitors/visitor.service';
import { VisitorVerificationService } from '../visitors/visitor-verification.service';
import { ParkingPermitService } from '../parking/parking-permit.service';
import { GateAssignmentService } from '../gates/gate-assignment.service';
import { GatesController } from '../gates/gates.controller';
import { GateAuditService } from '../gates/gate-audit.service';
import { AccessService } from '../access/access.service';
import { GateArrivalService } from '../access/gate-arrival.service';
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
  const tables = ['User', 'Society', 'SocietyMembership', 'GateGuardAssignment', 'Building', 'Unit', 'UnitOwnership', 'UnitOccupancy',
    'MaintenanceInvoice', 'Payment', 'PaymentEvent', 'AmenityBooking', 'Amenity',
    'PaymentAutopayPreference', 'PushDeliveryOutbox', 'PaymentWebhookReceipt',
    'PaymentRefund', 'PaymentReconciliationCase', 'PaymentGatewayOperation',
    'AccountingExportJob', 'AccountingExportArtifact', 'AccountingConnectorDelivery',
    'AccountingConnectorDeliveryAction', 'Visitor', 'VisitorPass', 'AuditEvent', 'Gate', 'AccessRequest', 'GateMutationReceipt', 'ParkingSlot', 'ParkingPermit', 'ParkingPolicy', 'ParkingEvent', 'JournalEntry', 'JournalLine', 'LedgerAccount', 'AccountingFund'];
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
    // webhook SQL cast inside this isolated schema. The ORM-filter enum below
    // additionally needs matching local column and parameter types.
    const definitions: string[] = ['PaymentStatus', 'PaymentReconciliationStatus', 'GatewayOperationType', 'GatewayOperationStatus', 'AuditEventType', 'UnitRelation']
      .map(type => `CREATE DOMAIN "${type}" AS public."${type}"`);
    // Prisma binds both written enum values and filters to its configured
    // schema. Copy migrated labels and align the isolated ORM enum columns,
    // retaining every migrated default, check and index.
    const enumColumns: Array<{ table: string; column: string; type: string; defaultValue?: string }> = [
      { table: 'SocietyMembership', column: 'role', type: 'MembershipRole' },
      { table: 'Society', column: 'status', type: 'SocietyStatus', defaultValue: 'ACTIVE' },
      { table: 'Visitor', column: 'status', type: 'VisitorStatus', defaultValue: 'PENDING' },
      { table: 'VisitorPass', column: 'status', type: 'VisitorPassStatus', defaultValue: 'ACTIVE' },
      { table: 'AccessRequest', column: 'subjectType', type: 'AccessSubjectType' },
      { table: 'AccessRequest', column: 'status', type: 'AccessRequestStatus', defaultValue: 'PENDING' },
      { table: 'GateMutationReceipt', column: 'action', type: 'GateMutationAction' },
    ];
    for (const type of new Set(enumColumns.map(column => column.type))) {
      const labels = await fixture.$queryRaw<Array<{ label: string }>>(Prisma.sql`
        SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
        JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public' AND t.typname=${type} ORDER BY e.enumsortorder`);
      definitions.push(`CREATE TYPE "${type}" AS ENUM (${labels.map(({ label }) => "'" + label.replaceAll("'", "''") + "'").join(',')})`);
    }
    for (const table of tables) {
      definitions.push(`CREATE TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`);
      for (const { column, type, defaultValue } of enumColumns.filter(entry => entry.table === table)) {
        definitions.push(`ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`);
        definitions.push(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE "${type}" USING "${column}"::text::"${type}"`);
        if (defaultValue) definitions.push(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT '${defaultValue}'::"${type}"`);
      }
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

  const arrivals = new GateArrivalService(runtime, new EntitlementService(runtime));
  const arrivalUnits = new Set<string>(), arrivalGates = new Set<string>(), arrivalUsers = new Set<string>();
  const arrivalFeatures = new Map<string, Prisma.JsonValue>();
  const assignmentMemberships = new Set<string>();
  const parkingSlots = new Set<string>(), parkingPolicies = new Set<string>();
  afterEach(async () => {
    if (!arrivalUnits.size && !arrivalGates.size && !arrivalUsers.size) return;
    // Only this test's UUID-isolated copied rows. No public immutable evidence.
    const ids = [...arrivalUnits];
    if (parkingSlots.size) {
      const slotIds = Prisma.join([...parkingSlots].map(id => Prisma.sql`${id}::uuid`));
      await fixture.$executeRaw(Prisma.sql`DELETE FROM "ParkingEvent" WHERE "slotId" IN (${slotIds})`);
      await fixture.$executeRaw(Prisma.sql`DELETE FROM "ParkingPermit" WHERE "slotId" IN (${slotIds})`);
      await fixture.$executeRaw(Prisma.sql`DELETE FROM "ParkingSlot" WHERE "id" IN (${slotIds})`);
    }
    if (parkingPolicies.size) await fixture.$executeRaw(Prisma.sql`DELETE FROM "ParkingPolicy" WHERE "societyId" IN (${Prisma.join([...parkingPolicies].map(id => Prisma.sql`${id}::uuid`))})`);
    parkingSlots.clear(); parkingPolicies.clear();
    const requests = await fixture.accessRequest.findMany({ where: { unitId: { in: ids } }, select: { id: true } });
    await fixture.auditEvent.deleteMany({ where: { OR: [{ accessRequestId: { in: requests.map(row => row.id) } }, { gateId: { in: [...arrivalGates] } }] } });
    const visitors = await fixture.visitor.findMany({ where: { unitId: { in: ids } }, select: { id: true } });
    await fixture.visitorPass.deleteMany({ where: { visitorId: { in: visitors.map(row => row.id) } } });
    await fixture.visitor.deleteMany({ where: { unitId: { in: ids } } });
    await fixture.gateMutationReceipt.deleteMany({ where: { accessRequestId: { in: requests.map(row => row.id) } } });
    await fixture.accessRequest.deleteMany({ where: { unitId: { in: ids } } });
    await fixture.unitOccupancy.deleteMany({ where: { unitId: { in: ids } } });
    await fixture.unitOwnership.deleteMany({ where: { unitId: { in: ids } } });
    await fixture.unit.deleteMany({ where: { id: { in: ids } } });
    if (arrivalGates.size) await fixture.$executeRaw(Prisma.sql`DELETE FROM "GateGuardAssignment" WHERE "gateId" IN (${Prisma.join([...arrivalGates].map(id => Prisma.sql`${id}::uuid`))})`);
    await fixture.societyMembership.deleteMany({ where: { id: { in: [...assignmentMemberships] } } });
    assignmentMemberships.clear();
    await fixture.gate.deleteMany({ where: { id: { in: [...arrivalGates] } } });
    await fixture.user.deleteMany({ where: { id: { in: [...arrivalUsers] } } });
    for (const [id, featureOverrides] of arrivalFeatures) await fixture.society.update({ where: { id }, data: { featureOverrides: featureOverrides as Prisma.InputJsonValue } });
    arrivalUnits.clear(); arrivalGates.clear(); arrivalUsers.clear(); arrivalFeatures.clear();
  });
  async function arrivalDestination(scope = societyA) {
    const gateId = randomUUID(), unitId = randomUUID();
    arrivalUnits.add(unitId); arrivalGates.add(gateId);
    if (!arrivalFeatures.has(scope)) {
      const society = await fixture.society.findUniqueOrThrow({ where: { id: scope }, select: { featureOverrides: true } });
      arrivalFeatures.set(scope, society.featureOverrides);
    }
    await fixture.society.update({ where: { id: scope }, data: { featureOverrides: { DELIVERY_MANAGEMENT: true } } });
    await fixture.gate.create({ data: { id: gateId, societyId: scope, name: 'Arrival fixture', code: gateId } });
    await fixture.unit.create({ data: { id: unitId, societyId: scope, buildingId: scope === societyA ? buildingA : buildingB, number: unitId } });
    return { gateId, unitId };
  }
  async function arrivalOccupancy(scope: string, unitId: string, userId: string, data: Partial<Pick<Prisma.UnitOccupancyUncheckedCreateInput, 'primaryGateContact' | 'escalationOrder' | 'gateApprovalExpiresAt' | 'effectiveTo' | 'effectiveFrom' | 'gateApprovalEnabled' | 'active'>> = {}) {
    // Explicit fixture fields below avoid writing operator data or broad updates.
    return fixture.unitOccupancy.create({ data: { societyId: scope, unitId, userId, relation: 'TENANT',
      effectiveFrom: new Date(Date.now() - 2 * 86_400_000), ...data } });
  }

  const permits = new ParkingPermitService(runtime);
  async function permitVisit(scope = societyA) {
    const { unitId } = await arrivalDestination(scope);
    await arrivalOccupancy(scope, unitId, tenant);
    return { unitId, ...await new VisitorService(runtime).createPass(scope, tenant, unitId, 'Parking visitor', '999',
      new Date(Date.now() - 3_600_000), new Date(Date.now() + 7_200_000)) };
  }
  async function permitSlot(scope = societyA, slotType = 'VISITOR', active = true) {
    const [slot] = await fixture.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "ParkingSlot" ("societyId","code","slotType","active")
      VALUES (${scope}::uuid,${randomUUID()},${slotType},${active}) RETURNING "id"`);
    parkingSlots.add(slot.id);
    return slot.id;
  }
  function permitInput(slotId: string, visit: Awaited<ReturnType<typeof permitVisit>>) {
    return { slotId, visitorId: visit.visitor.id, visitorPassId: visit.pass.id, plateNumber: ' tn 01 ab 1234 ',
      startsAt: new Date(Date.now() + 600_000).toISOString(), endsAt: new Date(Date.now() + 1_200_000).toISOString(), note: ' Visit ' };
  }

  it('isolates visitor parking eligibility/listing and transactional create/complete/cancel evidence in both societies', async () => {
    for (const scope of [societyA, societyB]) {
      const visit = await permitVisit(scope), slotId = await permitSlot(scope);
      const input = permitInput(slotId, visit);
      const created = await permits.create(scope, owner, input);
      expect(await permits.list(scope)).toEqual([expect.objectContaining({ id: created.id, plateNumber: 'TN 01 AB 1234', note: 'Visit', visitorId: visit.visitor.id })]);
      const eligible = await permits.eligibleVisitors(scope) as Array<{ visitorId: string }>;
      expect(eligible.map(row => row.visitorId)).toContain(visit.visitor.id);
      const foreign = scope === societyA ? societyB : societyA;
      expect((await permits.list(foreign) as Array<{ id: string }>).some(row => row.id === created.id)).toBe(false);
      expect((await permits.eligibleVisitors(foreign) as Array<{ visitorId: string }>).some(row => row.visitorId === visit.visitor.id)).toBe(false);
      await expect(permits.cancel(foreign, owner, created.id)).rejects.toThrow('not found');
      await permits.complete(scope, owner, created.id, ' Finished ');
      await expect(permits.cancel(scope, owner, created.id)).rejects.toThrow('not found');
      const second = await permits.create(scope, owner, input);
      await permits.cancel(scope, owner, second.id, ' Cancelled ');
      await expect(permits.complete(scope, owner, second.id)).rejects.toThrow('not found');
      const events = await fixture.$queryRaw<Array<{ action: string; actorUserId: string; societyId: string }>>(Prisma.sql`
        SELECT "action","actorUserId","societyId" FROM "ParkingEvent" WHERE "slotId"=${slotId}::uuid ORDER BY "action"`);
      expect(events.map(row => row.action)).toEqual(['PERMIT_CANCELLED', 'PERMIT_COMPLETED', 'PERMIT_CREATED', 'PERMIT_CREATED']);
      expect(events.every(row => row.actorUserId === owner && row.societyId === scope)).toBe(true);
    }
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "ParkingPermit"`)).toEqual([]);
  });

  it('denies foreign slot, visitor and pass substitution before parking permit creation', async () => {
    const a = await permitVisit(), b = await permitVisit(societyB);
    const slotA = await permitSlot(), slotB = await permitSlot(societyB);
    const input = permitInput(slotA, a);
    for (const change of [{ slotId: slotB }, { visitorId: b.visitor.id }, { visitorPassId: b.pass.id }, { visitorId: b.visitor.id, visitorPassId: b.pass.id }]) {
      await expect(permits.create(societyA, owner, { ...input, ...change })).rejects.toThrow('combination not found');
    }
    expect(await permits.list(societyA)).toEqual([]);
  });

  it('retains visitor/pass windows, allowed slot types and temporary-overflow policy during scoped creation', async () => {
    const visit = await permitVisit(), slot = await permitSlot();
    const input = permitInput(slot, visit);
    for (const slotType of ['RESIDENT', 'STAFF']) await expect(permits.create(societyA, owner, { ...input, slotId: await permitSlot(societyA, slotType) })).rejects.toThrow('combination not found');
    await expect(permits.create(societyA, owner, { ...input, slotId: await permitSlot(societyA, 'VISITOR', false) })).rejects.toThrow('combination not found');
    await expect(permits.create(societyA, owner, { ...input, startsAt: new Date(visit.pass.validFrom.getTime() - 1).toISOString() })).rejects.toThrow('combination not found');
    await expect(permits.create(societyA, owner, { ...input, endsAt: new Date(visit.pass.validUntil.getTime() + 1).toISOString() })).rejects.toThrow('combination not found');
    await fixture.visitorPass.update({ where: { id: visit.pass.id }, data: { status: 'REVOKED' } });
    await expect(permits.create(societyA, owner, input)).rejects.toThrow('combination not found');
    await fixture.visitorPass.update({ where: { id: visit.pass.id }, data: { status: 'ACTIVE' } });
    await fixture.visitor.update({ where: { id: visit.visitor.id }, data: { status: 'CANCELLED' } });
    await expect(permits.create(societyA, owner, input)).rejects.toThrow('combination not found');
    await fixture.visitor.update({ where: { id: visit.visitor.id }, data: { status: 'APPROVED' } });
    parkingPolicies.add(societyA);
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "ParkingPolicy" ("societyId","updatedByUserId","allowTemporaryOverflow") VALUES (${societyA}::uuid,${owner}::uuid,false)`);
    const temporary = await permitSlot(societyA, 'TEMPORARY');
    await expect(permits.create(societyA, owner, { ...input, slotId: temporary })).rejects.toThrow('combination not found');
    await fixture.$executeRaw(Prisma.sql`UPDATE "ParkingPolicy" SET "allowTemporaryOverflow"=true WHERE "societyId"=${societyA}::uuid`);
    expect(await permits.create(societyA, owner, { ...input, slotId: temporary })).toHaveProperty('id');
    expect(await permits.create(societyA, owner, { ...input, slotId: await permitSlot(societyA, 'ACCESSIBLE') })).toHaveProperty('id');
  });

  it('retains the migrated exclusion constraint, concurrent slot locking and adjacent permit windows under RLS', async () => {
    const visit = await permitVisit(), slot = await permitSlot(), input = permitInput(slot, visit);
    const results = await Promise.allSettled([1, 2].map(() => permits.create(societyA, owner, input)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.message).toContain('overlapping active permit');
    const saved = await fixture.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "ParkingPermit" WHERE "slotId"=${slot}::uuid`);
    expect(saved).toHaveLength(1);
    // Direct insertion must still fail at the copied migrated exclusion
    // constraint; the application lock is not its replacement.
    await expect(fixture.$executeRaw(Prisma.sql`INSERT INTO "ParkingPermit" ("societyId","slotId","visitorId","visitorPassId","plateNumber","startsAt","endsAt","createdByUserId")
      SELECT "societyId","slotId","visitorId","visitorPassId","plateNumber","startsAt","endsAt","createdByUserId" FROM "ParkingPermit" WHERE "id"=${saved[0].id}::uuid`)).rejects.toThrow(/exclusion|conflicting key/i);
    expect(await permits.create(societyA, owner, { ...input, startsAt: input.endsAt, endsAt: new Date(new Date(input.endsAt).getTime() + 600_000).toISOString() })).toHaveProperty('id');
  });

  it('rolls back parking permit state and event evidence when event persistence fails after writing', async () => {
    const visit = await permitVisit(), slot = await permitSlot(), input = permitInput(slot, visit);
    const failed = new ParkingPermitService({ withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.withTenantContext(scope, tx => run(new Proxy(tx, {
      get(target, key) {
        if (key === '$executeRaw') return async (sql: Prisma.Sql) => { await target.$executeRaw(sql); throw new Error('Simulated parking event response failure'); };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      },
    }))) } as never);
    await expect(failed.create(societyA, owner, input)).rejects.toThrow('parking event response failure');
    expect(await permits.list(societyA)).toEqual([]);
    const created = await permits.create(societyA, owner, input);
    for (const method of ['cancel', 'complete'] as const) await expect(failed[method](societyA, owner, created.id)).rejects.toThrow('parking event response failure');
    expect(await permits.list(societyA)).toEqual([expect.objectContaining({ id: created.id, status: 'ACTIVE' })]);
    expect(await fixture.$queryRaw(Prisma.sql`SELECT "id" FROM "ParkingEvent" WHERE "slotId"=${slot}::uuid`)).toHaveLength(1);
  });

  it('does not expose foreign building details through malformed visitor unit parents', async () => {
    const visit = await permitVisit(), slot = await permitSlot();
    await permits.create(societyA, owner, permitInput(slot, visit));
    await fixture.unit.update({ where: { id: visit.unitId }, data: { buildingId: buildingB } });
    expect(await permits.list(societyA)).toEqual([]);
    expect(await permits.eligibleVisitors(societyA)).toEqual([]);
  });

  const assignments = new GateAssignmentService(runtime);
  async function securityMembership(scope: string, userId: string, role: MembershipRole = MembershipRole.SECURITY_GUARD, active = true) {
    const member = await fixture.societyMembership.create({ data: { societyId: scope, userId, role, active } });
    assignmentMemberships.add(member.id);
    return member;
  }

  it('preserves both-society guard/supervisor assignment upserts and inactive history under RLS', async () => {
    for (const [scope, userId, role] of [[societyA, owner, MembershipRole.SECURITY_GUARD], [societyB, tenant, MembershipRole.SECURITY_SUPERVISOR]] as const) {
      const gate = await administrationGate(scope, randomUUID());
      await securityMembership(scope, userId, role);
      const from = new Date(Date.now() - 60_000), until = new Date(Date.now() + 60_000);
      const first = await assignments.assign(scope, gate.id, userId, from, until);
      const changed = await assignments.assign(scope, gate.id, userId, from);
      expect(changed).toMatchObject({ id: first.id, active: true, effectiveTo: null });
      expect(await assignments.assertAssigned(scope, gate.id, userId)).toMatchObject({ id: first.id });
      expect(await assignments.list(scope, gate.id)).toEqual([expect.objectContaining({ id: first.id, userId })]);
      expect(await assignments.deactivate(scope, gate.id, first.id)).toMatchObject({ active: false });
      await expect(assignments.assertAssigned(scope, gate.id, userId)).rejects.toThrow('not assigned');
      await expect(assignments.deactivate(scope, gate.id, first.id)).rejects.toThrow('not found');
      const replacement = await assignments.assign(scope, gate.id, userId);
      expect(replacement.id).not.toBe(first.id);
      const history = await assignments.list(scope, gate.id) as Array<{ id: string; active: boolean }>;
      expect(history.map(row => row.active)).toEqual([true, false]);
      expect(history.map(row => row.id)).toEqual([replacement.id, first.id]);
    }
    expect(await runtime.$queryRaw(Prisma.sql`SELECT "id" FROM "GateGuardAssignment"`)).toEqual([]);
  });

  it('enforces exact assignment windows and inactive parent gates under a restricted role', async () => {
    const gate = await administrationGate(societyA, randomUUID());
    await securityMembership(societyA, owner);
    const from = new Date(Date.now() - 60_000), until = new Date(Date.now() + 60_000);
    const row = await assignments.assign(societyA, gate.id, owner, from, until);
    expect(await assignments.assertAssigned(societyA, gate.id, owner, from)).toMatchObject({ id: row.id });
    await expect(assignments.assertAssigned(societyA, gate.id, owner, new Date(from.getTime() - 1))).rejects.toThrow('not assigned');
    expect(await assignments.assertAssigned(societyA, gate.id, owner, new Date(until.getTime() - 1))).toMatchObject({ id: row.id });
    await expect(assignments.assertAssigned(societyA, gate.id, owner, until)).rejects.toThrow('not assigned');
    await gates.deactivate(gate.id, societyA);
    await expect(assignments.assertAssigned(societyA, gate.id, owner, from)).rejects.toThrow('not assigned');
    await gates.activate(gate.id, societyA);
    expect(await assignments.assertAssigned(societyA, gate.id, owner, from)).toMatchObject({ id: row.id });
    for (const [start, end] of [[until, from], [from, from], [undefined, new Date(0)]] as const) {
      await expect(assignments.assign(societyA, gate.id, owner, start, end)).rejects.toThrow('end must be after start');
    }
    expect(await assignments.assertAssigned(societyA, gate.id, owner, from)).toMatchObject({ id: row.id });
  });

  it('requires an active same-society security membership instead of owner/accountant or foreign roles', async () => {
    const gate = await administrationGate(societyA, randomUUID());
    await securityMembership(societyA, owner, MembershipRole.OWNER);
    await securityMembership(societyA, owner, MembershipRole.ACCOUNTANT);
    await securityMembership(societyB, owner);
    await securityMembership(societyA, owner, MembershipRole.SECURITY_GUARD, false);
    await expect(assignments.assign(societyA, gate.id, owner)).rejects.toThrow('not an active security');
    await securityMembership(societyA, owner, MembershipRole.SECURITY_SUPERVISOR);
    expect(await assignments.assign(societyA, gate.id, owner)).toMatchObject({ societyId: societyA, userId: owner });
  });

  it('denies foreign gate/assignment substitution and malformed parent joins under RLS', async () => {
    const a = await administrationGate(societyA, randomUUID()), b = await administrationGate(societyB, randomUUID());
    await securityMembership(societyA, owner);
    const row = await assignments.assign(societyA, a.id, owner);
    await expect(assignments.list(societyB, a.id)).rejects.toThrow('Gate not found');
    await expect(assignments.assign(societyB, a.id, owner)).rejects.toThrow('Gate not found');
    await expect(assignments.deactivate(societyB, b.id, row.id)).rejects.toThrow('not found');
    await expect(assignments.assertAssigned(societyB, a.id, owner)).rejects.toThrow('not assigned');
    // Copied tables omit public FKs. Keep explicit same-society parent joins
    // effective even against a deliberately malformed legacy association.
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "GateGuardAssignment" ("societyId","gateId","userId")
      VALUES (${societyB}::uuid,${a.id}::uuid,${tenant}::uuid)`);
    await expect(assignments.assertAssigned(societyB, a.id, tenant)).rejects.toThrow('not assigned');
    expect(await assignments.assertAssigned(societyA, a.id, owner)).toMatchObject({ id: row.id });
  });

  it('serializes concurrent active assignment retries using the migrated partial unique index', async () => {
    const gate = await administrationGate(societyA, randomUUID());
    await securityMembership(societyA, owner);
    const from = new Date(Date.now() - 60_000), until = new Date(Date.now() + 60_000);
    const rows = await Promise.all([1, 2].map(() => assignments.assign(societyA, gate.id, owner, from, until)));
    expect(rows[0].id).toBe(rows[1].id);
    const saved = await fixture.$queryRaw(Prisma.sql`SELECT "id" FROM "GateGuardAssignment" WHERE "gateId"=${gate.id}::uuid AND "active"=true`);
    expect(saved).toHaveLength(1);
  });

  it('rolls back assignment upserts/deactivation after response failure without losing history', async () => {
    const gate = await administrationGate(societyA, randomUUID());
    await securityMembership(societyA, owner);
    const failed = new GateAssignmentService({
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.withTenantContext(scope, tx => run(new Proxy(tx, {
        get(target, key) {
          if (key === '$queryRaw') return async (sql: Prisma.Sql) => {
            await target.$queryRaw(sql); throw new Error('Simulated assignment response failure');
          };
          const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
        },
      }))),
    } as never);
    await expect(failed.assign(societyA, gate.id, owner)).rejects.toThrow('assignment response failure');
    expect(await assignments.list(societyA, gate.id)).toEqual([]);
    const row = await assignments.assign(societyA, gate.id, owner);
    await expect(failed.assign(societyA, gate.id, owner, new Date(Date.now() + 60_000))).rejects.toThrow('assignment response failure');
    expect(await assignments.assertAssigned(societyA, gate.id, owner)).toMatchObject({ id: row.id });
    await expect(failed.deactivate(societyA, gate.id, row.id)).rejects.toThrow('assignment response failure');
    expect(await assignments.assertAssigned(societyA, gate.id, owner)).toMatchObject({ id: row.id });
  });

  const gates = new GatesController(runtime, new GateAuditService(runtime), {} as never);
  async function administrationGate(scope: string, code: string, name = 'Gate', active?: boolean) {
    const gate = await gates.create({ name, code, active }, scope);
    arrivalGates.add(gate.id);
    return gate;
  }

  it('isolates gate administration listing and same-code creation across restricted societies', async () => {
    const code = randomUUID();
    const a = await administrationGate(societyA, ` ${code.toLowerCase()} `, ' Z Gate ');
    const b = await administrationGate(societyB, code, ' B Gate ', false);
    const first = await administrationGate(societyA, randomUUID(), 'A Gate');
    expect(a).toMatchObject({ societyId: societyA, code: code.toUpperCase(), name: 'Z Gate', active: true });
    expect(b).toMatchObject({ societyId: societyB, code: code.toUpperCase(), active: false });
    expect((await gates.list(societyA)).map(row => row.id)).toEqual([first.id, a.id]);
    expect((await gates.list(societyB)).map(row => row.id)).toEqual([b.id]);
    await expect(gates.create({ name: 'Duplicate', code }, societyA)).rejects.toThrow('Gate code already exists in this society');
    expect(await fixture.gate.count({ where: { societyId: societyA, code: code.toUpperCase() } })).toBe(1);
    expect(await runtime.gate.findMany()).toEqual([]);
  });

  it('denies foreign gate activation/deactivation while preserving local state changes', async () => {
    const a = await administrationGate(societyA, randomUUID()), b = await administrationGate(societyB, randomUUID());
    for (const method of ['activate', 'deactivate'] as const) {
      await expect(gates[method](b.id, societyA)).rejects.toThrow('Gate does not belong');
      await expect(gates[method](randomUUID(), societyA)).rejects.toThrow('Gate does not belong');
      expect(await gates[method](a.id, societyA)).toMatchObject({ active: method === 'activate', societyId: societyA });
      expect(await fixture.gate.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ active: true });
    }
  });

  it('rolls back gate changes and creation when the transaction fails after the database write', async () => {
    const a = await administrationGate(societyA, randomUUID());
    const failedClient = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.withTenantContext(scope, tx => run(new Proxy(tx, {
        get(target, key) {
          if (key === 'gate') return new Proxy(target.gate, { get(delegate, operation) {
            if (operation === 'update') return async (args: Prisma.GateUpdateArgs) => {
              await delegate.update(args); throw new Error('Simulated gate response failure');
            };
            if (operation === 'create') return async (args: Prisma.GateCreateArgs) => {
              await delegate.create(args); throw new Error('Simulated gate response failure');
            };
            return Reflect.get(delegate, operation);
          } });
          const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
        },
      }))),
    } as never;
    const rejected = new GatesController(failedClient, {} as never, {} as never);
    await expect(rejected.deactivate(a.id, societyA)).rejects.toThrow('gate response failure');
    expect(await fixture.gate.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ active: true });
    await gates.deactivate(a.id, societyA);
    await expect(rejected.activate(a.id, societyA)).rejects.toThrow('gate response failure');
    expect(await fixture.gate.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ active: false });
    const code = randomUUID().toUpperCase();
    await expect(rejected.create({ name: 'Rollback', code }, societyA)).rejects.toThrow('gate response failure');
    expect(await fixture.gate.count({ where: { societyId: societyA, code } })).toBe(0);
    const [context] = await runtime.$queryRaw<Array<{ societyId: string | null }>>(Prisma.sql`SELECT current_setting(${TENANT_CONTEXT_SETTING},true) AS "societyId"`);
    expect([societyA, societyB]).not.toContain(context.societyId);
  });

  const access = new AccessService(runtime, new EntitlementService(runtime));
  async function accessDestination(scope = societyA) {
    const destination = await arrivalDestination(scope);
    await arrivalOccupancy(scope, destination.unitId, tenant);
    return destination;
  }
  const accessWindow = () => [new Date(Date.now() - 1000), new Date(Date.now() + 600_000)] as const;

  it('isolates access invitation recovery, verification and id/credential entry/exit in either society', async () => {
    for (const scope of [societyA, societyB]) {
      const { gateId, unitId } = await accessDestination(scope);
      const [from, until] = accessWindow();
      const first = await access.inviteVisitor(scope, tenant, unitId, ' Visitor ', from, until, 'shared-invite-key', '999', 'Visit');
      const replay = await access.inviteVisitor(scope, tenant, unitId, ' Visitor ', from, until, 'shared-invite-key', '999', 'Visit');
      expect(replay).toMatchObject({ replayed: true, request: { id: first.request.id } });
      expect(replay.credential).not.toBe(first.credential);
      await expect(access.verify(scope, gateId, first.credential)).rejects.toThrow('not found');
      await expect(access.inviteVisitor(scope, tenant, unitId, 'Different', from, until, 'shared-invite-key', '999', 'Visit')).rejects.toThrow('different visitor invite');
      expect(await access.verify(scope, gateId, replay.credential, owner)).toMatchObject({ id: first.request.id });
      expect(await access.checkIn(scope, gateId, replay.credential, owner, 'shared-enter-key')).toMatchObject({ status: 'CHECKED_IN' });
      expect(await access.checkInRequest(scope, gateId, first.request.id, owner, 'shared-enter-key')).toMatchObject({ status: 'CHECKED_IN' });
      await fixture.accessRequest.update({ where: { id: first.request.id }, data: { validUntil: new Date(0) } });
      expect(await access.checkOutRequest(scope, gateId, first.request.id, owner, 'shared-exit-key')).toMatchObject({ status: 'CHECKED_OUT' });
      expect(await access.checkOut(scope, gateId, replay.credential, owner, 'shared-exit-key')).toMatchObject({ status: 'CHECKED_OUT' });
      await expect(access.checkOutRequest(scope, gateId, first.request.id, owner, 'shared-enter-key')).rejects.toThrow('different gate operation');
      const receipts = await runtime.withTenantContext(scope, tx => tx.gateMutationReceipt.findMany({ where: { accessRequestId: first.request.id } }));
      expect(receipts).toHaveLength(2);
      expect(receipts.every(row => row.societyId === scope && row.gateId === gateId && row.actorUserId === owner)).toBe(true);
      expect((await access.listMine(scope, tenant)).map(row => row.id)).toEqual([first.request.id]);
      expect(await access.listMine(scope, owner)).toEqual([]);
    }
    expect(await runtime.accessRequest.findMany()).toEqual([]);
    expect(await runtime.gateMutationReceipt.findMany()).toEqual([]);
  });

  it('retains current-occupant authority, notification-only visibility and originating-gate restrictions', async () => {
    const { gateId, unitId } = await accessDestination();
    const otherGate = await arrivalDestination();
    const request = await access.createWalkInVisitor(societyA, owner, gateId, unitId, 'Walk in');
    await expect(access.approve(societyA, owner, request.id, ...accessWindow())).rejects.toThrow('not found');
    await fixture.unitOccupancy.updateMany({ where: { societyId: societyA, unitId, userId: tenant }, data: { gateApprovalEnabled: false } });
    expect((await access.listMine(societyA, tenant)).map(row => row.id)).toEqual([request.id]);
    await expect(access.deny(societyA, tenant, request.id)).rejects.toThrow('not found');
    await fixture.unitOccupancy.updateMany({ where: { societyId: societyA, unitId, userId: tenant }, data: { gateApprovalEnabled: true, gateApprovalExpiresAt: new Date(0) } });
    await expect(access.approve(societyA, tenant, request.id, ...accessWindow())).rejects.toThrow('not found');
    await fixture.unitOccupancy.updateMany({ where: { societyId: societyA, unitId, userId: tenant }, data: { gateApprovalExpiresAt: null } });
    const approved = await access.approve(societyA, tenant, request.id, ...accessWindow());
    await expect(access.gateRequestStatus(societyA, otherGate.gateId, request.id)).rejects.toThrow('different gate');
    await expect(access.checkInRequest(societyA, otherGate.gateId, request.id, owner, randomUUID())).rejects.toThrow('different gate');
    expect(await access.checkInRequest(societyA, gateId, request.id, owner, randomUUID())).toMatchObject({ status: 'CHECKED_IN' });
    await expect(access.checkOut(societyA, otherGate.gateId, approved.credential, owner, randomUUID())).rejects.toThrow('different gate');
    expect(await access.checkOut(societyA, gateId, approved.credential, owner, randomUUID())).toMatchObject({ status: 'CHECKED_OUT' });
    const denied = await access.createWalkInVisitor(societyA, owner, gateId, unitId, 'Deny');
    expect(await access.deny(societyA, tenant, denied.id)).toMatchObject({ status: 'DENIED' });
    const privateRequest = await access.create(societyA, tenant, unitId, AccessSubjectType.VISITOR, 'Private', undefined, undefined,
      { source: 'GATE_WALK_IN', gateId: otherGate.gateId, createdByGuardId: owner });
    expect(privateRequest.metadata).toEqual({});
    expect(await access.cancel(societyA, tenant, privateRequest.id)).toMatchObject({ status: 'CANCELLED', credentialHash: null });
  });

  it('denies foreign access ids, gates, credentials, units and malformed occupancy parents', async () => {
    const a = await accessDestination(), b = await accessDestination(societyB);
    const invite = await access.inviteVisitor(societyB, tenant, b.unitId, 'Remote', ...accessWindow(), randomUUID());
    await expect(access.create(societyA, owner, a.unitId, AccessSubjectType.VISITOR, 'Nonresident')).rejects.toThrow('authenticated resident');
    await expect(access.create(societyA, tenant, b.unitId, AccessSubjectType.VISITOR, 'Foreign')).rejects.toThrow('authenticated resident');
    await expect(access.verify(societyA, a.gateId, invite.credential, owner)).rejects.toThrow('not found');
    await expect(access.gateRequestStatus(societyA, a.gateId, invite.request.id)).rejects.toThrow('not found');
    await expect(access.checkInRequest(societyA, a.gateId, invite.request.id, owner, randomUUID())).rejects.toThrow('not found');
    await expect(access.checkIn(societyA, b.gateId, invite.credential, owner, randomUUID())).rejects.toThrow('Gate does not belong');
    for (const method of ['approve', 'deny', 'cancel'] as const) await expect(access[method](societyA, tenant, invite.request.id, ...accessWindow())).rejects.toThrow('not found');
    const malformed = await arrivalDestination();
    await arrivalOccupancy(societyB, malformed.unitId, tenant);
    expect((await access.listGateUnits(societyA)).map(row => row.id)).not.toContain(malformed.unitId);
    await expect(access.createWalkInVisitor(societyA, owner, malformed.gateId, malformed.unitId, 'Foreign linked')).rejects.toThrow('active resident');
  });

  it('serializes same-key invites and recovers concurrent gate retries without duplicate audits or receipts', async () => {
    const { gateId, unitId } = await accessDestination();
    const [from, until] = accessWindow(), inviteKey = randomUUID();
    const invites = await Promise.all([1, 2].map(() => access.inviteVisitor(societyA, tenant, unitId, 'Concurrent', from, until, inviteKey)));
    expect(invites[0].request.id).toBe(invites[1].request.id);
    expect(invites.map(row => row.replayed).sort()).toEqual([false, true]);
    const current = invites.find(row => row.replayed)!;
    const key = randomUUID();
    const entered = await Promise.all([1, 2].map(() => access.checkIn(societyA, gateId, current.credential, owner, key)));
    expect(entered.every(row => row.status === 'CHECKED_IN')).toBe(true);
    expect(await fixture.gateMutationReceipt.count({ where: { accessRequestId: current.request.id } })).toBe(1);
    expect((await fixture.auditEvent.findMany({ where: { accessRequestId: current.request.id } })).map(row => row.event).sort())
      .toEqual(['ACCESS_APPROVED', 'ACCESS_CHECKED_IN', 'ACCESS_CREATED']);
    await expect(access.checkOutRequest(societyA, gateId, current.request.id, owner, key)).rejects.toThrow('different gate operation');
  });

  it('rolls back access state, receipts and audit when PostgreSQL aborts mutation persistence', async () => {
    const { gateId, unitId } = await accessDestination();
    const invite = await access.inviteVisitor(societyA, tenant, unitId, 'Rollback', ...accessWindow(), randomUUID());
    const failedClient = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.withTenantContext(scope, tx => run(new Proxy(tx, {
        get(target, key) {
          if (key === 'auditEvent') return { create: async () => {
            // A real SQL error aborts this transaction. Recovery must occur
            // after rollback in a fresh, explicitly scoped transaction.
            await target.$executeRaw(Prisma.sql`SELECT 1 / 0`);
          } };
          const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
        },
      }))),
    } as never;
    const rejected = new AccessService(failedClient, new EntitlementService(runtime));
    await expect(rejected.checkIn(societyA, gateId, invite.credential, owner, randomUUID())).rejects.toThrow(/division by zero/);
    expect(await fixture.accessRequest.findUniqueOrThrow({ where: { id: invite.request.id } })).toMatchObject({ status: 'APPROVED', enteredAt: null });
    expect(await fixture.gateMutationReceipt.count({ where: { accessRequestId: invite.request.id } })).toBe(0);
    expect(await fixture.auditEvent.count({ where: { accessRequestId: invite.request.id } })).toBe(2);
    const pending = await access.create(societyA, tenant, unitId, AccessSubjectType.VISITOR, 'Pending');
    await expect(rejected.approve(societyA, tenant, pending.id, ...accessWindow())).rejects.toThrow(/division by zero/);
    expect(await fixture.accessRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'PENDING', credentialHash: null });
    const [context] = await runtime.$queryRaw<Array<{ societyId: string | null }>>(Prisma.sql`SELECT current_setting(${TENANT_CONTEXT_SETTING},true) AS "societyId"`);
    expect([societyA, societyB]).not.toContain(context.societyId);
  });

  it('rechecks access feature and validity at entry while allowing recorded exits after expiry or feature disablement', async () => {
    const { gateId, unitId } = await accessDestination();
    const invite = await access.inviteVisitor(societyA, tenant, unitId, 'Expiry', ...accessWindow(), randomUUID());
    await fixture.society.update({ where: { id: societyA }, data: { featureOverrides: { VISITOR_MANAGEMENT: false } } });
    await expect(access.checkIn(societyA, gateId, invite.credential, owner, randomUUID())).rejects.toThrow('not enabled');
    await fixture.society.update({ where: { id: societyA }, data: { featureOverrides: { VISITOR_MANAGEMENT: true } } });
    await fixture.accessRequest.update({ where: { id: invite.request.id }, data: { validUntil: new Date(0) } });
    await expect(access.checkInRequest(societyA, gateId, invite.request.id, owner, randomUUID())).rejects.toThrow('validity window');
    await fixture.accessRequest.update({ where: { id: invite.request.id }, data: { validUntil: new Date(Date.now() + 60_000) } });
    await access.checkIn(societyA, gateId, invite.credential, owner, randomUUID());
    await fixture.society.update({ where: { id: societyA }, data: { featureOverrides: { VISITOR_MANAGEMENT: false } } });
    await fixture.accessRequest.update({ where: { id: invite.request.id }, data: { validUntil: new Date(0) } });
    expect(await access.checkOut(societyA, gateId, invite.credential, owner, randomUUID())).toMatchObject({ status: 'CHECKED_OUT' });
  });

  const visitors = new VisitorService(runtime);
  const gateAudit = new GateAuditService(runtime);
  const verification = new VisitorVerificationService(runtime, gateAudit);
  const visitorWindow = () => [new Date(Date.now() - 60_000), new Date(Date.now() + 3_600_000)] as const;
  function failingVisitorClient(model: 'auditEvent' | 'visitorPass') {
    return {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.withTenantContext(scope, tx => run(new Proxy(tx, {
        get(target, key) {
          if (key === model) return new Proxy(target[model], { get(delegate, operation) {
            if (operation === 'create') return async () => { throw new Error('Simulated visitor persistence failure'); };
            return Reflect.get(delegate, operation);
          } });
          const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
        },
      }))),
    } as never;
  }

  it('runs visitor issuance, verification, entry, exit and audit reads in either restricted society', async () => {
    for (const scope of [societyA, societyB]) {
      const { gateId, unitId } = await arrivalDestination(scope);
      await arrivalOccupancy(scope, unitId, tenant);
      const issued = await visitors.createPass(scope, tenant, unitId, ' Visitor ', ' 999 ', ...visitorWindow());
      expect(issued.visitor).toMatchObject({ societyId: scope, hostUserId: tenant, name: 'Visitor', phone: '999', status: 'APPROVED' });
      expect(await verification.verify(scope, gateId, issued.credential, owner)).toMatchObject({ id: issued.pass.id });
      expect(await verification.checkIn(scope, gateId, issued.credential, owner)).toMatchObject({ status: 'USED', visitor: { status: 'CHECKED_IN' } });
      // An already-entered visitor may leave after pass expiry.
      await fixture.visitorPass.update({ where: { id: issued.pass.id }, data: { validUntil: new Date(0) } });
      expect(await verification.checkOut(scope, gateId, issued.credential, owner)).toMatchObject({ checkedOutAt: expect.any(Date), visitor: { status: 'CHECKED_OUT' } });
      await expect(verification.checkOut(scope, gateId, issued.credential, owner)).rejects.toThrow('not found');
      const audits = await gateAudit.list(scope, gateId);
      expect(audits.map(row => row.event).sort()).toEqual(['VISITOR_CHECKED_IN', 'VISITOR_CHECKED_OUT', 'VISITOR_VERIFIED']);
      expect(audits.every(row => row.societyId === scope && row.visitorPassId === issued.pass.id && row.actorUserId === owner)).toBe(true);
      expect(await gateAudit.list(scope === societyA ? societyB : societyA, gateId)).toEqual([]);
    }
    expect(await runtime.visitor.findMany()).toEqual([]);
    expect(await runtime.visitorPass.findMany()).toEqual([]);
  });

  it('keeps visitor host decisions, lists, credentials and cancellation tenant-private', async () => {
    const a = await arrivalDestination(), b = await arrivalDestination(societyB);
    await arrivalOccupancy(societyA, a.unitId, tenant);
    await arrivalOccupancy(societyB, b.unitId, tenant);
    const pending = await visitors.createRequest(societyA, tenant, a.unitId, 'Pending', undefined, ' Visit ');
    const remote = await visitors.createPass(societyB, tenant, b.unitId, 'Remote', '999', ...visitorWindow());
    for (const method of ['approve', 'deny', 'cancel'] as const) {
      await expect(visitors[method](societyB, tenant, pending.id, ...visitorWindow())).rejects.toThrow('not found');
      await expect(visitors[method](societyA, owner, pending.id, ...visitorWindow())).rejects.toThrow('not found');
    }
    await expect(verification.verify(societyA, a.gateId, remote.credential, owner)).rejects.toThrow('not found');
    await expect(verification.checkIn(societyA, b.gateId, remote.credential, owner)).rejects.toThrow('Gate does not belong');
    const approved = await visitors.approve(societyA, tenant, pending.id, ...visitorWindow());
    expect((await visitors.listForHost(societyA, tenant)).map(row => row.id)).toEqual([pending.id]);
    expect(await visitors.listForHost(societyA, owner)).toEqual([]);
    expect(await visitors.cancel(societyA, tenant, pending.id)).toMatchObject({ status: 'CANCELLED' });
    await expect(verification.verify(societyA, a.gateId, approved.credential, owner)).rejects.toThrow('revoked');
    expect(await verification.verify(societyB, b.gateId, remote.credential)).toMatchObject({ status: 'ACTIVE' });
    const denied = await visitors.createRequest(societyA, tenant, a.unitId, 'Deny');
    expect(await visitors.deny(societyA, tenant, denied.id)).toMatchObject({ status: 'DENIED' });
    await expect(visitors.approve(societyA, tenant, denied.id, ...visitorWindow())).rejects.toThrow('denied');
  });

  it('rejects nonresident owners, foreign units and ineffective visitor host occupancies', async () => {
    const foreign = await arrivalDestination(societyB);
    await expect(visitors.createRequest(societyA, tenant, foreign.unitId, 'Foreign')).rejects.toThrow('active resident');
    const { unitId } = await arrivalDestination();
    await fixture.unitOwnership.create({ data: { societyId: societyA, unitId, userId: owner } });
    await expect(visitors.createPass(societyA, owner, unitId, 'Owner', '999', ...visitorWindow())).rejects.toThrow('active resident');
    for (const data of [{ active: false }, { effectiveTo: new Date(Date.now() - 86_400_000) }, { effectiveFrom: new Date(Date.now() + 86_400_000) }]) {
      const destination = await arrivalDestination();
      await arrivalOccupancy(societyA, destination.unitId, tenant, data);
      await expect(visitors.createRequest(societyA, tenant, destination.unitId, 'Inactive')).rejects.toThrow('active resident');
    }
  });

  it('rolls back pass issuance and both entry/exit transitions when persistence fails', async () => {
    const { gateId, unitId } = await arrivalDestination();
    await arrivalOccupancy(societyA, unitId, tenant);
    const pending = await visitors.createRequest(societyA, tenant, unitId, 'Pending');
    await expect(new VisitorService(failingVisitorClient('visitorPass')).approve(societyA, tenant, pending.id, ...visitorWindow())).rejects.toThrow('persistence failure');
    expect(await fixture.visitor.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'PENDING' });
    expect(await fixture.visitorPass.count({ where: { visitorId: pending.id } })).toBe(0);
    const issued = await visitors.approve(societyA, tenant, pending.id, ...visitorWindow());
    const failedClient = failingVisitorClient('auditEvent');
    const rejected = new VisitorVerificationService(failedClient, new GateAuditService(failedClient));
    await expect(rejected.verify(societyA, gateId, issued.credential, owner)).rejects.toThrow('persistence failure');
    await expect(rejected.checkIn(societyA, gateId, issued.credential, owner)).rejects.toThrow('persistence failure');
    expect(await fixture.visitorPass.findUniqueOrThrow({ where: { id: issued.pass.id } })).toMatchObject({ status: 'ACTIVE', checkedInAt: null });
    expect(await fixture.visitor.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'APPROVED' });
    await verification.checkIn(societyA, gateId, issued.credential, owner);
    await expect(rejected.checkOut(societyA, gateId, issued.credential, owner)).rejects.toThrow('persistence failure');
    expect(await fixture.visitorPass.findUniqueOrThrow({ where: { id: issued.pass.id } })).toMatchObject({ checkedOutAt: null });
    expect(await fixture.visitor.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'CHECKED_IN' });
    expect((await gateAudit.list(societyA, gateId)).map(row => row.event)).toEqual(['VISITOR_CHECKED_IN']);
  });

  it('issues and consumes a visitor pass once under concurrent restricted-role transitions', async () => {
    const { gateId, unitId } = await arrivalDestination();
    await arrivalOccupancy(societyA, unitId, tenant);
    const pending = await visitors.createRequest(societyA, tenant, unitId, 'Concurrent');
    const approvals = await Promise.allSettled([1, 2].map(() => visitors.approve(societyA, tenant, pending.id, ...visitorWindow())));
    expect(approvals.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const approved = approvals.find(result => result.status === 'fulfilled');
    if (!approved || approved.status !== 'fulfilled') throw new Error('Expected one pass');
    expect(await fixture.visitorPass.count({ where: { visitorId: pending.id } })).toBe(1);
    const entries = await Promise.allSettled([1, 2].map(() => verification.checkIn(societyA, gateId, approved.value.credential, owner)));
    expect(entries.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await gateAudit.list(societyA, gateId)).map(row => row.event)).toEqual(['VISITOR_CHECKED_IN']);
  });

  it('rejects foreign visitor parents and foreign nested passes even for malformed legacy links', async () => {
    const a = await arrivalDestination(), b = await arrivalDestination(societyB);
    await arrivalOccupancy(societyA, a.unitId, tenant);
    await arrivalOccupancy(societyB, b.unitId, tenant);
    const local = await visitors.createPass(societyA, tenant, a.unitId, 'Local', '999', ...visitorWindow());
    const remote = await visitors.createPass(societyB, tenant, b.unitId, 'Foreign', '999', ...visitorWindow());
    // Copied tables intentionally omit public FKs; explicit society/parent
    // filters and RLS must still deny these malformed legacy associations.
    await fixture.visitorPass.update({ where: { id: remote.pass.id }, data: { visitorId: local.visitor.id } });
    expect((await visitors.listForHost(societyA, tenant))[0].passes.map(row => row.id)).toEqual([local.pass.id]);
    await expect(verification.verify(societyB, b.gateId, remote.credential, owner)).rejects.toThrow('not found');
    await expect(verification.checkIn(societyB, b.gateId, remote.credential, owner)).rejects.toThrow('not found');
  });

  it('routes delivery, cab and school arrivals to current occupants rather than non-resident owners', async () => {
    for (const [scope, subjectType, provider, minutes] of [
      [societyA, AccessSubjectType.DELIVERY, 'Courier', 30],
      [societyB, AccessSubjectType.CAB, 'Cab', 15],
      [societyA, AccessSubjectType.OTHER, 'SCHOOL_TRANSPORT', 20],
    ] as const) {
      const { gateId, unitId } = await arrivalDestination(scope);
      await fixture.unitOwnership.create({ data: { societyId: scope, unitId, userId: owner, effectiveFrom: new Date(Date.now() - 86_400_000) } });
      await arrivalOccupancy(scope, unitId, tenant);
      const request = await arrivals.create(scope, owner, gateId, unitId, subjectType, '  Arrival  ', provider);
      expect(request).toMatchObject({ societyId: scope, unitId, requestedById: tenant, status: 'PENDING',
        subjectName: 'Arrival', metadata: expect.objectContaining({ approvalWindowMinutes: minutes, source: 'GATE_QUICK_ARRIVAL', gateId }) });
      const audit = await fixture.auditEvent.findMany({ where: { accessRequestId: request.id } });
      expect(audit).toEqual([expect.objectContaining({ societyId: scope, actorUserId: owner, gateId, event: 'ACCESS_CREATED' })]);
    }
    expect(await runtime.accessRequest.findMany()).toEqual([]);
  });

  it('skips expired delegates and foreign occupancy links while preserving current primary contact ordering', async () => {
    const { gateId, unitId } = await arrivalDestination();
    await arrivalOccupancy(societyA, unitId, owner, { primaryGateContact: true, escalationOrder: 0, gateApprovalExpiresAt: new Date(Date.now() - 86_400_000) });
    // Copied fixture intentionally admits an invalid legacy parent link; both
    // explicit society predicate and RLS must exclude it from routing.
    const foreignActor = randomUUID(); arrivalUsers.add(foreignActor);
    // Match the fixture's initial user seed: copied columns retain public enum
    // defaults, while Prisma create would bind a nonexistent local UserStatus.
    await fixture.$executeRaw(Prisma.sql`INSERT INTO "User" ("id","phone","updatedAt")
      VALUES (${foreignActor}::uuid,${`arrival-${foreignActor}`},CURRENT_TIMESTAMP)`);
    // Keep the migrated one-active-primary-per-unit index intact. The foreign
    // non-primary still outranks the eligible tenant by escalation order.
    await arrivalOccupancy(societyB, unitId, foreignActor, { primaryGateContact: false, escalationOrder: 1 });
    await arrivalOccupancy(societyA, unitId, tenant, { primaryGateContact: false, escalationOrder: 50 });
    expect(await arrivals.create(societyA, owner, gateId, unitId, AccessSubjectType.DELIVERY, 'Courier')).toMatchObject({ requestedById: tenant });
    await fixture.unitOccupancy.updateMany({ where: { societyId: societyA, unitId, userId: owner },
      data: { gateApprovalExpiresAt: null, escalationOrder: 100 } });
    expect(await arrivals.create(societyA, owner, gateId, unitId, AccessSubjectType.CAB, 'Driver')).toMatchObject({ requestedById: owner });
  });

  it('fails closed for moved-out, future, disabled and expired-only occupants without falling back to ownership', async () => {
    for (const data of [
      { effectiveTo: new Date(Date.now() - 86_400_000) }, { effectiveFrom: new Date(Date.now() + 86_400_000) },
      { gateApprovalEnabled: false }, { gateApprovalExpiresAt: new Date(Date.now() - 86_400_000) }, { active: false },
    ]) {
      const { gateId, unitId } = await arrivalDestination();
      await fixture.unitOwnership.create({ data: { societyId: societyA, unitId, userId: owner } });
      await arrivalOccupancy(societyA, unitId, tenant, data);
      await expect(arrivals.create(societyA, owner, gateId, unitId, AccessSubjectType.CAB, 'Driver')).rejects.toThrow(/active resident/);
      expect(await fixture.accessRequest.count({ where: { unitId } })).toBe(0);
    }
  });

  it('enforces real feature restrictions inside tenant context before writing gate arrivals', async () => {
    const { gateId, unitId } = await arrivalDestination();
    await arrivalOccupancy(societyA, unitId, tenant);
    await fixture.society.update({ where: { id: societyA }, data: { featureOverrides: { DELIVERY_MANAGEMENT: false } } });
    await expect(arrivals.create(societyA, owner, gateId, unitId, AccessSubjectType.DELIVERY, 'Courier')).rejects.toThrow(/not enabled/);
    expect(await fixture.accessRequest.count({ where: { unitId } })).toBe(0);
    await fixture.society.update({ where: { id: societyA }, data: { featureOverrides: { DELIVERY_MANAGEMENT: true } } });
  });

  it('denies foreign gates/units and rolls back request creation if audit persistence fails', async () => {
    const a = await arrivalDestination(), b = await arrivalDestination(societyB);
    await arrivalOccupancy(societyA, a.unitId, tenant);
    await expect(arrivals.create(societyA, owner, b.gateId, a.unitId, AccessSubjectType.CAB, 'Driver')).rejects.toThrow(/Gate does not belong/);
    await expect(arrivals.create(societyA, owner, a.gateId, b.unitId, AccessSubjectType.CAB, 'Driver')).rejects.toThrow(/active resident/);
    await fixture.gate.update({ where: { id: a.gateId }, data: { active: false } });
    await expect(arrivals.create(societyA, owner, a.gateId, a.unitId, AccessSubjectType.CAB, 'Driver')).rejects.toThrow(/Gate does not belong/);
    await fixture.gate.update({ where: { id: a.gateId }, data: { active: true } });
    const rollbackClient = {
      withTenantContext: (scope: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.withTenantContext(scope, tx => run(new Proxy(tx, {
        get(target, key) {
          if (key === 'auditEvent') return { create: async () => { throw new Error('Simulated audit persistence failure'); } };
          const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
        },
      }))),
    };
    await expect(new GateArrivalService(rollbackClient as never, new EntitlementService(runtime))
      .create(societyA, owner, a.gateId, a.unitId, AccessSubjectType.DELIVERY, 'Courier')).rejects.toThrow(/audit persistence/);
    expect(await fixture.accessRequest.count({ where: { unitId: a.unitId } })).toBe(0);
    const [context] = await runtime.$queryRaw<Array<{ scope: string | null }>>(Prisma.sql`SELECT current_setting('app.aaraagate_society_id',true) AS scope`);
    expect([societyA, societyB]).not.toContain(context.scope);
  });

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
