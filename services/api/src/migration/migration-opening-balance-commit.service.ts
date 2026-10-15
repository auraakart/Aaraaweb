import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { OpeningBalancesService, OpeningBalanceLineInput } from '../accounting/opening-balances.service';
import { PrismaService } from '../prisma/prisma.service';

type FinanceBatch = { id: string; status: string; totalRows: number };
type FinanceRow = {
  id: string;
  rowNumber: number;
  normalized: Record<string, string>;
  valid: boolean;
  targetId: string | null;
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
    const batch = await this.loadBatch(societyId, batchId);
    if (batch.status !== 'READY') throw new ConflictException('Only a READY opening-balance migration batch can be committed');

    const rows = await this.loadRows(batchId);
    if (rows.length !== batch.totalRows || rows.some((row) => !row.valid || row.targetId)) {
      throw new ConflictException('Opening-balance migration rows are not in a clean commit-ready state');
    }

    const input = await this.buildOpeningBalanceInput(societyId, batchId, rows);
    const applied = await this.openingBalances.apply(societyId, actorUserId, input);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const locked = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (locked.status === 'COMMITTED') {
        const committedRows = await this.loadRowsTx(tx, batchId);
        const ids = [...new Set(committedRows.map((row) => row.targetId).filter((id): id is string => !!id))];
        if (ids.length === 1 && ids[0] === applied.journalId) return locked;
        throw new ConflictException('Opening-balance migration batch is already committed with different evidence');
      }
      if (locked.status !== 'READY') throw new ConflictException('Opening-balance migration batch state changed before commit');

      await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchRow"
        SET "targetType"='JournalEntry',"targetId"=${applied.journalId}::uuid,"committedAt"=CURRENT_TIMESTAMP
        WHERE "batchId"=${batchId}::uuid
      `);
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='COMMITTED',"committedAt"=CURRENT_TIMESTAMP,
            "committedByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='OPENING_BALANCE'
        RETURNING *
      `);
      return { ...updated[0], journalId: applied.journalId, openingBalance: applied };
    });
  }

  async rollback(societyId: string, actorUserId: string, batchId: string) {
    const batch = await this.loadBatch(societyId, batchId);
    if (batch.status !== 'COMMITTED') {
      throw new ConflictException('Only a COMMITTED opening-balance migration batch can be rolled back');
    }
    const rows = await this.loadRows(batchId);
    const journalIds = [...new Set(rows.map((row) => row.targetId).filter((id): id is string => !!id))];
    if (!rows.length || rows.some((row) => !row.targetId) || journalIds.length !== 1) {
      throw new ConflictException('Opening-balance migration journal evidence is incomplete');
    }
    const journalId = journalIds[0];

    const journals = await this.prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status"::text AS "status" FROM "JournalEntry"
      WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid AND "sourceType"='OPENING_BALANCE'
      LIMIT 1
    `);
    if (!journals[0]) throw new NotFoundException('Opening-balance journal not found');

    if (journals[0].status === 'POSTED') {
      const reversalDate = await this.reversalDate(societyId);
      await this.accounting.reverseJournal(societyId, actorUserId, journalId, {
        entryNumber: this.reversalEntryNumber(batchId),
        entryDate: reversalDate,
        reason: `Rollback opening-balance migration ${batchId}`,
      });
    } else if (journals[0].status !== 'REVERSED') {
      throw new ConflictException('Opening-balance journal is not in a reversible state');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`);
      const locked = await this.loadBatchForUpdate(tx, societyId, batchId);
      if (locked.status === 'ROLLED_BACK') return locked;
      if (locked.status !== 'COMMITTED') throw new ConflictException('Opening-balance migration batch state changed before rollback');
      await tx.$executeRaw(Prisma.sql`
        UPDATE "MigrationBatchRow" SET "rolledBackAt"=CURRENT_TIMESTAMP
        WHERE "batchId"=${batchId}::uuid
      `);
      const updated = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "MigrationBatch"
        SET "status"='ROLLED_BACK',"rolledBackAt"=CURRENT_TIMESTAMP,
            "rolledBackByUserId"=${actorUserId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='OPENING_BALANCE'
        RETURNING *
      `);
      return updated[0];
    });
  }

  private async buildOpeningBalanceInput(societyId: string, batchId: string, rows: FinanceRow[]) {
    const dates = [...new Set(rows.map((row) => this.value(row.normalized, 'entry_date', 'cutover_date')).filter(Boolean))];
    if (dates.length !== 1) throw new BadRequestException('Opening-balance migration requires one shared entry_date');
    const entryDate = dates[0];

    const periods = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AccountingPeriod"
      WHERE "societyId"=${societyId}::uuid AND "status"='OPEN'
        AND ${entryDate}::date BETWEEN "startsOn" AND "endsOn"
      ORDER BY "startsOn" DESC LIMIT 2
    `);
    if (periods.length !== 1) throw new ConflictException('Opening-balance entry_date must resolve to exactly one open accounting period');

    const lines: OpeningBalanceLineInput[] = [];
    for (const row of rows) {
      const accountCode = this.value(row.normalized, 'account_code', 'ledger_code', 'account').toUpperCase();
      const accounts = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "LedgerAccount"
        WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND UPPER("code")=${accountCode}
        LIMIT 2
      `);
      if (accounts.length !== 1) throw new BadRequestException(`Opening-balance row ${row.rowNumber} account is unavailable`);

      const unitId = await this.resolveOptionalUnit(societyId, this.optional(row.normalized, 'unit_ref', 'unit', 'flat_number'));
      const fundId = await this.resolveOptionalFund(societyId, this.optional(row.normalized, 'fund_ref', 'fund'));
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

  private async resolveOptionalFund(societyId: string, rawRef: string | null) {
    if (!rawRef) return null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "AccountingFund"
      WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
        AND (LOWER("code")=LOWER(${rawRef}) OR LOWER("name")=LOWER(${rawRef}))
      LIMIT 2
    `);
    if (rows.length !== 1) throw new BadRequestException('Opening-balance fund reference must resolve to one active society fund');
    return rows[0].id;
  }

  private async resolveOptionalUnit(societyId: string, rawRef: string | null) {
    if (!rawRef) return null;
    const split = rawRef.trim().split(/[|/:]/).map((item) => item.trim()).filter(Boolean);
    const rows = split.length >= 2
      ? await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT u."id" FROM "Unit" u
          JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=u."societyId"
          WHERE u."societyId"=${societyId}::uuid
            AND LOWER(u."number")=LOWER(${split[split.length - 1]})
            AND (LOWER(b."code")=LOWER(${split[0]}) OR LOWER(b."name")=LOWER(${split[0]}))
          LIMIT 2
        `)
      : await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Unit"
          WHERE "societyId"=${societyId}::uuid AND LOWER("number")=LOWER(${rawRef})
          LIMIT 2
        `);
    if (rows.length !== 1) throw new BadRequestException('Opening-balance unit reference must resolve to one society unit');
    return rows[0].id;
  }

  private async reversalDate(societyId: string) {
    const periods = await this.prisma.$queryRaw<Array<{ startsOn: Date; endsOn: Date }>>(Prisma.sql`
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
      SELECT "id","status","totalRows" FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='OPENING_BALANCE'
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Opening-balance migration batch not found');
    return rows[0];
  }

  private async loadBatchForUpdate(tx: Prisma.TransactionClient, societyId: string, batchId: string) {
    const rows = await tx.$queryRaw<FinanceBatch[]>(Prisma.sql`
      SELECT "id","status","totalRows" FROM "MigrationBatch"
      WHERE "id"=${batchId}::uuid AND "societyId"=${societyId}::uuid AND "entityType"='OPENING_BALANCE'
      FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Opening-balance migration batch not found');
    return rows[0];
  }

  private loadRows(batchId: string) {
    return this.prisma.$queryRaw<FinanceRow[]>(Prisma.sql`
      SELECT "id","rowNumber","normalized","valid","targetId"
      FROM "MigrationBatchRow" WHERE "batchId"=${batchId}::uuid ORDER BY "rowNumber"
    `);
  }

  private loadRowsTx(tx: Prisma.TransactionClient, batchId: string) {
    return tx.$queryRaw<FinanceRow[]>(Prisma.sql`
      SELECT "id","rowNumber","normalized","valid","targetId"
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
