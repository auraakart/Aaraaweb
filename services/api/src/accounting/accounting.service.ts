import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AccountInput = { code: string; name: string; type: string; parentAccountId?: string; description?: string };
type PeriodInput = { code: string; name: string; startsOn: string; endsOn: string };
type JournalLineInput = { accountId: string; fundId?: string; unitId?: string; description?: string; debitPaise: number; creditPaise: number };
type JournalInput = { periodId: string; entryNumber: string; entryDate: string; description: string; sourceType?: string; sourceId?: string; externalReference?: string; lines: JournalLineInput[] };
type ReverseInput = { entryNumber: string; entryDate: string; reason: string };
type JournalRow = { id: string; societyId: string; periodId: string; entryNumber: string; entryDate: Date; description: string; status: 'DRAFT' | 'POSTED' | 'REVERSED'; createdByUserId: string; postedByUserId: string | null; postedAt: Date | null };

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  listAccounts(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "code", "name", "type", "parentAccountId", "description", "active"
      FROM "LedgerAccount" WHERE "societyId" = ${societyId}::uuid ORDER BY "code"
    `);
  }

  async createAccount(societyId: string, input: AccountInput) {
    try {
      const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "LedgerAccount" ("societyId", "code", "name", "type", "parentAccountId", "description")
        VALUES (${societyId}::uuid, ${input.code.trim().toUpperCase()}, ${input.name.trim()}, ${input.type}::"LedgerAccountType", ${input.parentAccountId ?? null}::uuid, ${input.description?.trim() || null})
        RETURNING "id", "code", "name", "type", "parentAccountId", "description", "active"
      `);
      return rows[0];
    } catch (error) {
      this.rethrowKnownDatabaseError(error, 'Ledger account could not be created');
    }
  }

  listPeriods(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "code", "name", "startsOn", "endsOn", "status", "closedAt", "closedByUserId"
      FROM "AccountingPeriod" WHERE "societyId" = ${societyId}::uuid ORDER BY "startsOn" DESC
    `);
  }

  async createPeriod(societyId: string, input: PeriodInput) {
    const startsOn = new Date(`${input.startsOn}T00:00:00.000Z`);
    const endsOn = new Date(`${input.endsOn}T00:00:00.000Z`);
    if (startsOn > endsOn) throw new BadRequestException('Accounting period start must be on or before end');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${societyId}))`);
      const overlap = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "AccountingPeriod" WHERE "societyId" = ${societyId}::uuid
        AND daterange("startsOn", "endsOn", '[]') && daterange(${input.startsOn}::date, ${input.endsOn}::date, '[]') LIMIT 1
      `);
      if (overlap.length) throw new ConflictException('Accounting period overlaps an existing period');
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "AccountingPeriod" ("societyId", "code", "name", "startsOn", "endsOn")
        VALUES (${societyId}::uuid, ${input.code.trim().toUpperCase()}, ${input.name.trim()}, ${input.startsOn}::date, ${input.endsOn}::date)
        RETURNING "id", "code", "name", "startsOn", "endsOn", "status"
      `);
      return rows[0];
    }).catch((error) => this.rethrowKnownDatabaseError(error, 'Accounting period could not be created'));
  }

  listJournals(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT je."id", je."entryNumber", je."entryDate", je."description", je."status", je."sourceType", je."sourceId", je."externalReference", je."postedAt",
             COALESCE(SUM(jl."debitPaise"), 0)::text AS "debitPaise", COALESCE(SUM(jl."creditPaise"), 0)::text AS "creditPaise"
      FROM "JournalEntry" je
      LEFT JOIN "JournalLine" jl ON jl."entryId" = je."id" AND jl."societyId" = je."societyId"
      WHERE je."societyId" = ${societyId}::uuid
      GROUP BY je."id" ORDER BY je."entryDate" DESC, je."createdAt" DESC LIMIT 250
    `);
  }

  async createDraft(societyId: string, userId: string, input: JournalInput) {
    this.validateLines(input.lines);
    return this.prisma.$transaction(async (tx) => {
      const periods = await tx.$queryRaw<Array<{ id: string; startsOn: Date; endsOn: Date }>>(Prisma.sql`
        SELECT "id", "startsOn", "endsOn" FROM "AccountingPeriod"
        WHERE "id" = ${input.periodId}::uuid AND "societyId" = ${societyId}::uuid LIMIT 1
      `);
      if (!periods.length) throw new BadRequestException('Accounting period not found for this society');
      this.assertDateInsidePeriod(input.entryDate, periods[0].startsOn, periods[0].endsOn);
      const headers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "JournalEntry" ("societyId", "periodId", "entryNumber", "entryDate", "description", "sourceType", "sourceId", "externalReference", "createdByUserId")
        VALUES (${societyId}::uuid, ${input.periodId}::uuid, ${input.entryNumber.trim().toUpperCase()}, ${input.entryDate}::date, ${input.description.trim()}, ${input.sourceType?.trim() || null}, ${input.sourceId?.trim() || null}, ${input.externalReference?.trim() || null}, ${userId}::uuid)
        RETURNING "id"
      `);
      const journalId = headers[0].id;
      for (const line of input.lines) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "JournalLine" ("societyId", "entryId", "accountId", "fundId", "unitId", "description", "debitPaise", "creditPaise")
          VALUES (${societyId}::uuid, ${journalId}::uuid, ${line.accountId}::uuid, ${line.fundId ?? null}::uuid, ${line.unitId ?? null}::uuid, ${line.description?.trim() || null}, ${line.debitPaise}, ${line.creditPaise})
        `);
      }
      return this.getJournal(tx, societyId, journalId);
    }).catch((error) => this.rethrowKnownDatabaseError(error, 'Journal draft could not be created'));
  }

  async postJournal(societyId: string, userId: string, journalId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<JournalRow[]>(Prisma.sql`SELECT * FROM "JournalEntry" WHERE "id" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid FOR UPDATE`);
      const journal = rows[0];
      if (!journal) throw new NotFoundException('Journal not found');
      if (journal.status !== 'DRAFT') throw new ConflictException('Only draft journals can be posted');
      const periods = await tx.$queryRaw<Array<{ status: string; startsOn: Date; endsOn: Date }>>(Prisma.sql`
        SELECT "status", "startsOn", "endsOn" FROM "AccountingPeriod" WHERE "id" = ${journal.periodId}::uuid AND "societyId" = ${societyId}::uuid FOR UPDATE
      `);
      if (!periods.length || periods[0].status !== 'OPEN') throw new ConflictException('Accounting period is closed or unavailable');
      this.assertDateInsidePeriod(journal.entryDate.toISOString().slice(0, 10), periods[0].startsOn, periods[0].endsOn);
      const totals = await tx.$queryRaw<Array<{ lineCount: bigint; debit: bigint; credit: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS "lineCount", COALESCE(SUM("debitPaise"), 0) AS debit, COALESCE(SUM("creditPaise"), 0) AS credit
        FROM "JournalLine" WHERE "entryId" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid
      `);
      if (Number(totals[0].lineCount) < 2) throw new BadRequestException('A journal needs at least two lines');
      if (totals[0].debit !== totals[0].credit) throw new BadRequestException('Journal debits and credits must balance');
      await tx.$executeRaw(Prisma.sql`
        UPDATE "JournalEntry" SET "status" = 'POSTED', "postedByUserId" = ${userId}::uuid, "postedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = 'DRAFT'
      `);
      return this.getJournal(tx, societyId, journalId);
    });
  }

  async reverseJournal(societyId: string, userId: string, journalId: string, input: ReverseInput) {
    return this.prisma.$transaction(async (tx) => {
      const sourceRows = await tx.$queryRaw<JournalRow[]>(Prisma.sql`SELECT * FROM "JournalEntry" WHERE "id" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid FOR UPDATE`);
      const source = sourceRows[0];
      if (!source) throw new NotFoundException('Journal not found');
      if (source.status !== 'POSTED') throw new ConflictException('Only posted journals can be reversed');
      const periodRows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status" FROM "AccountingPeriod" WHERE "societyId" = ${societyId}::uuid AND ${input.entryDate}::date BETWEEN "startsOn" AND "endsOn" ORDER BY "startsOn" DESC LIMIT 1 FOR UPDATE
      `);
      if (!periodRows.length || periodRows[0].status !== 'OPEN') throw new ConflictException('Reversal date requires an open accounting period');
      const reversalRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "JournalEntry" ("societyId", "periodId", "entryNumber", "entryDate", "description", "sourceType", "sourceId", "createdByUserId", "reversalOfEntryId")
        VALUES (${societyId}::uuid, ${periodRows[0].id}::uuid, ${input.entryNumber.trim().toUpperCase()}, ${input.entryDate}::date, ${`Reversal: ${input.reason.trim()}`}, 'JOURNAL_REVERSAL', ${journalId}, ${userId}::uuid, ${journalId}::uuid)
        RETURNING "id"
      `);
      const reversalId = reversalRows[0].id;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "JournalLine" ("societyId", "entryId", "accountId", "fundId", "unitId", "description", "debitPaise", "creditPaise")
        SELECT "societyId", ${reversalId}::uuid, "accountId", "fundId", "unitId", "description", "creditPaise", "debitPaise"
        FROM "JournalLine" WHERE "entryId" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "JournalEntry" SET "status" = 'POSTED', "postedByUserId" = ${userId}::uuid, "postedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${reversalId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = 'DRAFT'
      `);
      await tx.$executeRaw(Prisma.sql`UPDATE "JournalEntry" SET "status" = 'REVERSED', "reversedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid`);
      return this.getJournal(tx, societyId, reversalId);
    }).catch((error) => this.rethrowKnownDatabaseError(error, 'Journal could not be reversed'));
  }

  private validateLines(lines: JournalLineInput[]) {
    if (!Array.isArray(lines) || lines.length < 2) throw new BadRequestException('A journal needs at least two lines');
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      const singleSided = (line.debitPaise > 0 && line.creditPaise === 0) || (line.creditPaise > 0 && line.debitPaise === 0);
      if (!singleSided) throw new BadRequestException('Each journal line must contain either a debit or a credit');
      debit += line.debitPaise;
      credit += line.creditPaise;
    }
    if (debit !== credit) throw new BadRequestException('Journal debits and credits must balance');
  }

  private assertDateInsidePeriod(entryDate: string, startsOn: Date, endsOn: Date) {
    const day = entryDate.slice(0, 10);
    const start = startsOn.toISOString().slice(0, 10);
    const end = endsOn.toISOString().slice(0, 10);
    if (day < start || day > end) throw new BadRequestException('Journal date must fall inside the accounting period');
  }

  private async getJournal(tx: Prisma.TransactionClient, societyId: string, journalId: string) {
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "id", "entryNumber", "entryDate", "description", "status", "periodId", "sourceType", "sourceId", "postedAt", "reversedAt", "reversalOfEntryId"
      FROM "JournalEntry" WHERE "id" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid
    `);
    return rows[0];
  }

  private rethrowKnownDatabaseError(error: unknown, fallback: string): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('unique') || message.includes('duplicate key')) throw new ConflictException('Accounting record already exists');
    if (message.includes('foreign key')) throw new BadRequestException('Referenced accounting resource does not belong to this society or does not exist');
    if (message.includes('Closed accounting period') || message.includes('immutable') || message.includes('balanced')) throw new ConflictException(message);
    throw new BadRequestException(fallback);
  }
}
