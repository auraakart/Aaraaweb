import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import { MigrationOpeningBalanceCommitService } from './migration-opening-balance-commit.service';

// This test creates immutable financial evidence. Never run on a shared DB.
const disposable = (() => {
  if (process.env.GITHUB_ACTIONS !== 'true') return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return url.protocol === 'postgresql:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.port === '5432' && url.pathname === '/aaraagate_ci' &&
      !url.searchParams.has('schema');
  } catch { return false; }
})();

(disposable ? describe : describe.skip)('V5.6.8 atomic rollback on disposable PostgreSQL', () => {
  const prisma = new PrismaService();
  const accounting = new AccountingService(prisma);
  const service = new MigrationOpeningBalanceCommitService(prisma, {} as never, accounting);
  const societyId = randomUUID();
  const actorId = randomUUID();
  const batchId = randomUUID();
  const periodId = randomUUID();
  const assetId = randomUUID();
  const equityId = randomUUID();
  let journalId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: actorId, phone: 'rollback-' + actorId } });
    await prisma.society.create({ data: {
      id: societyId, name: 'Disposable rollback proof', code: 'rollback-' + societyId,
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
    const draft = await accounting.createDraft(societyId, actorId, {
      periodId, entryNumber: 'TEST-OB-' + batchId.slice(0, 8),
      entryDate: '2026-10-10', description: 'Disposable opening balance',
      sourceType: 'OPENING_BALANCE', sourceId: 'migration:' + batchId,
      lines: [
        { accountId: assetId, debitPaise: 12000, creditPaise: 0 },
        { accountId: equityId, debitPaise: 0, creditPaise: 12000 },
      ],
    }) as { id: string };
    journalId = draft.id;
    await accounting.postJournal(societyId, actorId, journalId);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatch"
        ("id","societyId","actorUserId","entityType","status","checksum",
         "totalRows","validRows","invalidRows","duplicateRows","committedAt","committedByUserId")
      VALUES (${batchId}::uuid,${societyId}::uuid,${actorId}::uuid,'OPENING_BALANCE',
        'COMMITTED',${randomUUID().replaceAll('-', '').repeat(2)},2,2,0,0,
        CURRENT_TIMESTAMP,${actorId}::uuid)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatchRow"
        ("batchId","rowNumber","normalized","valid","targetType","targetId","committedAt")
      VALUES (${batchId}::uuid,1,'{}'::jsonb,true,'JournalEntry',${journalId}::uuid,CURRENT_TIMESTAMP),
             (${batchId}::uuid,2,'{}'::jsonb,true,'JournalEntry',${journalId}::uuid,CURRENT_TIMESTAMP)
    `);
  }, 20_000);

  afterAll(async () => { await prisma.$disconnect(); });

  async function state() {
    const result = await prisma.$queryRaw<Array<{
      batchStatus: string; journalStatus: string; rolledBack: bigint; reversals: bigint;
    }>>(Prisma.sql`
      SELECT b."status" AS "batchStatus",j."status"::text AS "journalStatus",
        (SELECT COUNT(*) FROM "MigrationBatchRow"
         WHERE "batchId"=${batchId}::uuid AND "rolledBackAt" IS NOT NULL) AS "rolledBack",
        (SELECT COUNT(*) FROM "JournalEntry"
         WHERE "societyId"=${societyId}::uuid AND "reversalOfEntryId"=${journalId}::uuid) AS "reversals"
      FROM "MigrationBatch" b JOIN "JournalEntry" j ON j."id"=${journalId}::uuid
      WHERE b."id"=${batchId}::uuid AND b."societyId"=${societyId}::uuid
    `);
    return result[0];
  }

  it('rolls back all PostgreSQL journal work after a late batch-write fault, then recovers once', async () => {
    expect(await state()).toMatchObject({
      batchStatus: 'COMMITTED',journalStatus: 'POSTED',rolledBack: 0n,reversals: 0n,
    });
    const failAtBatchWrite = {
      $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        prisma.$transaction(tx => work({
          $executeRaw: (sql: Prisma.Sql) => tx.$executeRaw(sql),
          $queryRaw: (sql: Prisma.Sql) => {
            if (sql.strings.join(' ').includes('UPDATE "MigrationBatch"'))
              throw new Error('TEST late migration status failure');
            return tx.$queryRaw(sql);
          },
        } as Prisma.TransactionClient)),
    } as unknown as PrismaService;
    const failing = new MigrationOpeningBalanceCommitService(failAtBatchWrite, {} as never, accounting);
    await expect(failing.rollback(societyId, actorId, batchId))
      .rejects.toThrow('TEST late migration status failure');
    expect(await state()).toMatchObject({
      batchStatus: 'COMMITTED',journalStatus: 'POSTED',rolledBack: 0n,reversals: 0n,
    });
    await expect(service.rollback(societyId, actorId, batchId))
      .resolves.toMatchObject({ id: batchId, status: 'ROLLED_BACK' });
    expect(await state()).toMatchObject({
      batchStatus: 'ROLLED_BACK',journalStatus: 'REVERSED',rolledBack: 2n,reversals: 1n,
    });
    await expect(service.rollback(societyId, actorId, batchId))
      .resolves.toMatchObject({ id: batchId, status: 'ROLLED_BACK' });
    expect(await state()).toMatchObject({
      batchStatus: 'ROLLED_BACK',journalStatus: 'REVERSED',rolledBack: 2n,reversals: 1n,
    });
  }, 30_000);
});
