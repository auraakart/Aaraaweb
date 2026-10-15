import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { ACCOUNTING_EXPORT_CONTRACT_V1, AccountingExportService } from './accounting-export.service';

// Economic journal history and statement receipts are immutable. Only run
// committed-row acceptance on the throwaway PostgreSQL instance provisioned
// by CI. Never enable this test on a developer or production database.
const disposable = (() => {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.AARAAGATE_FINANCE_CONCURRENCY_CI !== '1') return false;
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return u.protocol === 'postgresql:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
      u.port === '5432' && u.pathname === '/aaraagate_ci' && !u.searchParams.has('schema');
  } catch { return false; }
})();

(disposable ? describe : describe.skip)('V4.90.17 bank provenance and representative Tally CSV on disposable PostgreSQL', () => {
  const prisma = new PrismaService();
  const bank = new BankReconciliationService(prisma);
  const exports = new AccountingExportService(prisma);
  const societyId = randomUUID();
  const otherSocietyId = randomUUID();
  const userId = randomUUID();
  const bankLedgerId = randomUUID();
  const incomeLedgerId = randomUUID();
  const periodId = randomUUID();
  let bankAccountId: string;
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const sourceRow = (key: string, paise = 12345) => ({
    externalKey: key, transactionDate: '2026-10-10', valueDate: '2026-10-10',
    direction: 'CREDIT' as const, amountPaise: paise, reference: 'UTR-REVIEW-1',
    description: 'October maintenance',
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, phone: `bank-provenance-${userId}` } });
    await prisma.society.createMany({ data: [societyId, otherSocietyId].map(id => ({
      id, name: 'Disposable bank acceptance', code: `bank-${id}`,
    })) });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "LedgerAccount" ("id","societyId","code","name","type")
      VALUES (${bankLedgerId}::uuid,${societyId}::uuid,'1000','Society Bank','ASSET'),
             (${incomeLedgerId}::uuid,${societyId}::uuid,'4100','Maintenance Income','INCOME')
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AccountingPeriod" ("id","societyId","code","name","startsOn","endsOn")
      VALUES (${periodId}::uuid,${societyId}::uuid,'FY-2026','Financial year 2026',
        '2026-01-01'::date,'2026-12-31'::date)
    `);
    const created = await bank.createAccount(societyId, {
      code: 'BANK-A', bankName: 'Acceptance Bank', accountName: 'Society Account',
      maskedAccountNumber: '****1234', ledgerAccountId: bankLedgerId,
    }) as { id: string };
    bankAccountId = created.id;
  }, 20_000);

  afterAll(async () => {
    // No deletion of append-only finance evidence. CI destroys this database.
    await prisma.$disconnect();
  });

  it('commits source checksum, row manifest and transaction references as one immutable receipt', async () => {
    const checksum = digest('sample-bank-file-1');
    const input = { bankAccountId, sourceSha256: checksum, rows: [sourceRow('BATCH-1'), sourceRow('BATCH-2', 200)] };
    const first = await bank.importStatementBatch(societyId, userId, input) as {
      id: string; rowCount: number; newCount: number; sourceSha256: string;
      manifestSha256: string; rows: Array<{ transactionId: string; outcome: string }>;
    };
    expect(first).toMatchObject({ rowCount: 2, newCount: 2, sourceSha256: checksum });
    expect(first.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rows.map(row => row.outcome)).toEqual(['IMPORTED', 'IMPORTED']);
    const replay = await bank.importStatementBatch(societyId, userId, input) as { id: string };
    expect(replay.id).toBe(first.id);
    const listed = await bank.listImportBatches(societyId, bankAccountId) as Array<{ id: string }>;
    expect(listed.filter(row => row.id === first.id)).toHaveLength(1);
    const records = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total FROM "BankStatementTransaction"
      WHERE "societyId"=${societyId}::uuid AND "bankAccountId"=${bankAccountId}::uuid
        AND "externalKey" IN ('BATCH-1','BATCH-2')
    `);
    expect(records[0].total).toBe(2n);
    await expect(prisma.$executeRaw(Prisma.sql`
      UPDATE "BankStatementImportBatch" SET "newCount"=0 WHERE "id"=${first.id}::uuid
    `)).rejects.toThrow();
  }, 20_000);

  it('rejects checksum reuse with a changed row and leaves all prior evidence unchanged', async () => {
    const checksum = digest('sample-bank-file-1');
    await expect(bank.importStatementBatch(societyId, userId, {
      bankAccountId, sourceSha256: checksum,
      rows: [sourceRow('BATCH-1'), sourceRow('BATCH-2', 201)],
    })).rejects.toThrow('Source checksum was already used with different statement rows');
    const batches = await bank.listImportBatches(societyId, bankAccountId) as Array<{ sourceSha256: string }>;
    expect(batches.filter(row => row.sourceSha256 === checksum)).toHaveLength(1);
  }, 20_000);

  it('rejects duplicate keys within one file and conflicting historic remittance without partial import', async () => {
    await expect(bank.importStatementBatch(societyId, userId, {
      bankAccountId, sourceSha256: digest('duplicate-in-file'),
      rows: [sourceRow('SAME-KEY'), sourceRow('SAME-KEY')],
    })).rejects.toThrow('unique, nonblank');
    await expect(bank.importStatementBatch(societyId, userId, {
      bankAccountId, sourceSha256: digest('different-file-conflicting-row'),
      rows: [sourceRow('WOULD-BE-NEW'), sourceRow('BATCH-1', 9999)],
    })).rejects.toThrow('external key conflicts');
    const transactions = await bank.listTransactions(societyId, bankAccountId) as Array<{ externalKey: string }>;
    expect(transactions.some(row => row.externalKey === 'WOULD-BE-NEW')).toBe(false);
  }, 20_000);

  it('allows a distinct file to cite existing immutable transactions without double-import', async () => {
    const second = await bank.importStatementBatch(societyId, userId, {
      bankAccountId, sourceSha256: digest('second-file'),
      rows: [sourceRow('BATCH-1')],
    }) as { newCount: number; rows: Array<{ outcome: string }> };
    expect(second.newCount).toBe(0);
    expect(second.rows[0].outcome).toBe('ALREADY_IMPORTED');
  });

  it('serializes concurrent same-checksum submissions to a single receipt', async () => {
    const input = { bankAccountId, sourceSha256: digest('parallel-file'), rows: [sourceRow('CONCURRENT-ONE', 500)] };
    const [first, second] = await Promise.all([
      bank.importStatementBatch(societyId, userId, input),
      bank.importStatementBatch(societyId, userId, input),
    ]) as Array<{ id: string }>;
    expect(first.id).toBe(second.id);
    const evidence = await bank.listImportBatches(societyId, bankAccountId) as Array<{ id: string }>;
    expect(evidence.filter(row => row.id === first.id)).toHaveLength(1);
  }, 25_000);

  it('does not cross society scope or accept unsafe fractions as money', async () => {
    await expect(bank.importStatementBatch(otherSocietyId, userId, {
      bankAccountId, sourceSha256: digest('wrong-society'), rows: [sourceRow('WRONG-SOCIETY')],
    })).rejects.toThrow('Bank account is not available for this society');
    await expect(bank.importStatementBatch(societyId, userId, {
      bankAccountId, sourceSha256: digest('fraction'), rows: [sourceRow('FRACTION', 120.5)],
    })).rejects.toThrow('positive whole number of paise');
    const receipts = await bank.listImportBatches(otherSocietyId) as unknown[];
    expect(receipts).toHaveLength(0);
  }, 20_000);

  it('exports a posted balanced journal to reconcilable Tally CSV with immutable digest', async () => {
    const journalId = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "JournalEntry" ("id","societyId","periodId","entryNumber",
        "entryDate","description","sourceType","sourceId","externalReference","createdByUserId")
      VALUES (${journalId}::uuid,${societyId}::uuid,${periodId}::uuid,'JV-ACCEPT-1',
        '2026-10-10'::date,'October maintenance','BANK','BATCH-1','UTR-REVIEW-1',${userId}::uuid)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "JournalLine" ("societyId","entryId","accountId","debitPaise","creditPaise","description")
      VALUES (${societyId}::uuid,${journalId}::uuid,${bankLedgerId}::uuid,12345,0,'=UNTRUSTED-FORMULA'),
             (${societyId}::uuid,${journalId}::uuid,${incomeLedgerId}::uuid,0,12345,'October maintenance')
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "JournalEntry" SET "status"='POSTED',"postedAt"=CURRENT_TIMESTAMP,
        "postedByUserId"=${userId}::uuid
      WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid
    `);
    const job = await exports.create(societyId, userId, {
      idempotencyKey: randomUUID(), contractVersion: ACCOUNTING_EXPORT_CONTRACT_V1,
      format: 'TALLY_CSV', fromDate: '2026-10-10', toDate: '2026-10-10',
    }) as { id: string };
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "AccountingExportJob" SET "status"='PROCESSING'
      WHERE "societyId"=${societyId}::uuid AND "id"=${job.id}::uuid
    `);
    await exports.executeClaimed(await exports.get(societyId, job.id) as never);
    const artifact = await exports.artifact(societyId, job.id) as {
      sha256: string; content: string; byteLength: number; filename: string;
    };
    expect(artifact.filename).toContain('aaraagate-tally-journal');
    expect(artifact.sha256).toBe(digest(artifact.content));
    expect(artifact.byteLength).toBe(Buffer.byteLength(artifact.content, 'utf8'));
    // The fixed test fixture contains no embedded CSV commas/quoted quotes.
    const lines = artifact.content.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    const fields = lines.slice(1).map(line => line.split(',').map(cell => cell.slice(1, -1)));
    expect(fields.every(row => row[0] === '2026-10-10' && row[2] === 'JV-ACCEPT-1')).toBe(true);
    expect(fields.map(row => row[4])).toEqual(expect.arrayContaining(['123.45', '0.00']));
    expect(fields.map(row => row[5])).toEqual(expect.arrayContaining(['123.45', '0.00']));
    expect(fields.every(row => row[7] === 'UTR-REVIEW-1')).toBe(true);
    expect(fields.some(row => row[6] === "'=UNTRUSTED-FORMULA")).toBe(true);
    const sum = (column: number) => fields.reduce((amount, row) => {
      const [rupees, paise] = row[column].split('.');
      return amount + BigInt(rupees) * 100n + BigInt(paise);
    }, 0n);
    expect(sum(4)).toBe(12345n);
    expect(sum(5)).toBe(12345n);
  }, 25_000);
});
