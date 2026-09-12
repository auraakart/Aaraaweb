import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type LateFeeRunInput = {
  asOfDate: string;
  entryDate: string;
  idempotencyKey: string;
  journalPrefix: string;
};

type Candidate = {
  receivableId: string;
  chargeRuleId: string;
  unitId: string;
  receivableAccountId: string;
  incomeAccountId: string;
  fundId: string | null;
  receivableNumber: string;
  lateFeeMode: 'FIXED' | 'PERCENTAGE';
  lateFeeFixedPaise: bigint | null;
  lateFeeBasisPoints: number | null;
  baseOutstandingPaise: bigint;
};

@Injectable()
export class LateFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(societyId: string, asOfDate: string) {
    const candidates = await this.loadCandidates(this.prisma, societyId, asOfDate);
    return {
      asOfDate,
      count: candidates.length,
      totalFeePaise: candidates.reduce((sum, row) => sum + this.calculateFee(row), 0n).toString(),
      assessments: candidates.map((row) => ({
        receivableId: row.receivableId,
        receivableNumber: row.receivableNumber,
        baseOutstandingPaise: row.baseOutstandingPaise.toString(),
        feePaise: this.calculateFee(row).toString(),
        lateFeeMode: row.lateFeeMode,
      })),
    };
  }

  async apply(societyId: string, userId: string, input: LateFeeRunInput) {
    const key = input.idempotencyKey.trim();
    const prefix = input.journalPrefix.trim().toUpperCase();
    if (!key) throw new BadRequestException('Idempotency key is required');
    if (!prefix) throw new BadRequestException('Journal prefix is required');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status" FROM "LateFeeBatch"
        WHERE "societyId" = ${societyId}::uuid AND "idempotencyKey" = ${key}
        LIMIT 1 FOR UPDATE
      `);
      if (existing.length) return this.getBatch(tx, societyId, existing[0].id);

      const periods = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status" FROM "AccountingPeriod"
        WHERE "societyId" = ${societyId}::uuid AND ${input.entryDate}::date BETWEEN "startsOn" AND "endsOn"
        ORDER BY "startsOn" DESC LIMIT 1 FOR UPDATE
      `);
      if (!periods.length || periods[0].status !== 'OPEN') {
        throw new ConflictException('Late-fee posting date requires an open accounting period');
      }

      const batchRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "LateFeeBatch" ("societyId", "asOfDate", "idempotencyKey", "status", "createdByUserId")
        VALUES (${societyId}::uuid, ${input.asOfDate}::date, ${key}, 'PREVIEWED', ${userId}::uuid)
        RETURNING "id"
      `);
      const batchId = batchRows[0].id;
      const candidates = await this.loadCandidates(tx, societyId, input.asOfDate);

      let sequence = 1;
      for (const row of candidates) {
        const fee = this.calculateFee(row);
        if (fee <= 0n) continue;
        const journalNumber = `${prefix}-${String(sequence).padStart(4, '0')}`;
        sequence += 1;

        const journalRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "JournalEntry" (
            "societyId", "periodId", "entryNumber", "entryDate", "description", "status",
            "sourceType", "sourceId", "createdByUserId", "postedByUserId", "postedAt"
          ) VALUES (
            ${societyId}::uuid, ${periods[0].id}::uuid, ${journalNumber}, ${input.entryDate}::date,
            ${`Late fee for ${row.receivableNumber}`}, 'POSTED', 'LATE_FEE', ${`${batchId}:${row.receivableId}`},
            ${userId}::uuid, ${userId}::uuid, CURRENT_TIMESTAMP
          ) RETURNING "id"
        `);
        const journalId = journalRows[0].id;

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "JournalLine" (
            "societyId", "entryId", "accountId", "fundId", "unitId", "description", "debitPaise", "creditPaise"
          ) VALUES
            (${societyId}::uuid, ${journalId}::uuid, ${row.receivableAccountId}::uuid, ${row.fundId}::uuid,
             ${row.unitId}::uuid, 'Late fee', ${fee}, 0),
            (${societyId}::uuid, ${journalId}::uuid, ${row.incomeAccountId}::uuid, ${row.fundId}::uuid,
             ${row.unitId}::uuid, 'Late fee', 0, ${fee})
        `);

        const adjustmentRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "ReceivableAdjustment" (
            "societyId", "receivableId", "type", "amountPaise", "reason", "journalEntryId", "createdByUserId"
          ) VALUES (
            ${societyId}::uuid, ${row.receivableId}::uuid, 'DEBIT', ${fee},
            ${`Late fee assessed as of ${input.asOfDate}`}, ${journalId}::uuid, ${userId}::uuid
          ) RETURNING "id"
        `);

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "LateFeeAssessment" (
            "societyId", "batchId", "receivableId", "chargeRuleId", "asOfDate",
            "baseOutstandingPaise", "feePaise", "adjustmentId", "journalEntryId"
          ) VALUES (
            ${societyId}::uuid, ${batchId}::uuid, ${row.receivableId}::uuid, ${row.chargeRuleId}::uuid,
            ${input.asOfDate}::date, ${row.baseOutstandingPaise}, ${fee}, ${adjustmentRows[0].id}::uuid, ${journalId}::uuid
          )
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "LateFeeBatch" SET "status" = 'APPLIED', "appliedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${batchId}::uuid AND "societyId" = ${societyId}::uuid
      `);
      return this.getBatch(tx, societyId, batchId);
    }).catch((error) => this.rethrow(error));
  }

  listBatches(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT b."id", b."asOfDate", b."idempotencyKey", b."status", b."createdByUserId", b."createdAt", b."appliedAt",
             COUNT(a."id")::int AS "assessmentCount", COALESCE(SUM(a."feePaise"), 0)::text AS "totalFeePaise"
      FROM "LateFeeBatch" b
      LEFT JOIN "LateFeeAssessment" a ON a."batchId" = b."id" AND a."societyId" = b."societyId"
      WHERE b."societyId" = ${societyId}::uuid
      GROUP BY b."id" ORDER BY b."createdAt" DESC LIMIT 100
    `);
  }

  unappliedCashSummary(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*)::int AS "paymentCount",
             COALESCE(SUM(p."amountPaise" - COALESCE(a."allocatedPaise", 0)), 0)::text AS "unappliedPaise"
      FROM "Payment" p
      LEFT JOIN (
        SELECT "paymentId", "societyId", SUM("amountPaise")::bigint AS "allocatedPaise"
        FROM "ReceivableAllocation" GROUP BY "paymentId", "societyId"
      ) a ON a."paymentId" = p."id" AND a."societyId" = p."societyId"
      WHERE p."societyId" = ${societyId}::uuid AND p."status" = 'CAPTURED'
        AND p."amountPaise" - COALESCE(a."allocatedPaise", 0) > 0
    `);
  }

  private async loadCandidates(
    db: PrismaService | Prisma.TransactionClient,
    societyId: string,
    asOfDate: string,
  ): Promise<Candidate[]> {
    return db.$queryRaw<Candidate[]>(Prisma.sql`
      WITH balances AS (
        SELECT r."id" AS "receivableId", r."chargeRuleId", r."unitId", r."receivableNumber", r."dueDate", r."status",
               cr."receivableAccountId", cr."incomeAccountId", cr."fundId", cr."lateFeeMode",
               cr."lateFeeFixedPaise", cr."lateFeeBasisPoints", cr."graceDays",
               (
                 r."amountPaise"
                 + COALESCE((SELECT SUM(CASE WHEN ra."type" = 'DEBIT' THEN ra."amountPaise" ELSE -ra."amountPaise" END)
                             FROM "ReceivableAdjustment" ra WHERE ra."societyId" = r."societyId" AND ra."receivableId" = r."id"), 0)
                 - COALESCE((SELECT SUM(x."amountPaise") FROM "ReceivableAllocation" x
                             WHERE x."societyId" = r."societyId" AND x."receivableId" = r."id"), 0)
                 - COALESCE((SELECT SUM(lfa."feePaise") FROM "LateFeeAssessment" lfa
                             WHERE lfa."societyId" = r."societyId" AND lfa."receivableId" = r."id"), 0)
               )::bigint AS "baseOutstandingPaise"
        FROM "Receivable" r
        JOIN "ChargeRule" cr ON cr."id" = r."chargeRuleId" AND cr."societyId" = r."societyId"
        WHERE r."societyId" = ${societyId}::uuid AND r."status" <> 'VOID' AND cr."lateFeeMode" <> 'NONE'
          AND r."dueDate" + cr."graceDays" <= ${asOfDate}::date
      )
      SELECT b."receivableId", b."chargeRuleId", b."unitId", b."receivableNumber", b."receivableAccountId",
             b."incomeAccountId", b."fundId", b."lateFeeMode", b."lateFeeFixedPaise", b."lateFeeBasisPoints",
             b."baseOutstandingPaise"
      FROM balances b
      WHERE b."baseOutstandingPaise" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "LateFeeAssessment" e
          WHERE e."societyId" = ${societyId}::uuid AND e."receivableId" = b."receivableId" AND e."asOfDate" = ${asOfDate}::date
        )
      ORDER BY b."receivableId"
    `);
  }

  private calculateFee(row: Candidate): bigint {
    if (row.lateFeeMode === 'FIXED') return row.lateFeeFixedPaise ?? 0n;
    const bps = BigInt(row.lateFeeBasisPoints ?? 0);
    return (row.baseOutstandingPaise * bps + 5000n) / 10000n;
  }

  private async getBatch(tx: Prisma.TransactionClient, societyId: string, batchId: string) {
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT b."id", b."asOfDate", b."idempotencyKey", b."status", b."createdAt", b."appliedAt",
             COUNT(a."id")::int AS "assessmentCount", COALESCE(SUM(a."feePaise"), 0)::text AS "totalFeePaise"
      FROM "LateFeeBatch" b
      LEFT JOIN "LateFeeAssessment" a ON a."batchId" = b."id" AND a."societyId" = b."societyId"
      WHERE b."societyId" = ${societyId}::uuid AND b."id" = ${batchId}::uuid
      GROUP BY b."id"
    `);
    return rows[0];
  }

  private rethrow(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('unique') || message.includes('duplicate key')) throw new ConflictException('Late-fee batch or assessment already exists');
    if (message.includes('foreign key')) throw new BadRequestException('Late-fee reference does not belong to this society or does not exist');
    throw new BadRequestException('Late-fee operation could not be completed');
  }
}
