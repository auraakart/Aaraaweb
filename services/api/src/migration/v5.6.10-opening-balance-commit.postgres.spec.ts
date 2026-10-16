import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountingService } from '../accounting/accounting.service';
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
  const accounting = new AccountingService(prisma);
  const service = new MigrationOpeningBalanceCommitService(prisma, opening, accounting);
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

    const committed = await service.commit(societyId, actorId, batchId);
    expect(committed).toMatchObject({ status: 'COMMITTED' });
    expect(committed).toHaveProperty('journalId', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(await snapshot()).toMatchObject({
      status: 'COMMITTED', linkedRows: 2n, journals: 1n, posted: 1n,
    });
    const replay = await service.commit(societyId, actorId, batchId);
    expect(replay).toMatchObject({ status: 'COMMITTED' });
    expect(replay).toHaveProperty('journalId', (committed as { journalId: string }).journalId);
    expect(await snapshot()).toMatchObject({
      status: 'COMMITTED', linkedRows: 2n, journals: 1n, posted: 1n,
    });
  }, 30_000);

  it('serializes overlapping commit and rollback calls into one journal and reversal', async () => {
    // A distinct batch prevents dependency on the preceding failure/retry test.
    const concurrentBatch = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatch"
        ("id","societyId","actorUserId","entityType","status","checksum",
         "totalRows","validRows","invalidRows","duplicateRows")
      VALUES (${concurrentBatch}::uuid,${societyId}::uuid,${actorId}::uuid,'OPENING_BALANCE',
        'READY',${randomUUID().replaceAll('-', '').repeat(2)},2,2,0,0)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatchRow" ("batchId","rowNumber","normalized","valid")
      VALUES (${concurrentBatch}::uuid,1,
        '{"entry_date":"2026-10-10","account_code":"BANK","amount_paise":"12000","side":"DEBIT"}'::jsonb,true),
             (${concurrentBatch}::uuid,2,
        '{"entry_date":"2026-10-10","account_code":"EQUITY","amount_paise":"12000","side":"CREDIT"}'::jsonb,true)
    `);

    const commits = await Promise.all([
      service.commit(societyId, actorId, concurrentBatch),
      service.commit(societyId, actorId, concurrentBatch),
    ]);
    expect(commits).toHaveLength(2);
    expect(commits).toEqual([
      expect.objectContaining({ status: 'COMMITTED' }),
      expect.objectContaining({ status: 'COMMITTED' }),
    ]);

    const linked = await prisma.$queryRaw<Array<{
      id: string; lineCount: bigint; postedCount: bigint; linkedRows: bigint;
    }>>(Prisma.sql`
      SELECT j."id",
        (SELECT COUNT(*) FROM "JournalLine" WHERE "entryId"=j."id") AS "lineCount",
        (SELECT COUNT(*) FROM "JournalEntry" WHERE "sourceId"=${'migration:' + concurrentBatch}
          AND "sourceType"='OPENING_BALANCE' AND "status"='POSTED'
          AND "societyId"=${societyId}::uuid) AS "postedCount",
        (SELECT COUNT(*) FROM "MigrationBatchRow" WHERE "batchId"=${concurrentBatch}::uuid
          AND "targetId"=j."id") AS "linkedRows"
      FROM "JournalEntry" j WHERE j."societyId"=${societyId}::uuid
        AND j."sourceType"='OPENING_BALANCE'
        AND j."sourceId"=${'migration:' + concurrentBatch}
    `);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ lineCount: 2n, postedCount: 1n, linkedRows: 2n });
    // Both overlapping requests must return the same authoritative receipt.
    for (const receipt of commits) expect(receipt).toHaveProperty('journalId', linked[0].id);

    const rollbacks = await Promise.all([
      service.rollback(societyId, actorId, concurrentBatch),
      service.rollback(societyId, actorId, concurrentBatch),
    ]);
    expect(rollbacks).toHaveLength(2);
    expect(rollbacks.every(item => item.status === 'ROLLED_BACK')).toBe(true);

    const after = await prisma.$queryRaw<Array<{
      batchStatus: string; sourceStatus: string; reversals: bigint; rolledBackRows: bigint;
    }>>(Prisma.sql`
      SELECT b."status" AS "batchStatus",j."status"::text AS "sourceStatus",
        (SELECT COUNT(*) FROM "JournalEntry" WHERE "reversalOfEntryId"=j."id"
          AND "societyId"=${societyId}::uuid) AS "reversals",
        (SELECT COUNT(*) FROM "MigrationBatchRow" WHERE "batchId"=${concurrentBatch}::uuid
          AND "rolledBackAt" IS NOT NULL) AS "rolledBackRows"
      FROM "MigrationBatch" b
      JOIN "JournalEntry" j ON j."sourceId"=${'migration:' + concurrentBatch}
        AND j."sourceType"='OPENING_BALANCE' AND j."societyId"=b."societyId"
      WHERE b."id"=${concurrentBatch}::uuid AND b."societyId"=${societyId}::uuid
    `);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      batchStatus: 'ROLLED_BACK', sourceStatus: 'REVERSED',
      reversals: 1n, rolledBackRows: 2n,
    });
  }, 30_000);


  it('recovers a matching historical orphan without duplicating financial records and rejects mismatched evidence', async () => {
    // Simulates the old crash window: a POSTED journal while its batch is READY and unlinked.
    const seed = async (id: string, amount: number) => {
      const debit = JSON.stringify({entry_date:'2026-10-10', account_code:'BANK', amount_paise:String(amount), side:'DEBIT'});
      const credit = JSON.stringify({entry_date:'2026-10-10', account_code:'EQUITY', amount_paise:String(amount), side:'CREDIT'});
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "MigrationBatch"
          ("id","societyId","actorUserId","entityType","status","checksum","totalRows","validRows","invalidRows","duplicateRows")
        VALUES (${id}::uuid,${societyId}::uuid,${actorId}::uuid,'OPENING_BALANCE',
          'READY',${randomUUID().replaceAll('-', '').repeat(2)},2,2,0,0)
      `);
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "MigrationBatchRow" ("batchId","rowNumber","normalized","valid")
        VALUES (${id}::uuid,1,${debit}::jsonb,true),(${id}::uuid,2,${credit}::jsonb,true)
      `);
    };
    const prior = (id: string, amount: number, authorId = actorId) => opening.apply(societyId, authorId, {
      batchKey: `migration:${id}`,
      periodId,
      entryNumber: `MIG-OB-${id.replace(/-/g, '').slice(0, 16).toUpperCase()}`,
      entryDate: '2026-10-10',
      description: `Opening balances migrated from batch ${id}`,
      externalReference: `migration-batch:${id}`,
      lines: [
        {accountId:assetId, debitPaise:amount, creditPaise:0},
        {accountId:equityId, debitPaise:0, creditPaise:amount},
      ],
    });
    const state = (id: string) => prisma.$queryRaw<Array<{
      status:string; journals:bigint; linkedRows:bigint;
    }>>(Prisma.sql`
      SELECT b."status",
        (SELECT COUNT(*) FROM "JournalEntry" WHERE "societyId"=${societyId}::uuid
          AND "sourceType"='OPENING_BALANCE' AND "sourceId"=${'migration:' + id}) AS "journals",
        (SELECT COUNT(*) FROM "MigrationBatchRow"
          WHERE "batchId"=${id}::uuid AND "targetId" IS NOT NULL) AS "linkedRows"
      FROM "MigrationBatch" b WHERE b."id"=${id}::uuid AND b."societyId"=${societyId}::uuid
    `);

    const recoverable = randomUUID();
    await seed(recoverable, 19000);
    const orphan = await prior(recoverable, 19000);
    expect(await state(recoverable)).toMatchObject([{status:'READY', journals:1n, linkedRows:0n}]);
    await expect(service.commit(societyId, actorId, recoverable))
      .resolves.toMatchObject({status:'COMMITTED', journalId:orphan.journalId});
    expect(await state(recoverable)).toMatchObject([{status:'COMMITTED', journals:1n, linkedRows:2n}]);
    await expect(service.commit(societyId, actorId, recoverable))
      .resolves.toHaveProperty('journalId', orphan.journalId);

    const conflicting = randomUUID();
    await seed(conflicting, 21000);
    await prior(conflicting, 22000);
    await expect(service.commit(societyId, actorId, conflicting))
      .rejects.toThrow('Opening balance batch key already exists with different or non-posted content');
    expect(await state(conflicting)).toMatchObject([{status:'READY', journals:1n, linkedRows:0n}]);

    // A matching digest and source ID cannot legitimize another user's journal
    // when the original migration batch identifies a different accountable actor.
    const foreignActor = randomUUID();
    await prisma.user.create({data:{id:foreignActor, phone:'v5617-' + foreignActor}});
    const wrongAuthorBatch = randomUUID();
    await seed(wrongAuthorBatch, 23000);
    await prior(wrongAuthorBatch, 23000, foreignActor);
    await expect(service.commit(societyId, actorId, wrongAuthorBatch))
      .rejects.toThrow('Historical opening-balance migration journal provenance is incomplete');
    expect(await state(wrongAuthorBatch)).toMatchObject([{status:'READY', journals:1n, linkedRows:0n}]);

  }, 30_000);

  it('enforces exact society scope for the same global actor across two migration batches', async () => {
    const otherSocietyId = randomUUID();
    const otherBatchId = randomUUID();
    const otherPeriodId = randomUUID();
    const otherAssetId = randomUUID();
    const otherEquityId = randomUUID();
    await prisma.society.create({ data: {
      id: otherSocietyId, name: 'Second society migration scope', code: 'scope-' + otherSocietyId,
    } });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "LedgerAccount" ("id","societyId","code","name","type")
      VALUES (${otherAssetId}::uuid,${otherSocietyId}::uuid,'BANK','Second bank','ASSET'),
             (${otherEquityId}::uuid,${otherSocietyId}::uuid,'EQUITY','Second equity','EQUITY')
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AccountingPeriod" ("id","societyId","code","name","startsOn","endsOn")
      VALUES (${otherPeriodId}::uuid,${otherSocietyId}::uuid,'FY26','Second period',
        '2026-01-01'::date,'2026-12-31'::date)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatch"
        ("id","societyId","actorUserId","entityType","status","checksum",
         "totalRows","validRows","invalidRows","duplicateRows")
      VALUES (${otherBatchId}::uuid,${otherSocietyId}::uuid,${actorId}::uuid,'OPENING_BALANCE',
        'READY',${randomUUID().replaceAll('-', '').repeat(2)},2,2,0,0)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "MigrationBatchRow" ("batchId","rowNumber","normalized","valid")
      VALUES (${otherBatchId}::uuid,1,
        '{"entry_date":"2026-10-10","account_code":"BANK","amount_paise":"17000","side":"DEBIT"}'::jsonb,true),
             (${otherBatchId}::uuid,2,
        '{"entry_date":"2026-10-10","account_code":"EQUITY","amount_paise":"17000","side":"CREDIT"}'::jsonb,true)
    `);

    // The actor is the same global user. A valid UUID for the *other* society
    // must not grant authority to mutate or read this batch.
    await expect(service.commit(societyId, actorId, otherBatchId))
      .rejects.toThrow('Opening-balance migration batch not found');
    await expect(service.commit(otherSocietyId, actorId, batchId))
      .rejects.toThrow('Opening-balance migration batch not found');
    await expect(service.rollback(societyId, actorId, otherBatchId))
      .rejects.toThrow('Opening-balance migration batch not found');
    await expect(service.rollback(otherSocietyId, actorId, batchId))
      .rejects.toThrow('Opening-balance migration batch not found');

    const secondCommit = await service.commit(otherSocietyId, actorId, otherBatchId);
    expect(secondCommit).toMatchObject({ status: 'COMMITTED' });
    const secondJournalId = (secondCommit as { journalId: string }).journalId;
    expect(secondJournalId).toMatch(/^[0-9a-f-]{36}$/);
    const second = await prisma.$queryRaw<Array<{ societyId: string; status: string; debit: bigint }>>(Prisma.sql`
      SELECT j."societyId",j."status"::text AS "status",
        (SELECT COALESCE(SUM("debitPaise"),0)::bigint FROM "JournalLine"
          WHERE "entryId"=j."id") AS "debit"
      FROM "JournalEntry" j WHERE j."id"=${secondJournalId}::uuid
    `);
    expect(second).toMatchObject([{ societyId: otherSocietyId, status: 'POSTED', debit: 17000n }]);

    await expect(service.rollback(otherSocietyId, actorId, otherBatchId))
      .resolves.toMatchObject({ status: 'ROLLED_BACK' });
    // A's completed commit remains intact even after B is independently reversed.
    expect(await snapshot()).toMatchObject({
      status: 'COMMITTED', linkedRows: 2n, journals: 1n, posted: 1n,
    });
    const secondFinal = await prisma.$queryRaw<Array<{ status: string; reversals: bigint }>>(Prisma.sql`
      SELECT j."status"::text AS "status",
        (SELECT COUNT(*) FROM "JournalEntry"
          WHERE "societyId"=${otherSocietyId}::uuid AND "reversalOfEntryId"=j."id") AS "reversals"
      FROM "JournalEntry" j WHERE j."id"=${secondJournalId}::uuid
        AND j."societyId"=${otherSocietyId}::uuid
    `);
    expect(secondFinal).toMatchObject([{ status: 'REVERSED', reversals: 1n }]);
  }, 30_000);
});
