import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { OpeningBalancesService, OpeningBalanceLineInput } from '../accounting/opening-balances.service';
import { PrismaService } from '../prisma/prisma.service';

type FinanceBatch = { id: string; status: string; totalRows: number; actorUserId: string };
type FinanceRow = {
  id: string;
  rowNumber: number;
  normalized: Record<string, string>;
  valid: boolean;
  targetId: string | null;
  targetType: string | null;
};

@Injectable()
export class MigrationOpeningBalanceCommitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openingBalances: OpeningBalancesService,
    private readonly accounting: AccountingService,
  ) {}

  supports(entityType: string) {
    return entityType === 'OPENING_BALANCE';
  }

  async commit(societyId: string, actorUserId: string, batchId: string) {
    // Journal posting and migration evidence commit must be one transaction.
    // Lock batch first; both a failed batch status update and a failed journal
    // post then roll back all financial and onboarding writes together.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const batch = await this.loadBatchForUpdate(tx, societyId, batchId);
      const rows = await this.loadRowsTx(tx, batchId);
      if (batch.status === 'COMMITTED') {
        const ids = [...new Set(rows.map((row) => row.targetId).filter((id): id is string => !!id))];
        if (rows.length !== batch.totalRows || rows.some((row) => !row.valid || !row.targetId || row.targetType !== 'JournalEntry') || ids.length !== 1) {
          throw new ConflictException('Opening-balance migration committed journal evidence is incomplete');
        }
        const recorded = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "JournalEntry"
          WHERE "id"=${ids[0]}::uuid AND "societyId"=${societyId}::uuid
            AND "sourceType"='OPENING_BALANCE' AND "sourceId"=${`migration:${batchId}`}
            AND "status"='POSTED'
          LIMIT 1
        `);
        if (recorded.length !== 1) throw new ConflictException('Opening-balance migration committed journal evidence is incomplete');
        return { ...batch, journalId: ids[0] };
      }
      if (batch.status !== 'READY') {
        throw new ConflictException('Only a READY opening-balance migration batch can be committed');
      }
      if (rows.length !== batch.totalRows || rows.some((row) => !row.valid || row.targetId)) {
        throw new ConflictException('Opening-balance migration rows are not in a clean commit-ready state');
      }
      const input = await this.buildOpeningBalanceInput(societyId, batchId, rows, tx);
      const applied = await this.openingBalances.applyWithinTransaction(tx, societyId, actorUserId, input);

      // An old two-transaction crash may leave a POSTED journal with READY batch
      // rows. Matching the content digest alone is insufficient authorization
      // to adopt its immutable finance evidence as this batch's commit.
      if (applied.idempotent) {
        const debits = input.lines.reduce((sum, line) => sum + line.debitPaise, 0);
        const credits = input.lines.reduce((sum, line) => sum + line.creditPaise, 0);
        const trusted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT j."id" FROM "JournalEntry" j
          JOIN "AccountingPeriod" p
            ON p."id"=j."periodId" AND p."societyId"=j."societyId"
          WHERE j."id"=${applied.journalId}::uuid AND j."societyId"=${societyId}::uuid
            AND j."sourceType"='OPENING_BALANCE' AND j."sourceId"=${`migration:${batchId}`}
            AND j."status"='POSTED' AND j."postedAt" IS NOT NULL
            AND j."createdByUserId"=${batch.actorUserId}::uuid
            AND j."postedByUserId"=${batch.actorUserId}::uuid
            AND j."periodId"=${input.periodId}::uuid
            AND j."entryNumber"=${input.entryNumber} AND j."entryDate"=${input.entryDate}::date
            AND (SELECT COUNT(*) FROM "JournalLine" l
                 WHERE l."entryId"=j."id" AND l."societyId"=j."societyId")=${batch.totalRows}::bigint
            AND (SELECT COALESCE(SUM(l."debitPaise"), 0) FROM "JournalLine" l
                 WHERE l."entryId"=j."id" AND l."societyId"=j."societyId")=${debits}::bigint
            AND (SELECT COALESCE(SUM(l."creditPaise"), 0) FROM "JournalLine" l
                 WHERE l."entryId"=j."id" AND l."societyId"=j."societyId")=${credits}::bigint
          FOR UPDATE OF j
        `);
        if (trusted.length !== 1) {
          throw new ConflictException('Historical opening-balance migration journal provenance is incomplete');
        }
      }

      const count = await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchRow"
        SET "targetType"='JournalEntry',"targetId"=${applied.journalId}::uuid,"committedAt"=CURRENT_TIMESTAMP
        WHERE "batchId"=${batchId}::uuid
      `);
      if (count !== batch.totalRows) throw new ConflictException('Opening-balance migration row state changed during commit');
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='COMMITTED',"committedAt"=CURRENT_TIMESTAMP,
            "committedByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid
          AND "entityType"='OPENING_BALANCE' AND "status"='READY'
        RETURNING *
      `);
      if (!updated[0]) throw new ConflictException('Opening-balance migration status update failed');
      return { ...updated[0], journalId: applied.journalId, openingBalance: applied };
    });
  }

  async rollback(societyId: string, actorUserId: string, batchId: string) {
    // Lock the batch before reading its evidence, then reverse the journal
    // and record the batch transition in the SAME transaction. A failure
    // in either half rolls both back.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const batch = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (batch.status === 'ROLLED_BACK') return batch;
      if (batch.status !== 'COMMITTED') {
        throw new ConflictException('Only a COMMITTED opening-balance migration batch can be rolled back');
      }
      const rows = await this.loadRowsTx(tx, batchId);
      const journalIds = [...new Set(rows.map((row) => row.targetId).filter((id): id is string => !!id))];
      if (rows.length !== batch.totalRows || rows.some((row) => !row.valid || !row.targetId || row.targetType !== 'JournalEntry') || journalIds.length !== 1) {
        throw new ConflictException('Opening-balance migration journal evidence is incomplete');
      }
      const journalId = journalIds[0];
      const journals = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT "status"::text AS "status" FROM "JournalEntry"
        WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid AND "sourceType"='OPENING_BALANCE' AND "sourceId"=${`migration:${batchId}`}
        LIMIT 1 FOR UPDATE
      `);
      if (!journals[0]) throw new NotFoundException('Opening-balance journal not found');

      if (journals[0].status === 'POSTED') {
        const reversalDate = await this.reversalDate(societyId, tx);
        await this.accounting.reverseJournalWithinTransaction(tx, societyId, actorUserId, journalId, {
          entryNumber: this.reversalEntryNumber(batchId),
          entryDate: reversalDate,
          reason: `Rollback opening-balance migration ${batchId}`,
        });
      } else if (journals[0].status === 'REVERSED') {
        // Legacy partial rollbacks may leave a reversed journal and a COMMITTED
        // batch. Only an identifiable migration-specific reversal can be
        // recovered; an unrelated finance reversal is not rollback evidence.
        const reversals = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "JournalEntry"
          WHERE "societyId"=${societyId}::uuid
            AND "reversalOfEntryId"=${journalId}::uuid
            AND "sourceType"='JOURNAL_REVERSAL' AND "sourceId"=${journalId}
            AND "entryNumber"=${this.reversalEntryNumber(batchId)}
            AND "description"=${`Reversal: Rollback opening-balance migration ${batchId}`}
            AND "status"='POSTED'
          LIMIT 1
        `);
        if (reversals.length !== 1) {
          throw new ConflictException('Opening-balance migration reversal evidence is incomplete');
        }
      } else {
        throw new ConflictException('Opening-balance journal is not in a reversible state');
      }

      const updatedRows = await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchRow" SET "rolledBackAt"=CURRENT_TIMESTAMP
        WHERE "batchId"=${batchId}::uuid
      `);
      if (updatedRows !== batch.totalRows) {
        throw new ConflictException('Opening-balance migration row state changed during rollback');
      }
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='ROLLED_BACK',"rolledBackAt"=CURRENT_TIMESTAMP,
            "rolledBackByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='OPENING_BALANCE'
        RETURNING *
      `);
      if (!updated[0]) throw new ConflictException('Opening-balance rollback state update failed');
      return updated[0];
    });
  }

  private async buildOpeningBalanceInput(societyId: string, batchId: string, rows: FinanceRow[], tx: Prisma.TransactionClient) {
    const dates = [...new Set(rows.map((row) => this.value(row.normalized, 'entry_date', 'cutover_date')).filter(Boolean))];
    if (dates.length !== 1) throw new BadRequestException('Opening-balance migration requires one shared entry_date');
    const entryDate = dates[0];

    const periods = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AccountingPeriod"
      WHERE "societyId"=${societyId}::uuid AND "status"='OPEN'
        AND ${entryDate}::date BETWEEN "startsOn" AND "endsOn"
      ORDER BY "startsOn" DESC LIMIT 2
    `);
    if (periods.length !== 1) throw new ConflictException('Opening-balance entry_date must resolve to exactly one open accounting period');

    const lines: OpeningBalanceLineInput[] = [];
    for (const row of rows) {
      const accountCode = this.value(row.normalized, 'account_code', 'ledger_code', 'account').toUpperCase();
      const accounts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "LedgerAccount"
        WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND UPPER("code")=${accountCode}
        LIMIT 2
      `);
      if (accounts.length !== 1) throw new BadRequestException(`Opening-balance row ${row.rowNumber} account is unavailable`);

      const unitId = await this.resolveOptionalUnit(societyId, this.optional(row.normalized, 'unit_ref', 'unit', 'flat_number'), tx);
      const fundId = await this.resolveOptionalFund(societyId, this.optional(row.normalized, 'fund_ref', 'fund'), tx);
      const amount = Number(this.value(row.normalized, 'amount_paise', 'amount'));
      const side = this.value(row.normalized, 'side', 'debit_credit').toUpperCase();
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('Opening-balance amounts must be positive integer paise values');
      if (!['DEBIT', 'CREDIT'].includes(side)) throw new BadRequestException('Opening-balance side must be DEBIT or CREDIT');

      lines.push({
        accountId: accounts[0].id,
        unitId: unitId ?? undefined,
        fundId: fundId ?? undefined,
        description: this.optional(row.normalized, 'description') ?? undefined,
        debitPaise: side === 'DEBIT' ? amount : 0,
        creditPaise: side === 'CREDIT' ? amount : 0,
      });
    }

    return {
      batchKey: `migration:${batchId}`,
      periodId: periods[0].id,
      entryNumber: this.entryNumber(batchId),
      entryDate,
      description: `Opening balances migrated from batch ${batchId}`,
      externalReference: `migration-batch:${batchId}`,
      lines,
    };
  }

  private async resolveOptionalFund(societyId: string, rawRef: string | null, tx: Prisma.TransactionClient) {
    if (!rawRef) return null;
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AccountingFund"
      WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
        AND (LOWER("code")=LOWER(${rawRef}) OR LOWER("name")=LOWER(${rawRef}))
      LIMIT 2
    `);
    if (rows.length !== 1) throw new BadRequestException('Opening-balance fund reference must resolve to one active society fund');
    return rows[0].id;
  }

  private async resolveOptionalUnit(societyId: string, rawRef: string | null, tx: Prisma.TransactionClient) {
    if (!rawRef) return null;
    const split = rawRef.trim().split(/[|/:]/).map((item) => item.trim()).filter(Boolean);
    const rows = split.length >= 2
      ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT u."id" FROM "Unit" u
          JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=u."societyId"
          WHERE u."societyId"=${societyId}::uuid
            AND LOWER(u."number")=LOWER(${split[split.length - 1]})
            AND (LOWER(b."code")=LOWER(${split[0]}) OR LOWER(b."name")=LOWER(${split[0]}))
          LIMIT 2
        `)
      : await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Unit"
          WHERE "societyId"=${societyId}::uuid AND LOWER("number")=LOWER(${rawRef})
          LIMIT 2
        `);
    if (rows.length !== 1) throw new BadRequestException('Opening-balance unit reference must resolve to one society unit');
    return rows[0].id;
  }

  private async reversalDate(societyId: string, tx: Prisma.TransactionClient) {
    const periods = await tx.$queryRaw<Array<{ startsOn: Date; endsOn: Date }>>(Prisma.sql`
      SELECT "startsOn","endsOn" FROM "AccountingPeriod"
      WHERE "societyId"=${societyId}::uuid AND "status"='OPEN'
      ORDER BY "startsOn" DESC LIMIT 1
    `);
    if (!periods[0]) throw new ConflictException('Opening-balance rollback requires an open accounting period');
    const today = new Date().toISOString().slice(0, 10);
    const start = periods[0].startsOn.toISOString().slice(0, 10);
    const end = periods[0].endsOn.toISOString().slice(0, 10);
    return today >= start && today <= end ? today : start;
  }

  private async loadBatch(societyId: string, batchId: string) {
    const rows = await this.prisma.$queryRaw<FinanceBatch[]>(Prisma.sql`
      SELECT "id","status","totalRows","actorUserId" FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='OPENING_BALANCE'
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Opening-balance migration batch not found');
    return rows[0];
  }

  private async loadBatchForUpdate(tx: Prisma.TransactionClient, societyId: string, batchId: string) {
    const rows = await tx.$queryRaw<FinanceBatch[]>(Prisma.sql`
      SELECT "id","status","totalRows","actorUserId" FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='OPENING_BALANCE'
      FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Opening-balance migration batch not found');
    return rows[0];
  }

  private loadRows(batchId: string) {
    return this.prisma.$queryRaw<FinanceRow[]>(Prisma.sql`
      SELECT "id","rowNumber","normalized","valid","targetId","targetType"
      FROM "MigrationBatchRow" WHERE "batchId"=${batchId}::uuid ORDER BY "rowNumber"
    `);
  }

  private loadRowsTx(tx: Prisma.TransactionClient, batchId: string) {
    return tx.$queryRaw<FinanceRow[]>(Prisma.sql`
      SELECT "id","rowNumber","normalized","valid","targetId","targetType"
      FROM "MigrationBatchRow" WHERE "batchId"=${batchId}::uuid ORDER BY "rowNumber"
    `);
  }

  private entryNumber(batchId: string) {
    return `MIG-OB-${batchId.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
  }

  private reversalEntryNumber(batchId: string) {
    return `MIG-RV-${batchId.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
  }

  private value(row: Record<string, string>, ...keys: string[]) {
    return keys.map((key) => row[key]).find((item) => item?.trim())?.trim() ?? '';
  }

  private optional(row: Record<string, string>, ...keys: string[]) {
    return this.value(row, ...keys) || null;
  }
}
