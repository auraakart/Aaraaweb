import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type OpeningBalanceLineInput = {
  accountId: string;
  fundId?: string;
  unitId?: string;
  description?: string;
  debitPaise: number;
  creditPaise: number;
};

export type ApplyOpeningBalanceInput = {
  batchKey: string;
  periodId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  externalReference?: string;
  lines: OpeningBalanceLineInput[];
};

type ExistingOpeningBalance = {
  id: string;
  entryNumber: string;
  entryDate: Date;
  status: string;
  externalReference: string | null;
};

@Injectable()
export class OpeningBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT je."id", je."sourceId" AS "batchKey", je."entryNumber", je."entryDate", je."description",
             je."externalReference", je."status", je."postedAt",
             COUNT(jl."id")::int AS "lineCount",
             COALESCE(SUM(jl."debitPaise"), 0)::text AS "debitPaise",
             COALESCE(SUM(jl."creditPaise"), 0)::text AS "creditPaise"
      FROM "JournalEntry" je
      LEFT JOIN "JournalLine" jl ON jl."entryId" = je."id" AND jl."societyId" = je."societyId"
      WHERE je."societyId" = ${societyId}::uuid AND je."sourceType" = 'OPENING_BALANCE'
      GROUP BY je."id"
      ORDER BY je."entryDate" DESC, je."createdAt" DESC
      LIMIT 100
    `);
  }

  async apply(societyId: string, userId: string, input: ApplyOpeningBalanceInput) {
    const normalized = this.normalize(input);
    const totals = this.validateLines(normalized.lines);
    const contentHash = this.contentHash(normalized);
    const storedReference = this.storedReference(normalized.externalReference, contentHash);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:opening-balances`}))`);

      const existing = await tx.$queryRaw<ExistingOpeningBalance[]>(Prisma.sql`
        SELECT "id", "entryNumber", "entryDate", "status"::text AS "status", "externalReference"
        FROM "JournalEntry"
        WHERE "societyId" = ${societyId}::uuid AND "sourceType" = 'OPENING_BALANCE' AND "sourceId" = ${normalized.batchKey}
        LIMIT 1 FOR UPDATE
      `);
      if (existing.length) {
        const priorHash = this.extractHash(existing[0].externalReference);
        if (priorHash !== contentHash || existing[0].status !== 'POSTED') {
          throw new ConflictException('Opening balance batch key already exists with different or non-posted content');
        }
        return {
          journalId: existing[0].id,
          batchKey: normalized.batchKey,
          entryNumber: existing[0].entryNumber,
          entryDate: existing[0].entryDate,
          lineCount: normalized.lines.length,
          debitPaise: String(totals.debit),
          creditPaise: String(totals.credit),
          contentHash,
          idempotent: true,
          status: existing[0].status,
        };
      }

      const periods = await tx.$queryRaw<Array<{ id: string; status: string; startsOn: Date; endsOn: Date }>>(Prisma.sql`
        SELECT "id", "status"::text AS "status", "startsOn", "endsOn"
        FROM "AccountingPeriod"
        WHERE "id" = ${normalized.periodId}::uuid AND "societyId" = ${societyId}::uuid
        LIMIT 1 FOR UPDATE
      `);
      const period = periods[0];
      if (!period) throw new BadRequestException('Accounting period not found for this society');
      if (period.status !== 'OPEN') throw new ConflictException('Opening balances require an open accounting period');
      this.assertDateInsidePeriod(normalized.entryDate, period.startsOn, period.endsOn);

      const priorOperational = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "JournalEntry"
        WHERE "societyId" = ${societyId}::uuid
          AND "status" IN ('POSTED', 'REVERSED')
          AND "sourceType" IS DISTINCT FROM 'OPENING_BALANCE'
          AND "entryDate" <= ${normalized.entryDate}::date
        LIMIT 1
      `);
      if (priorOperational.length) {
        throw new ConflictException('Opening balance cutover date must precede existing operational journals');
      }

      await this.assertReferences(tx, societyId, normalized.lines);

      const headers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "JournalEntry" (
          "societyId", "periodId", "entryNumber", "entryDate", "description", "sourceType", "sourceId",
          "externalReference", "createdByUserId"
        ) VALUES (
          ${societyId}::uuid, ${normalized.periodId}::uuid, ${normalized.entryNumber}, ${normalized.entryDate}::date,
          ${normalized.description}, 'OPENING_BALANCE', ${normalized.batchKey}, ${storedReference}, ${userId}::uuid
        ) RETURNING "id"
      `);
      const journalId = headers[0].id;

      for (const line of normalized.lines) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "JournalLine" (
            "societyId", "entryId", "accountId", "fundId", "unitId", "description", "debitPaise", "creditPaise"
          ) VALUES (
            ${societyId}::uuid, ${journalId}::uuid, ${line.accountId}::uuid, ${line.fundId ?? null}::uuid,
            ${line.unitId ?? null}::uuid, ${line.description ?? null}, ${line.debitPaise}, ${line.creditPaise}
          )
        `);
      }

      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "JournalEntry"
        SET "status" = 'POSTED', "postedByUserId" = ${userId}::uuid, "postedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${journalId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = 'DRAFT'
      `);
      if (updated !== 1) throw new ConflictException('Opening balance journal could not be posted');

      return {
        journalId,
        batchKey: normalized.batchKey,
        entryNumber: normalized.entryNumber,
        entryDate: normalized.entryDate,
        lineCount: normalized.lines.length,
        debitPaise: String(totals.debit),
        creditPaise: String(totals.credit),
        contentHash,
        idempotent: false,
        status: 'POSTED',
      };
    }).catch((error) => this.rethrow(error));
  }

  private normalize(input: ApplyOpeningBalanceInput): ApplyOpeningBalanceInput {
    return {
      batchKey: input.batchKey.trim(),
      periodId: input.periodId,
      entryNumber: input.entryNumber.trim().toUpperCase(),
      entryDate: input.entryDate.slice(0, 10),
      description: input.description.trim(),
      externalReference: input.externalReference?.trim() || undefined,
      lines: input.lines.map((line) => ({
        accountId: line.accountId,
        fundId: line.fundId || undefined,
        unitId: line.unitId || undefined,
        description: line.description?.trim() || undefined,
        debitPaise: line.debitPaise,
        creditPaise: line.creditPaise,
      })),
    };
  }

  private validateLines(lines: OpeningBalanceLineInput[]) {
    if (!Array.isArray(lines) || lines.length < 2) throw new BadRequestException('Opening balances require at least two journal lines');
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      if (!Number.isSafeInteger(line.debitPaise) || !Number.isSafeInteger(line.creditPaise) || line.debitPaise < 0 || line.creditPaise < 0) {
        throw new BadRequestException('Opening balance amounts must be non-negative integer paise values');
      }
      const singleSided = (line.debitPaise > 0 && line.creditPaise === 0) || (line.creditPaise > 0 && line.debitPaise === 0);
      if (!singleSided) throw new BadRequestException('Each opening balance line must contain either a debit or a credit');
      debit += line.debitPaise;
      credit += line.creditPaise;
      if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) throw new BadRequestException('Opening balance total exceeds supported precision');
    }
    if (debit !== credit) throw new BadRequestException('Opening balance debits and credits must balance');
    return { debit, credit };
  }

  private contentHash(input: ApplyOpeningBalanceInput) {
    const canonicalLines = [...input.lines]
      .map((line) => ({
        accountId: line.accountId,
        fundId: line.fundId ?? null,
        unitId: line.unitId ?? null,
        description: line.description ?? null,
        debitPaise: line.debitPaise,
        creditPaise: line.creditPaise,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const canonical = JSON.stringify({
      periodId: input.periodId,
      entryNumber: input.entryNumber,
      entryDate: input.entryDate,
      description: input.description,
      externalReference: input.externalReference ?? null,
      lines: canonicalLines,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private storedReference(sourceReference: string | undefined, hash: string) {
    return `${sourceReference ? `${sourceReference}|` : ''}sha256:${hash}`;
  }

  private extractHash(reference: string | null) {
    const match = reference?.match(/(?:^|\|)sha256:([a-f0-9]{64})$/);
    return match?.[1] ?? null;
  }

  private assertDateInsidePeriod(entryDate: string, startsOn: Date, endsOn: Date) {
    const start = startsOn.toISOString().slice(0, 10);
    const end = endsOn.toISOString().slice(0, 10);
    if (entryDate < start || entryDate > end) throw new BadRequestException('Opening balance date must fall inside the accounting period');
  }

  private async assertReferences(tx: Prisma.TransactionClient, societyId: string, lines: OpeningBalanceLineInput[]) {
    const accountIds = [...new Set(lines.map((line) => line.accountId))];
    const accountCount = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS count FROM "LedgerAccount"
      WHERE "societyId" = ${societyId}::uuid AND "active" = true AND "id"::text IN (${Prisma.join(accountIds)})
    `);
    if (Number(accountCount[0]?.count ?? 0n) !== accountIds.length) {
      throw new BadRequestException('One or more ledger accounts are unavailable for this society');
    }

    const unitIds = [...new Set(lines.flatMap((line) => line.unitId ? [line.unitId] : []))];
    if (unitIds.length) {
      const unitCount = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS count FROM "Unit"
        WHERE "societyId" = ${societyId}::uuid AND "id"::text IN (${Prisma.join(unitIds)})
      `);
      if (Number(unitCount[0]?.count ?? 0n) !== unitIds.length) throw new BadRequestException('One or more units are unavailable for this society');
    }

    const fundIds = [...new Set(lines.flatMap((line) => line.fundId ? [line.fundId] : []))];
    if (fundIds.length) {
      const fundCount = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS count FROM "AccountingFund"
        WHERE "societyId" = ${societyId}::uuid AND "id"::text IN (${Prisma.join(fundIds)})
      `);
      if (Number(fundCount[0]?.count ?? 0n) !== fundIds.length) throw new BadRequestException('One or more accounting funds are unavailable for this society');
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    const message = error instanceof Error ? error.message : '';
    if (code === '23505' || message.includes('duplicate key') || message.includes('unique')) throw new ConflictException('Opening balance record already exists');
    if (code === '23503' || code === '22P02' || message.includes('foreign key')) throw new BadRequestException('Opening balance contains an invalid society resource');
    if (message.includes('Closed accounting period') || message.includes('immutable') || message.includes('balanced')) throw new ConflictException(message);
    throw error;
  }
}
