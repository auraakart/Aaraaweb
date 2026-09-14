import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Slab = { fromUnit: number; toUnit: number | null; ratePaisePerUnit: number };
type ChargeInput = { openingReadingId: string; closingReadingId: string };

export function calculateUtilityCharge(consumption: number, slabs: Slab[], fixedChargePaise: number, minimumChargePaise: number) {
  if (!Number.isFinite(consumption) || consumption < 0) throw new BadRequestException('Consumption must be non-negative');
  let variableRaw = 0;
  const breakdown = slabs.map((slab) => {
    const upper = slab.toUnit ?? consumption;
    const units = Math.max(0, Math.min(consumption, upper) - slab.fromUnit);
    const chargeRaw = units * slab.ratePaisePerUnit;
    variableRaw += chargeRaw;
    return { fromUnit: slab.fromUnit, toUnit: slab.toUnit, units, ratePaisePerUnit: slab.ratePaisePerUnit, chargePaise: Math.round(chargeRaw) };
  }).filter((row) => row.units > 0);
  const variableChargePaise = Math.round(variableRaw);
  const subtotalPaise = variableChargePaise + fixedChargePaise;
  const totalPaise = Math.max(subtotalPaise, minimumChargePaise);
  return { consumption, variableChargePaise, fixedChargePaise, minimumChargePaise, totalPaise, breakdown };
}

@Injectable()
export class UtilityChargesService {
  constructor(private readonly prisma: PrismaService) {}

  listDrafts(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT d.*, m."code" AS "meterCode", m."meterType", u."number" AS "unitNumber",
        b."name" AS "buildingName", p."code" AS "tariffCode", p."name" AS "tariffName"
      FROM "UtilityChargeDraft" d
      JOIN "UtilityMeter" m ON m."id"=d."meterId" AND m."societyId"=d."societyId"
      JOIN "Unit" u ON u."id"=d."unitId" AND u."societyId"=d."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=d."societyId"
      JOIN "UtilityTariffPlan" p ON p."id"=d."tariffPlanId" AND p."societyId"=d."societyId"
      WHERE d."societyId"=${societyId}::uuid
      ORDER BY d."createdAt" DESC
      LIMIT 1000
    `);
  }

  async createDraft(societyId: string, actorUserId: string, input: ChargeInput) {
    if (input.openingReadingId === input.closingReadingId) throw new BadRequestException('Opening and closing readings must be different');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{
          meterId: string; unitId: string | null; meterType: string;
          openingAt: Date; openingValue: string; closingAt: Date; closingValue: string;
        }>>(Prisma.sql`
          SELECT m."id" AS "meterId", m."unitId", m."meterType",
            o."readingAt" AS "openingAt", o."value"::text AS "openingValue",
            c."readingAt" AS "closingAt", c."value"::text AS "closingValue"
          FROM "UtilityMeter" m
          JOIN "UtilityReading" o ON o."meterId"=m."id" AND o."societyId"=m."societyId" AND o."id"=${input.openingReadingId}::uuid
          JOIN "UtilityReading" c ON c."meterId"=m."id" AND c."societyId"=m."societyId" AND c."id"=${input.closingReadingId}::uuid
          WHERE m."societyId"=${societyId}::uuid AND o."readingKind"='ACTUAL' AND c."readingKind"='ACTUAL'
          FOR UPDATE OF m
        `);
        const context = rows[0];
        if (!context) throw new NotFoundException('Matching ACTUAL opening and closing readings were not found for one society meter');
        if (!context.unitId) throw new BadRequestException('Utility billing requires a meter assigned to a unit');
        if (context.closingAt <= context.openingAt) throw new BadRequestException('Closing reading must be later than opening reading');
        const openingValue = Number(context.openingValue), closingValue = Number(context.closingValue);
        if (closingValue < openingValue) throw new ConflictException('Closing reading is lower than opening reading');

        const resets = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count" FROM "UtilityReading"
          WHERE "societyId"=${societyId}::uuid AND "meterId"=${context.meterId}::uuid
            AND "readingKind"='RESET' AND "readingAt">${context.openingAt} AND "readingAt"<${context.closingAt}
        `);
        if (Number(resets[0]?.count ?? 0) > 0) throw new ConflictException('A RESET reading exists inside this billing interval; split the charge period at the reset');

        const plans = await tx.$queryRaw<Array<{ id: string; fixedChargePaise: number; minimumChargePaise: number }>>(Prisma.sql`
          SELECT "id","fixedChargePaise","minimumChargePaise" FROM "UtilityTariffPlan"
          WHERE "societyId"=${societyId}::uuid AND "meterType"=${context.meterType} AND "status"='ACTIVE'
            AND "effectiveFrom" <= (${context.openingAt}::timestamptz AT TIME ZONE 'UTC')::date
            AND ("effectiveTo" IS NULL OR "effectiveTo" > (${context.closingAt}::timestamptz AT TIME ZONE 'UTC')::date)
          ORDER BY "effectiveFrom" DESC LIMIT 1
        `);
        const plan = plans[0];
        if (!plan) throw new NotFoundException('No active utility tariff covers the complete reading interval');

        const slabRows = await tx.$queryRaw<Array<{ fromUnit: string; toUnit: string | null; ratePaisePerUnit: string }>>(Prisma.sql`
          SELECT "fromUnit"::text AS "fromUnit","toUnit"::text AS "toUnit","ratePaisePerUnit"::text AS "ratePaisePerUnit"
          FROM "UtilityTariffSlab" WHERE "societyId"=${societyId}::uuid AND "planId"=${plan.id}::uuid ORDER BY "sequence"
        `);
        if (!slabRows.length) throw new BadRequestException('Active utility tariff has no slabs');
        const slabs = slabRows.map((s) => ({ fromUnit: Number(s.fromUnit), toUnit: s.toUnit === null ? null : Number(s.toUnit), ratePaisePerUnit: Number(s.ratePaisePerUnit) }));
        const calculation = calculateUtilityCharge(closingValue - openingValue, slabs, plan.fixedChargePaise, plan.minimumChargePaise);

        const drafts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "UtilityChargeDraft" (
            "societyId","unitId","meterId","openingReadingId","closingReadingId","tariffPlanId",
            "periodStart","periodEnd","consumption","variableChargePaise","fixedChargePaise","minimumChargePaise","totalPaise","calculationJson","createdByUserId"
          ) VALUES (
            ${societyId}::uuid,${context.unitId}::uuid,${context.meterId}::uuid,${input.openingReadingId}::uuid,${input.closingReadingId}::uuid,${plan.id}::uuid,
            ${context.openingAt},${context.closingAt},${calculation.consumption},${calculation.variableChargePaise},${calculation.fixedChargePaise},${calculation.minimumChargePaise},${calculation.totalPaise},${JSON.stringify(calculation)}::jsonb,${actorUserId}::uuid
          ) RETURNING "id"
        `);
        const draft = drafts[0];
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UtilityChargeEvent" ("societyId","draftId","actorUserId","action")
          VALUES (${societyId}::uuid,${draft.id}::uuid,${actorUserId}::uuid,'DRAFT_CREATED')
        `);
        return { id: draft.id, status: 'DRAFT', ...calculation };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('A utility charge draft already exists for these opening and closing readings');
      throw error;
    }
  }

  async voidDraft(societyId: string, actorUserId: string, draftId: string, noteInput?: string) {
    const note = noteInput?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Void note is too long');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "UtilityChargeDraft" SET "status"='VOID',"voidedAt"=CURRENT_TIMESTAMP,"voidedByUserId"=${actorUserId}::uuid
        WHERE "id"=${draftId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT' RETURNING "id"
      `);
      if (!rows[0]) throw new NotFoundException('Active utility charge draft not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UtilityChargeEvent" ("societyId","draftId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${draftId}::uuid,${actorUserId}::uuid,'DRAFT_VOIDED',${note})
      `);
      return { id: draftId, status: 'VOID' };
    });
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
