import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ChargeRuleInput = {
  code: string;
  name: string;
  description?: string;
  frequency: string;
  amountPaise: number;
  receivableAccountId: string;
  incomeAccountId: string;
  fundId?: string;
  dueDay?: number;
  lateFeeMode: string;
  lateFeeFixedPaise?: number;
  lateFeeBasisPoints?: number;
  graceDays: number;
  effectiveFrom: string;
  effectiveUntil?: string;
};

type IssueInput = {
  chargeRuleId: string;
  unitId: string;
  billingPeriod: string;
  entryDate: string;
  dueDate: string;
  receivableNumber: string;
  journalEntryNumber: string;
  description?: string;
  sourceId?: string;
};

type AdjustmentInput = {
  type: 'DEBIT' | 'CREDIT' | 'WAIVER';
  amountPaise: number;
  reason: string;
  entryDate: string;
  journalEntryNumber: string;
};

type RuleRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  frequency: string;
  amountPaise: bigint;
  receivableAccountId: string;
  incomeAccountId: string;
  fundId: string | null;
  dueDay: number | null;
  lateFeeMode: string;
  lateFeeFixedPaise: bigint | null;
  lateFeeBasisPoints: number | null;
  graceDays: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
};

@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  listChargeRules(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "code", "name", "description", "frequency",
             "amountPaise"::text AS "amountPaise", "receivableAccountId", "incomeAccountId", "fundId",
             "dueDay", "lateFeeMode", "lateFeeFixedPaise"::text AS "lateFeeFixedPaise",
             "lateFeeBasisPoints", "graceDays", "effectiveFrom", "effectiveUntil", "active"
      FROM "ChargeRule"
      WHERE "societyId" = ${societyId}::uuid
      ORDER BY "code"
    `);
  }

  async createChargeRule(societyId: string, input: ChargeRuleInput) {
    this.validateChargeRule(input);
    try {
      const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "ChargeRule" (
          "societyId", "code", "name", "description", "frequency", "amountPaise",
          "receivableAccountId", "incomeAccountId", "fundId", "dueDay", "lateFeeMode",
          "lateFeeFixedPaise", "lateFeeBasisPoints", "graceDays", "effectiveFrom", "effectiveUntil"
        ) VALUES (
          ${societyId}::uuid, ${input.code.trim().toUpperCase()}, ${input.name.trim()}, ${input.description?.trim() || null},
          ${input.frequency}::"ChargeFrequency", ${input.amountPaise}, ${input.receivableAccountId}::uuid,
          ${input.incomeAccountId}::uuid, ${input.fundId ?? null}::uuid, ${input.dueDay ?? null},
          ${input.lateFeeMode}::"LateFeeMode", ${input.lateFeeFixedPaise ?? null}, ${input.lateFeeBasisPoints ?? null},
          ${input.graceDays}, ${input.effectiveFrom}::date, ${input.effectiveUntil ?? null}::date
        )
        RETURNING "id", "code", "name", "frequency", "amountPaise"::text AS "amountPaise", "active"
      `);
      return rows[0];
    } catch (error) {
      this.rethrowKnownDatabaseError(error, 'Charge rule could not be created');
    }
  }

  async previewIssue(societyId: string, input: IssueInput) {
    const rule = await this.getRule(societyId, input.chargeRuleId);
    await this.assertUnit(societyId, input.unitId);
    this.assertRuleEffective(rule, input.entryDate);
    this.assertDueDate(input.entryDate, input.dueDate);
    const duplicate = await this.findExistingSource(societyId, input.chargeRuleId, input.unitId, input.billingPeriod);
    return {
      duplicate: Boolean(duplicate),
      existingReceivableId: duplicate?.id ?? null,
      receivableNumber: input.receivableNumber.trim().toUpperCase(),
      billingPeriod: input.billingPeriod.trim(),
      entryDate: input.entryDate,
      dueDate: input.dueDate,
      amountPaise: rule.amountPaise.toString(),
      receivableAccountId: rule.receivableAccountId,
      incomeAccountId: rule.incomeAccountId,
      fundId: rule.fundId,
      description: input.description?.trim() || rule.name,
    };
  }

  async issue(societyId: string, userId: string, input: IssueInput) {
    return this.prisma.$transaction(async (tx) => {
      const rules = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
        SELECT * FROM "ChargeRule"
        WHERE "id" = ${input.chargeRuleId}::uuid AND "societyId" = ${societyId}::uuid AND "active" = true
        FOR UPDATE
      `);
      const rule = rules[0];
      if (!rule) throw new NotFoundException('Charge rule not found');
      this.assertRuleEffective(rule, input.entryDate);
      this.assertDueDate(input.entryDate, input.dueDate);

      const units = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Unit" WHERE "id" = ${input.unitId}::uuid AND "societyId" = ${societyId}::uuid LIMIT 1
      `);
      if (!units.length) throw new BadRequestException('Unit does not belong to this society');

      const sourceId = input.sourceId?.trim() || `${rule.id}:${input.unitId}:${input.billingPeriod.trim()}`;
      const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Receivable"
        WHERE "societyId" = ${societyId}::uuid AND "sourceType" = 'CHARGE_RULE' AND "sourceId" = ${sourceId}
        LIMIT 1
      `);
      if (existing.length) throw new ConflictException('Receivable already exists for this charge source');

      const periods = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status" FROM "AccountingPeriod"
        WHERE "societyId" = ${societyId}::uuid AND ${input.entryDate}::date BETWEEN "startsOn" AND "endsOn"
        ORDER BY "startsOn" DESC LIMIT 1 FOR UPDATE
      `);
      if (!periods.length || periods[0].status !== 'OPEN') {
        throw new ConflictException('Charge date requires an open accounting period');
      }

      const journalRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "JournalEntry" (
          "societyId", "periodId", "entryNumber", "entryDate", "description", "status",
          "sourceType", "sourceId", "createdByUserId", "postedByUserId", "postedAt"
        ) VALUES (
          ${societyId}::uuid, ${periods[0].id}::uuid, ${input.journalEntryNumber.trim().toUpperCase()},
          ${input.entryDate}::date, ${input.description?.trim() || rule.name}, 'POSTED', 'RECEIVABLE_CHARGE', ${sourceId},
          ${userId}::uuid, ${userId}::uuid, CURRENT_TIMESTAMP
        ) RETURNING "id"
      `);
      const journalId = journalRows[0].id;

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "JournalLine" (
          "societyId", "entryId", "accountId", "fundId", "unitId", "description", "debitPaise", "creditPaise"
        ) VALUES
          (${societyId}::uuid, ${journalId}::uuid, ${rule.receivableAccountId}::uuid, ${rule.fundId}::uuid,
           ${input.unitId}::uuid, ${input.description?.trim() || rule.name}, ${rule.amountPaise}, 0),
          (${societyId}::uuid, ${journalId}::uuid, ${rule.incomeAccountId}::uuid, ${rule.fundId}::uuid,
           ${input.unitId}::uuid, ${input.description?.trim() || rule.name}, 0, ${rule.amountPaise})
      `);

      const receivables = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "Receivable" (
          "societyId", "unitId", "chargeRuleId", "receivableNumber", "billingPeriod", "description",
          "amountPaise", "dueDate", "journalEntryId", "sourceType", "sourceId", "issuedByUserId"
        ) VALUES (
          ${societyId}::uuid, ${input.unitId}::uuid, ${rule.id}::uuid, ${input.receivableNumber.trim().toUpperCase()},
          ${input.billingPeriod.trim()}, ${input.description?.trim() || rule.name}, ${rule.amountPaise}, ${input.dueDate}::date,
          ${journalId}::uuid, 'CHARGE_RULE', ${sourceId}, ${userId}::uuid
        ) RETURNING "id"
      `);
      return this.getReceivable(tx, societyId, receivables[0].id);
    }).catch((error) => this.rethrowKnownDatabaseError(error, 'Receivable could not be issued'));
  }

  listReceivables(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT r."id", r."unitId", r."chargeRuleId", r."receivableNumber", r."billingPeriod", r."description",
             r."amountPaise"::text AS "amountPaise", r."dueDate", r."status", r."journalEntryId", r."issuedAt",
             (
               r."amountPaise"
               + COALESCE((SELECT SUM(CASE WHEN a."type" = 'DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END)
                           FROM "ReceivableAdjustment" a WHERE a."societyId" = r."societyId" AND a."receivableId" = r."id"), 0)
               - COALESCE((SELECT SUM(x."amountPaise") FROM "ReceivableAllocation" x
                           WHERE x."societyId" = r."societyId" AND x."receivableId" = r."id"), 0)
             )::text AS "outstandingPaise"
      FROM "Receivable" r
      WHERE r."societyId" = ${societyId}::uuid
      ORDER BY r."dueDate" DESC, r."issuedAt" DESC
      LIMIT 500
    `);
  }

  ageing(societyId: string, asOf: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      WITH balances AS (
        SELECT r."id", r."dueDate", r."status",
               r."amountPaise"
               + COALESCE((SELECT SUM(CASE WHEN a."type" = 'DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END)
                           FROM "ReceivableAdjustment" a WHERE a."societyId" = r."societyId" AND a."receivableId" = r."id"), 0)
               - COALESCE((SELECT SUM(x."amountPaise") FROM "ReceivableAllocation" x
                           WHERE x."societyId" = r."societyId" AND x."receivableId" = r."id"), 0) AS outstanding
        FROM "Receivable" r
        WHERE r."societyId" = ${societyId}::uuid AND r."status" <> 'VOID'
      )
      SELECT
        COALESCE(SUM(CASE WHEN outstanding > 0 AND "dueDate" >= ${asOf}::date THEN outstanding ELSE 0 END), 0)::text AS "currentPaise",
        COALESCE(SUM(CASE WHEN outstanding > 0 AND ${asOf}::date - "dueDate" BETWEEN 1 AND 30 THEN outstanding ELSE 0 END), 0)::text AS "days1To30Paise",
        COALESCE(SUM(CASE WHEN outstanding > 0 AND ${asOf}::date - "dueDate" BETWEEN 31 AND 60 THEN outstanding ELSE 0 END), 0)::text AS "days31To60Paise",
        COALESCE(SUM(CASE WHEN outstanding > 0 AND ${asOf}::date - "dueDate" BETWEEN 61 AND 90 THEN outstanding ELSE 0 END), 0)::text AS "days61To90Paise",
        COALESCE(SUM(CASE WHEN outstanding > 0 AND ${asOf}::date - "dueDate" > 90 THEN outstanding ELSE 0 END), 0)::text AS "days90PlusPaise"
      FROM balances
    `);
  }

  async addAdjustment(societyId: string, userId: string, receivableId: string, input: AdjustmentInput) {
    if (input.amountPaise <= 0) throw new BadRequestException('Adjustment amount must be positive');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; unitId: string; status: string; chargeRuleId: string | null }>>(Prisma.sql`
        SELECT "id", "unitId", "status", "chargeRuleId" FROM "Receivable"
        WHERE "id" = ${receivableId}::uuid AND "societyId" = ${societyId}::uuid FOR UPDATE
      `);
      const receivable = rows[0];
      if (!receivable) throw new NotFoundException('Receivable not found');
      if (receivable.status === 'VOID') throw new ConflictException('Void receivable cannot be adjusted');
      if (!receivable.chargeRuleId) throw new BadRequestException('Receivable has no charge rule account mapping');

      const rules = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
        SELECT * FROM "ChargeRule" WHERE "id" = ${receivable.chargeRuleId}::uuid AND "societyId" = ${societyId}::uuid LIMIT 1
      `);
      const rule = rules[0];
      if (!rule) throw new BadRequestException('Charge rule account mapping unavailable');

      const periods = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status" FROM "AccountingPeriod"
        WHERE "societyId" = ${societyId}::uuid AND ${input.entryDate}::date BETWEEN "startsOn" AND "endsOn"
        ORDER BY "startsOn" DESC LIMIT 1 FOR UPDATE
      `);
      if (!periods.length || periods[0].status !== 'OPEN') throw new ConflictException('Adjustment date requires an open accounting period');

      const debit = input.type === 'DEBIT';
      const journalRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "JournalEntry" (
          "societyId", "periodId", "entryNumber", "entryDate", "description", "status", "sourceType", "sourceId",
          "createdByUserId", "postedByUserId", "postedAt"
        ) VALUES (
          ${societyId}::uuid, ${periods[0].id}::uuid, ${input.journalEntryNumber.trim().toUpperCase()}, ${input.entryDate}::date,
          ${input.reason.trim()}, 'POSTED', 'RECEIVABLE_ADJUSTMENT', ${`${receivableId}:${input.journalEntryNumber.trim().toUpperCase()}`},
          ${userId}::uuid, ${userId}::uuid, CURRENT_TIMESTAMP
        ) RETURNING "id"
      `);
      const journalId = journalRows[0].id;

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "JournalLine" ("societyId", "entryId", "accountId", "fundId", "unitId", "description", "debitPaise", "creditPaise")
        VALUES
          (${societyId}::uuid, ${journalId}::uuid, ${rule.receivableAccountId}::uuid, ${rule.fundId}::uuid, ${receivable.unitId}::uuid,
           ${input.reason.trim()}, ${debit ? input.amountPaise : 0}, ${debit ? 0 : input.amountPaise}),
          (${societyId}::uuid, ${journalId}::uuid, ${rule.incomeAccountId}::uuid, ${rule.fundId}::uuid, ${receivable.unitId}::uuid,
           ${input.reason.trim()}, ${debit ? 0 : input.amountPaise}, ${debit ? input.amountPaise : 0})
      `);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ReceivableAdjustment" ("societyId", "receivableId", "type", "amountPaise", "reason", "journalEntryId", "createdByUserId")
        VALUES (${societyId}::uuid, ${receivableId}::uuid, ${input.type}::"ReceivableAdjustmentType", ${input.amountPaise},
                ${input.reason.trim()}, ${journalId}::uuid, ${userId}::uuid)
      `);
      return this.getReceivable(tx, societyId, receivableId);
    }).catch((error) => this.rethrowKnownDatabaseError(error, 'Receivable adjustment could not be created'));
  }

  private validateChargeRule(input: ChargeRuleInput) {
    if (input.amountPaise <= 0) throw new BadRequestException('Charge amount must be positive');
    if (input.graceDays < 0 || input.graceDays > 365) throw new BadRequestException('Grace days must be between 0 and 365');
    if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new BadRequestException('Effective end must not precede start');
    if (input.lateFeeMode === 'FIXED' && (!input.lateFeeFixedPaise || input.lateFeeFixedPaise <= 0)) throw new BadRequestException('Fixed late fee requires a positive amount');
    if (input.lateFeeMode === 'PERCENTAGE' && (!input.lateFeeBasisPoints || input.lateFeeBasisPoints <= 0 || input.lateFeeBasisPoints > 10000)) throw new BadRequestException('Percentage late fee basis points must be between 1 and 10000');
  }

  private async getRule(societyId: string, ruleId: string) {
    const rows = await this.prisma.$queryRaw<RuleRow[]>(Prisma.sql`
      SELECT * FROM "ChargeRule" WHERE "id" = ${ruleId}::uuid AND "societyId" = ${societyId}::uuid AND "active" = true LIMIT 1
    `);
    if (!rows.length) throw new NotFoundException('Charge rule not found');
    return rows[0];
  }

  private async assertUnit(societyId: string, unitId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Unit" WHERE "id" = ${unitId}::uuid AND "societyId" = ${societyId}::uuid LIMIT 1
    `);
    if (!rows.length) throw new BadRequestException('Unit does not belong to this society');
  }

  private async findExistingSource(societyId: string, chargeRuleId: string, unitId: string, billingPeriod: string) {
    const sourceId = `${chargeRuleId}:${unitId}:${billingPeriod.trim()}`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Receivable" WHERE "societyId" = ${societyId}::uuid AND "sourceType" = 'CHARGE_RULE' AND "sourceId" = ${sourceId} LIMIT 1
    `);
    return rows[0];
  }

  private assertRuleEffective(rule: RuleRow, entryDate: string) {
    const day = entryDate.slice(0, 10);
    const start = rule.effectiveFrom.toISOString().slice(0, 10);
    const end = rule.effectiveUntil?.toISOString().slice(0, 10);
    if (day < start || (end && day > end)) throw new BadRequestException('Charge rule is not effective on the issue date');
  }

  private assertDueDate(entryDate: string, dueDate: string) {
    if (dueDate.slice(0, 10) < entryDate.slice(0, 10)) throw new BadRequestException('Due date cannot precede issue date');
  }

  private async getReceivable(tx: Prisma.TransactionClient, societyId: string, receivableId: string) {
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT r."id", r."unitId", r."receivableNumber", r."billingPeriod", r."description", r."amountPaise"::text AS "amountPaise",
             r."dueDate", r."status", r."journalEntryId", r."issuedAt",
             (r."amountPaise"
              + COALESCE((SELECT SUM(CASE WHEN a."type" = 'DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END)
                          FROM "ReceivableAdjustment" a WHERE a."societyId" = r."societyId" AND a."receivableId" = r."id"), 0)
              - COALESCE((SELECT SUM(x."amountPaise") FROM "ReceivableAllocation" x
                          WHERE x."societyId" = r."societyId" AND x."receivableId" = r."id"), 0))::text AS "outstandingPaise"
      FROM "Receivable" r WHERE r."id" = ${receivableId}::uuid AND r."societyId" = ${societyId}::uuid
    `);
    return rows[0];
  }

  private rethrowKnownDatabaseError(error: unknown, fallback: string): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('unique') || message.includes('duplicate key')) throw new ConflictException('Receivable record already exists');
    if (message.includes('foreign key')) throw new BadRequestException('Referenced resource does not belong to this society or does not exist');
    if (message.includes('append-only') || message.includes('immutable') || message.includes('closed')) throw new ConflictException(message);
    throw new BadRequestException(fallback);
  }
}
