import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SocietyWorkforceService } from './society-workforce.service';

function disposableDatabase() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.AARAAGATE_BILLING_RLS_CI !== '1') return false;
  try { const u = new URL(process.env.DATABASE_URL ?? ''); return u.protocol === 'postgresql:' && ['localhost', '127.0.0.1'].includes(u.hostname) && u.port === '5432' && u.pathname === '/aaraagate_ci' && !u.searchParams.has('schema'); } catch { return false; }
}

(disposableDatabase() ? describe : describe.skip)('Society workforce migrated concurrency and restricted-role acceptance', () => {
  const schema = `workforce_${randomUUID().replaceAll('-', '')}`, role = `${schema}_app`, password = randomUUID();
  const base = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/aaraagate_test');
  const ownerUrl = new URL(base); ownerUrl.searchParams.set('schema', schema);
  const runtimeUrl = new URL(ownerUrl); runtimeUrl.username = role; runtimeUrl.password = password; runtimeUrl.searchParams.set('connection_limit', '4');
  const owner = new PrismaService({ datasources: { db: { url: ownerUrl.toString() } } });
  const runtime = new PrismaService({ datasources: { db: { url: runtimeUrl.toString() } } });
  const publicDb = new PrismaService({ datasources: { db: { url: base.toString() } } });
  const service = new SocietyWorkforceService(runtime);
  const a = randomUUID(), b = randomUUID(), actor = randomUUID(), wa = randomUUID(), wb = randomUUID(), ga = randomUUID(), gb = randomUUID();
  const tables = ['Gate', 'SocietyWorker', 'SocietyWorkerGateAccess', 'SocietyWorkerAttendance', 'SocietyWorkerLeave', 'SocietyWorkerEvent'];
  let created = false;
  function ddl(sql: string) { execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--stdin', '--url', base.toString()], { input: sql, stdio: 'pipe', timeout: 30000 }); }
  beforeAll(async () => {
    ddl(`CREATE SCHEMA "${schema}"; CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS;`); created = true;
    ddl(tables.map(table => `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL); ALTER TABLE "${schema}"."${table}" ENABLE ROW LEVEL SECURITY; ALTER TABLE "${schema}"."${table}" FORCE ROW LEVEL SECURITY; CREATE POLICY tenant ON "${schema}"."${table}" TO "${role}" USING ("societyId"=NULLIF(current_setting('app.aaraagate_society_id',true),'')::uuid) WITH CHECK ("societyId"=NULLIF(current_setting('app.aaraagate_society_id',true),'')::uuid); GRANT SELECT,INSERT,UPDATE,DELETE ON "${schema}"."${table}" TO "${role}";`).join('\n') + `GRANT USAGE ON SCHEMA "${schema}" TO "${role}";`);
    // Prisma schema-qualifies enum casts; LIKE preserves the public type until retargeted.
    for (const [table, column, type] of [['SocietyWorker', 'verification', 'SocietyWorkerVerificationStatus'], ['SocietyWorkerEvent', 'event', 'SocietyWorkerEventType']]) {
      ddl(`DO $copy_enum$ DECLARE labels text; BEGIN
        SELECT string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder) INTO labels
        FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public' AND t.typname='${type}';
        EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)', '${schema}', '${type}', labels);
      END $copy_enum$;
      ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" DROP DEFAULT;
      ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" TYPE "${schema}"."${type}" USING "${column}"::text::"${schema}"."${type}";
      GRANT USAGE ON TYPE "${schema}"."${type}" TO "${role}";`);
    }
    ddl(`ALTER TABLE "${schema}"."SocietyWorker" ALTER COLUMN "verification" SET DEFAULT 'PENDING'::"${schema}"."SocietyWorkerVerificationStatus";`);
    await owner.$connect(); await runtime.$connect();
  }, 60000);
  beforeEach(async () => {
    ddl(`TRUNCATE ${tables.map(t => `"${schema}"."${t}"`).join(',')};`);
    await owner.gate.createMany({ data: [{ id: ga, societyId: a, name: 'A gate', code: 'A' }, { id: gb, societyId: b, name: 'B gate', code: 'B' }] });
    await owner.societyWorker.createMany({ data: [[wa, a], [wb, b]].map(([id, societyId]) => ({ id, societyId, name: 'Staff', phone: `staff-${id}`, role: 'Gardener', department: 'Grounds', verification: 'VERIFIED' as const, createdByUserId: actor })) });
    await owner.societyWorkerGateAccess.createMany({ data: [{ societyId: a, workerId: wa, gateId: ga }, { societyId: b, workerId: wb, gateId: gb }] });
  });
  afterAll(async () => {
    await Promise.all([owner.$disconnect(), runtime.$disconnect(), publicDb.$disconnect()]);
    if (created) ddl(`DROP SCHEMA "${schema}" CASCADE; DROP OWNED BY "${role}"; DROP ROLE "${role}";`);
  });
  const checkIn = (key: string) => service.checkIn(a, ga, wa, actor, key);
  const checkOut = (key: string) => service.checkOut(a, ga, wa, actor, key);

  it('serializes distinct check-ins and leaves exactly one open row', async () => {
    const results = await Promise.allSettled([checkIn('concurrent-in-0001'), checkIn('concurrent-in-0002')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await owner.societyWorkerAttendance.count({ where: { societyId: a, workerId: wa, checkedOutAt: null } })).toBe(1);
  });
  it('recovers simultaneous same-key retries without raw unique errors', async () => {
    const rows = await Promise.all([checkIn('same-key-in-0001'), checkIn('same-key-in-0001')]); expect(rows[0].id).toBe(rows[1].id);
  });
  it('serializes checkout and preserves the first action on a late retry', async () => {
    await checkIn('checkout-entry-0001');
    const results = await Promise.allSettled([checkOut('checkout-key-0001'), checkOut('checkout-key-0002')]);
    const accepted = results.filter(r => r.status === 'fulfilled'); expect(accepted).toHaveLength(1);
    const row = await owner.societyWorkerAttendance.findFirstOrThrow({ where: { societyId: a } });
    const next = await checkIn('next-entry-000001');
    expect((await checkOut(row.checkOutKey!)).id).toBe(row.id);
    expect((await owner.societyWorkerAttendance.findUniqueOrThrow({ where: { id: next.id } })).checkedOutAt).toBeNull();
  });
  it('replays simultaneous same-key checkout and denies cross-society parents', async () => {
    await checkIn('same-out-entry-0001');
    const rows = await Promise.all([checkOut('same-key-out-0001'), checkOut('same-key-out-0001')]); expect(rows[0].id).toBe(rows[1].id);
    await expect(service.checkIn(a, gb, wa, actor, 'foreign-gate-0001')).rejects.toThrow();
    await expect(service.checkOut(a, ga, wb, actor, 'foreign-worker-0001')).rejects.toThrow();
    expect((await service.list(b)).map(w => w.id)).toEqual([wb]);
  });
  it('filters malformed nested parents and denies absent context', async () => {
    await owner.societyWorkerAttendance.create({ data: { societyId: a, workerId: wa, gateId: gb, checkedInAt: new Date(), checkInByUserId: actor, checkInKey: 'malformed-parent-0001' } });
    expect(await service.attendance(a)).toEqual([]);
    expect(await runtime.societyWorker.findMany()).toEqual([]);
    expect((await service.list(a))[0].attendances).toEqual([]);
  });
  it('rolls back worker changes if the event write is denied and clears context', async () => {
    ddl(`REVOKE INSERT ON "${schema}"."SocietyWorkerEvent" FROM "${role}";`);
    try { await expect(service.configure(a, wa, actor, { department: 'Changed' })).rejects.toThrow(); }
    finally { ddl(`GRANT INSERT ON "${schema}"."SocietyWorkerEvent" TO "${role}";`); }
    expect((await owner.societyWorker.findUniqueOrThrow({ where: { id: wa } })).department).toBe('Grounds');
    expect(await runtime.societyWorker.findMany()).toEqual([]);
  });
  it('prevents correction from reopening another record while attendance is open', async () => {
    const first = await checkIn('correction-first-in'); await checkOut('correction-first-out');
    await checkIn('correction-second-in');
    await expect(service.correctAttendance(a, first.id, actor, { checkedOutAt: null, reason: 'Reviewed correction' })).rejects.toThrow('already has an open');
  });
  it('enforces the new partial index on real public migrated tables', async () => {
    const societyId = randomUUID();
    await publicDb.society.create({ data: { id: societyId, name: 'Workforce migration fixture', code: `wf-${societyId}` } });
    try {
      const gate = await publicDb.gate.create({ data: { societyId, name: 'Gate', code: 'G' } });
      const worker = await publicDb.societyWorker.create({ data: { societyId, name: 'Staff', phone: `wf-${societyId}`, role: 'Gardener', department: 'Grounds', createdByUserId: actor } });
      const data = { societyId, workerId: worker.id, gateId: gate.id, checkedInAt: new Date(), checkInByUserId: actor };
      await publicDb.societyWorkerAttendance.create({ data: { ...data, checkInKey: 'first-public-key' } });
      await expect(publicDb.societyWorkerAttendance.create({ data: { ...data, checkInKey: 'second-public-key' } })).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await publicDb.societyWorkerAttendance.deleteMany({ where: { societyId } });
      await publicDb.society.delete({ where: { id: societyId } });
    }
  });
});
