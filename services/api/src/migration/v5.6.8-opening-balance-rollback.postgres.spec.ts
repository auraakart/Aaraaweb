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

  it('rejects a manual finance reversal as evidence of migration rollback', async () => {
    const unrelatedBatchId = randomUUID();
    const draft = await accounting.createDraft(societyId, actorId, {
      periodId,
      entryNumber: 'MANUAL-OB-' + unrelatedBatchId.slice(0, 8),
      entryDate: '2026-10-10',
      description: 'Independent disposable opening-balance journal',
      sourceType: 'OPENING_BALANCE',
      sourceId: 'migration:' + unrelatedBatchId,
      lines: [
        { accountId: assetId, debitPaise: 3000, creditPaise: 0 },
        { accountId: equityId, debitPaise: 0, creditPaise: 3000 },
      ],
    }) as { id: string };
    await accounting.postJournal(societyId, actorId, draft.id);
    await accounting.reverseJournal(societyId, actorId, draft.id, {
      entryNumber: 'MANUAL-RV-' + unrelatedBatchId.slice(0, 8),
      entryDate: '2026-10-10',
      reason: 'Independent finance correction',
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatch"
        ("id","societyId","actorUserId","entityType","status","checksum",
         "totalRows","validRows","invalidRows","duplicateRows","committedAt","committedByUserId")
      VALUES (${unrelatedBatchId}::uuid,${societyId}::uuid,${actorId}::uuid,'OPENING_BALANCE',
        'COMMITTED',${randomUUID().replaceAll('-', '').repeat(2)},2,2,0,0,
        CURRENT_TIMESTAMP,${actorId}::uuid)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatchRow"
        ("batchId","rowNumber","normalized","valid","targetType","targetId","committedAt")
      VALUES (${unrelatedBatchId}::uuid,1,'{}'::jsonb,true,'JournalEntry',${draft.id}::uuid,CURRENT_TIMESTAMP),
             (${unrelatedBatchId}::uuid,2,'{}'::jsonb,true,'JournalEntry',${draft.id}::uuid,CURRENT_TIMESTAMP)
    `);

    await expect(service.rollback(societyId, actorId, unrelatedBatchId))
      .rejects.toThrow('Opening-balance migration reversal evidence is incomplete');
    const state = await prisma.$queryRaw<Array<{ batchStatus: string; journalStatus: string; rolledBackRows: bigint; reversals: bigint }>>(Prisma.sql`
      SELECT mb."status" AS "batchStatus", je."status"::text AS "journalStatus",
        (SELECT COUNT(*) FROM "MigrationBatchRow"
         WHERE "batchId"=${unrelatedBatchId}::uuid AND "rolledBackAt" IS NOT NULL) AS "rolledBackRows",
        (SELECT COUNT(*) FROM "JournalEntry"
         WHERE "societyId"=${societyId}::uuid AND "reversalOfEntryId"=${draft.id}::uuid) AS "reversals"
      FROM "MigrationBatch" mb JOIN "JournalEntry" je ON je."id"=${draft.id}::uuid
      WHERE mb."id"=${unrelatedBatchId}::uuid AND mb."societyId"=${societyId}::uuid
    `);
    expect(state).toMatchObject([{
      batchStatus: 'COMMITTED', journalStatus: 'REVERSED', rolledBackRows: 0n, reversals: 1n,
    }]);
  }, 30_000);

  it('rejects a second migration batch that points to the first batch journal', async () => {
    const foreignBatchId = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatch"
        ("id","societyId","actorUserId","entityType","status","checksum",
         "totalRows","validRows","invalidRows","duplicateRows","committedAt","committedByUserId")
      VALUES (${foreignBatchId}::uuid,${societyId}::uuid,${actorId}::uuid,'OPENING_BALANCE',
        'COMMITTED',${randomUUID().replaceAll('-', '').repeat(2)},2,2,0,0,
        CURRENT_TIMESTAMP,${actorId}::uuid)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatchRow"
        ("batchId","rowNumber","normalized","valid","targetType","targetId","committedAt")
      VALUES (${foreignBatchId}::uuid,1,'{}'::jsonb,true,'JournalEntry',${journalId}::uuid,CURRENT_TIMESTAMP),
             (${foreignBatchId}::uuid,2,'{}'::jsonb,true,'JournalEntry',${journalId}::uuid,CURRENT_TIMESTAMP)
    `);
    await expect(service.rollback(societyId, actorId, foreignBatchId))
      .rejects.toThrow('Opening-balance journal not found');
    expect(await state()).toMatchObject({
      batchStatus: 'COMMITTED',journalStatus: 'POSTED',rolledBack: 0n,reversals: 0n,
    });
    const foreign = await prisma.$queryRaw<Array<{ status: string; rolledBack: bigint }>>(Prisma.sql`
      SELECT b."status", (SELECT COUNT(*) FROM "MigrationBatchRow"
        WHERE "batchId"=${foreignBatchId}::uuid AND "rolledBackAt" IS NOT NULL) AS "rolledBack"
      FROM "MigrationBatch" b WHERE b."id"=${foreignBatchId}::uuid AND b."societyId"=${societyId}::uuid
    `);
    expect(foreign).toMatchObject([{ status: 'COMMITTED', rolledBack: 0n }]);
  }, 20_000);

  it('reverts a real journal reversal when the rollback row update count is incomplete', async () => {
    expect(await state()).toMatchObject({
      batchStatus: 'COMMITTED', journalStatus: 'POSTED', rolledBack: 0n, reversals: 0n,
    });
    let injected = false;
    const partialUpdatePrisma = {
      $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        prisma.$transaction(tx => work({
          $queryRaw: (sql: Prisma.Sql) => tx.$queryRaw(sql),
          $executeRaw: async (sql: Prisma.Sql) => {
            const affected = await tx.$executeRaw(sql);
            if (sql.strings.join(' ').includes('UPDATE "MigrationBatchRow"') &&
                sql.strings.join(' ').includes('"rolledBackAt"')) {
              injected = true;
              // The real UPDATE ran against this transaction, but pretend only
              // one of the two rows was written. Its rejection must undo the journal.
              return 1;
            }
            return affected;
          },
        } as Prisma.TransactionClient)),
    } as unknown as PrismaService;
    const incomplete = new MigrationOpeningBalanceCommitService(
      partialUpdatePrisma, {} as never, accounting,
    );
    await expect(incomplete.rollback(societyId, actorId, batchId))
      .rejects.toThrow('Opening-balance migration row state changed during rollback');
    expect(injected).toBe(true);
    expect(await state()).toMatchObject({
      batchStatus: 'COMMITTED', journalStatus: 'POSTED', rolledBack: 0n, reversals: 0n,
    });
  }, 30_000);

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
