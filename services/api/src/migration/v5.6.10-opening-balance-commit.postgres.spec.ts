import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OpeningBalancesService } from '../accounting/opening-balances.service';
import { PrismaService } from '../prisma/prisma.service';
import { MigrationOpeningBalanceCommitService } from './migration-opening-balance-commit.service';

// Journal history is immutable: execute only on GitHub's isolated CI database.
const disposable = (() => {
  if (process.env.GITHUB_ACTIONS !== 'true') return false;
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return u.protocol === 'postgresql:' &&
      ['localhost', '127.0.0.1'].includes(u.hostname) &&
      u.port === '5432' && u.pathname === '/aaraagate_ci' &&
      !u.searchParams.has('schema');
  } catch { return false; }
})();

(disposable ? describe : describe.skip)('V5.6.10 atomic opening-balance commit on disposable PostgreSQL', () => {
  const prisma = new PrismaService();
  const opening = new OpeningBalancesService(prisma);
  const service = new MigrationOpeningBalanceCommitService(prisma, opening, {} as never);
  const societyId = randomUUID();
  const actorId = randomUUID();
  const batchId = randomUUID();
  const periodId = randomUUID();
  const assetId = randomUUID();
  const equityId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: actorId, phone: 'v5610-' + actorId } });
    await prisma.society.create({ data: {
      id: societyId, name: 'Disposable opening-balance commit', code: 'v5610-' + societyId,
    } });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "LedgerAccount" ("id","societyId","code","name","type")
      VALUES (${assetId}::uuid,${societyId}::uuid,'BANK','Opening bank','ASSET'),
             (${equityId}::uuid,${societyId}::uuid,'EQUITY','Opening equity','EQUITY')
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AccountingPeriod" ("id","societyId","code","name","startsOn","endsOn")
      VALUES (${periodId}::uuid,${societyId}::uuid,'FY26','Test year',
        '2026-01-01'::date,'2026-12-31'::date)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatch"
        ("id","societyId","actorUserId","entityType","status","checksum",
         "totalRows","validRows","invalidRows","duplicateRows")
      VALUES (${batchId}::uuid,${societyId}::uuid,${actorId}::uuid,'OPENING_BALANCE',
        'READY',${randomUUID().replaceAll('-', '').repeat(2)},2,2,0,0)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatchRow"
        ("batchId","rowNumber","normalized","valid")
      VALUES (${batchId}::uuid,1,
        '{"entry_date":"2026-10-10","account_code":"BANK","amount_paise":"12000","side":"DEBIT"}'::jsonb,true),
             (${batchId}::uuid,2,
        '{"entry_date":"2026-10-10","account_code":"EQUITY","amount_paise":"12000","side":"CREDIT"}'::jsonb,true)
    `);
  }, 20_000);

  afterAll(async () => { await prisma.$disconnect(); });

  async function snapshot() {
    const rows = await prisma.$queryRaw<Array<{
      status: string; linkedRows: bigint; journals: bigint; posted: bigint;
    }>>(Prisma.sql`
      SELECT b."status",
        (SELECT COUNT(*) FROM "MigrationBatchRow"
          WHERE "batchId"=${batchId}::uuid AND "targetId" IS NOT NULL) AS "linkedRows",
        (SELECT COUNT(*) FROM "JournalEntry"
          WHERE "societyId"=${societyId}::uuid AND "sourceType"='OPENING_BALANCE'
            AND "sourceId"=${'migration:' + batchId}) AS "journals",
        (SELECT COUNT(*) FROM "JournalEntry"
          WHERE "societyId"=${societyId}::uuid AND "sourceType"='OPENING_BALANCE'
            AND "sourceId"=${'migration:' + batchId} AND "status"='POSTED') AS "posted"
      FROM "MigrationBatch" b WHERE b."id"=${batchId}::uuid AND b."societyId"=${societyId}::uuid
    `);
    return rows[0];
  }

  it('discards a posted journal when final migration status write fails, then commits and replays exactly once', async () => {
    const pristine = { status: 'READY', linkedRows: 0n, journals: 0n, posted: 0n };
    expect(await snapshot()).toMatchObject(pristine);
    let faultInjected = false;
    const faultPrisma = {
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        prisma.$transaction(tx => run({
          $executeRaw: (query: Prisma.Sql) => tx.$executeRaw(query),
          $queryRaw: (query: Prisma.Sql) => {
            if (query.strings.join(' ').includes('UPDATE "MigrationBatch"')) {
              faultInjected = true;
              throw new Error('TEST late migration commit status failure');
            }
            return tx.$queryRaw(query);
          },
        } as Prisma.TransactionClient)),
    } as unknown as PrismaService;
    const failedCommit = new MigrationOpeningBalanceCommitService(faultPrisma, opening, {} as never);
    await expect(failedCommit.commit(societyId, actorId, batchId))
      .rejects.toThrow('TEST late migration commit status failure');
    expect(faultInjected).toBe(true);
    expect(await snapshot()).toMatchObject(pristine);

    const committed = await service.commit(societyId, actorId, batchId) as {
      journalId: string; status: string;
    };
    expect(committed.status).toBe('COMMITTED');
    expect(committed.journalId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await snapshot()).toMatchObject({
      status: 'COMMITTED', linkedRows: 2n, journals: 1n, posted: 1n,
    });
    const replay = await service.commit(societyId, actorId, batchId);
    expect(replay).toMatchObject({ status: 'COMMITTED' });
    expect(await snapshot()).toMatchObject({
      status: 'COMMITTED', linkedRows: 2n, journals: 1n, posted: 1n,
    });
  }, 30_000);
});
