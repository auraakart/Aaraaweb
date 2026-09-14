import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type UtilityMeterType = 'ELECTRICITY' | 'WATER' | 'DG' | 'GAS' | 'OTHER';
export type UtilityReadingKind = 'ACTUAL' | 'RESET';
export type UtilityReadingSource = 'MANUAL' | 'IMPORT' | 'INTEGRATION';
export type UtilityTariffPlanStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

type CreateMeterInput = {
  code: string;
  label?: string;
  buildingId?: string;
  unitId?: string;
  meterType: UtilityMeterType;
  externalRef?: string;
};

type CreateReadingInput = {
  meterId: string;
  readingAt: string;
  value: number;
  readingKind?: UtilityReadingKind;
  source?: UtilityReadingSource;
  note?: string;
};

type TariffSlabInput = {
  fromUnit: number;
  toUnit?: number | null;
  ratePaisePerUnit: number;
};

type CreateTariffPlanInput = {
  code: string;
  name: string;
  meterType: UtilityMeterType;
  effectiveFrom: string;
  effectiveTo?: string;
  fixedChargePaise?: number;
  minimumChargePaise?: number;
  slabs: TariffSlabInput[];
};

@Injectable()
export class UtilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  listMeters(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT m.*,
        b."name" AS "buildingName",
        u."number" AS "unitNumber",
        latest."readingAt" AS "latestReadingAt",
        latest."value" AS "latestReadingValue",
        latest."readingKind" AS "latestReadingKind"
      FROM "UtilityMeter" m
      LEFT JOIN "Building" b ON b."id"=m."buildingId" AND b."societyId"=m."societyId"
      LEFT JOIN "Unit" u ON u."id"=m."unitId" AND u."societyId"=m."societyId"
      LEFT JOIN LATERAL (
        SELECT r."readingAt", r."value", r."readingKind"
        FROM "UtilityReading" r
        WHERE r."meterId"=m."id" AND r."societyId"=m."societyId"
        ORDER BY r."readingAt" DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE m."societyId"=${societyId}::uuid
      ORDER BY m."active" DESC, m."meterType", m."code"
    `);
  }

  async createMeter(societyId: string, actorUserId: string, input: CreateMeterInput) {
    const code = input.code.trim().toUpperCase();
    const label = input.label?.trim() || null;
    const externalRef = input.externalRef?.trim() || null;
    if (!code || code.length > 60) throw new BadRequestException('Meter code must be between 1 and 60 characters');
    if (label && label.length > 120) throw new BadRequestException('Meter label is too long');
    if (externalRef && externalRef.length > 120) throw new BadRequestException('Meter external reference is too long');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "UtilityMeter" (
            "societyId","buildingId","unitId","code","label","meterType","externalRef","createdByUserId"
          ) VALUES (
            ${societyId}::uuid,${input.buildingId ?? null}::uuid,${input.unitId ?? null}::uuid,
            ${code},${label},${input.meterType},${externalRef},${actorUserId}::uuid
          ) RETURNING *
        `);
        const meter = rows[0];
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UtilityEvent" ("societyId","meterId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${meter.id}::uuid,${actorUserId}::uuid,'METER_CREATED',${code})
        `);
        return meter;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Meter code already exists in this society');
      throw error;
    }
  }

  async deactivateMeter(societyId: string, actorUserId: string, meterId: string, noteInput?: string) {
    const note = noteInput?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Meter deactivation note is too long');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "UtilityMeter"
        SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${meterId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true
        RETURNING "id"
      `);
      if (!rows[0]) throw new NotFoundException('Active utility meter not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UtilityEvent" ("societyId","meterId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${meterId}::uuid,${actorUserId}::uuid,'METER_DEACTIVATED',${note})
      `);
      return rows[0];
    });
  }

  listReadings(societyId: string, meterId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      WITH ordered AS (
        SELECT r.*,
          lag(r."value") OVER (ORDER BY r."readingAt") AS "previousValue",
          lag(r."readingKind") OVER (ORDER BY r."readingAt") AS "previousKind"
        FROM "UtilityReading" r
        WHERE r."societyId"=${societyId}::uuid AND r."meterId"=${meterId}::uuid
      )
      SELECT ordered.*,
        CASE
          WHEN ordered."previousValue" IS NULL THEN NULL
          WHEN ordered."readingKind"='RESET' THEN NULL
          WHEN ordered."value" < ordered."previousValue" THEN NULL
          ELSE ordered."value" - ordered."previousValue"
        END AS "consumptionSincePrevious"
      FROM ordered
      ORDER BY ordered."readingAt" DESC
      LIMIT 1000
    `);
  }

  async createReading(societyId: string, actorUserId: string, input: CreateReadingInput) {
    const readingAt = new Date(input.readingAt);
    if (!Number.isFinite(readingAt.getTime())) throw new BadRequestException('Invalid reading timestamp');
    if (!Number.isFinite(input.value) || input.value < 0) throw new BadRequestException('Meter reading must be a non-negative number');
    const readingKind = input.readingKind ?? 'ACTUAL';
    const source = input.source ?? 'MANUAL';
    const note = input.note?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Reading note is too long');
    if (readingKind === 'RESET' && !note) throw new BadRequestException('Reset readings require a note explaining the reset or meter replacement');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const meters = await tx.$queryRaw<Array<{ id: string; active: boolean }>>(Prisma.sql`
          SELECT "id","active" FROM "UtilityMeter"
          WHERE "id"=${input.meterId}::uuid AND "societyId"=${societyId}::uuid
          FOR UPDATE
        `);
        if (!meters[0]) throw new NotFoundException('Utility meter not found');
        if (!meters[0].active) throw new BadRequestException('Inactive utility meter cannot accept readings');

        if (readingKind === 'ACTUAL') {
          const previous = await tx.$queryRaw<Array<{ value: string; readingKind: UtilityReadingKind }>>(Prisma.sql`
            SELECT "value"::text AS "value","readingKind"
            FROM "UtilityReading"
            WHERE "societyId"=${societyId}::uuid AND "meterId"=${input.meterId}::uuid AND "readingAt" < ${readingAt}
            ORDER BY "readingAt" DESC LIMIT 1
          `);
          const next = await tx.$queryRaw<Array<{ value: string; readingKind: UtilityReadingKind }>>(Prisma.sql`
            SELECT "value"::text AS "value","readingKind"
            FROM "UtilityReading"
            WHERE "societyId"=${societyId}::uuid AND "meterId"=${input.meterId}::uuid AND "readingAt" > ${readingAt}
            ORDER BY "readingAt" ASC LIMIT 1
          `);
          if (previous[0] && input.value < Number(previous[0].value)) {
            throw new ConflictException('Reading is lower than the previous reading; record a RESET reading for meter replacement or reset');
          }
          if (next[0]?.readingKind !== 'RESET' && next[0] && input.value > Number(next[0].value)) {
            throw new ConflictException('Reading is higher than the next recorded reading');
          }
        }

        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "UtilityReading" (
            "societyId","meterId","readingAt","value","readingKind","source","note","recordedByUserId"
          ) VALUES (
            ${societyId}::uuid,${input.meterId}::uuid,${readingAt},${input.value},${readingKind},${source},${note},${actorUserId}::uuid
          ) RETURNING *
        `);
        const reading = rows[0];
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UtilityEvent" ("societyId","meterId","readingId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${input.meterId}::uuid,${reading.id}::uuid,${actorUserId}::uuid,'READING_RECORDED',${note})
        `);
        return reading;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('A reading already exists for this meter at that timestamp');
      throw error;
    }
  }

  listTariffPlans(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', s."id",
              'sequence', s."sequence",
              'fromUnit', s."fromUnit",
              'toUnit', s."toUnit",
              'ratePaisePerUnit', s."ratePaisePerUnit"
            ) ORDER BY s."sequence"
          ) FILTER (WHERE s."id" IS NOT NULL), '[]'::jsonb
        ) AS "slabs"
      FROM "UtilityTariffPlan" p
      LEFT JOIN "UtilityTariffSlab" s ON s."planId"=p."id" AND s."societyId"=p."societyId"
      WHERE p."societyId"=${societyId}::uuid
      GROUP BY p."id"
      ORDER BY p."meterType", p."effectiveFrom" DESC, p."createdAt" DESC
    `);
  }

  async createTariffPlan(societyId: string, actorUserId: string, input: CreateTariffPlanInput) {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || code.length > 60) throw new BadRequestException('Tariff code must be between 1 and 60 characters');
    if (!name || name.length > 120) throw new BadRequestException('Tariff name must be between 1 and 120 characters');

    const effectiveFrom = this.parseDateOnly(input.effectiveFrom, 'effectiveFrom');
    const effectiveTo = input.effectiveTo ? this.parseDateOnly(input.effectiveTo, 'effectiveTo') : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('Tariff effectiveTo must be after effectiveFrom');

    const fixedChargePaise = input.fixedChargePaise ?? 0;
    const minimumChargePaise = input.minimumChargePaise ?? 0;
    if (!Number.isInteger(fixedChargePaise) || fixedChargePaise < 0) throw new BadRequestException('Fixed charge must be a non-negative paise integer');
    if (!Number.isInteger(minimumChargePaise) || minimumChargePaise < 0) throw new BadRequestException('Minimum charge must be a non-negative paise integer');
    const slabs = this.validateTariffSlabs(input.slabs);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plans = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "UtilityTariffPlan" (
            "societyId","code","name","meterType","effectiveFrom","effectiveTo",
            "fixedChargePaise","minimumChargePaise","createdByUserId"
          ) VALUES (
            ${societyId}::uuid,${code},${name},${input.meterType},${effectiveFrom}::date,${effectiveTo}::date,
            ${fixedChargePaise},${minimumChargePaise},${actorUserId}::uuid
          ) RETURNING "id"
        `);
        const plan = plans[0];
        for (let index = 0; index < slabs.length; index += 1) {
          const slab = slabs[index];
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "UtilityTariffSlab" (
              "societyId","planId","sequence","fromUnit","toUnit","ratePaisePerUnit"
            ) VALUES (
              ${societyId}::uuid,${plan.id}::uuid,${index + 1},${slab.fromUnit},${slab.toUnit ?? null},${slab.ratePaisePerUnit}
            )
          `);
        }
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UtilityTariffEvent" ("societyId","planId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${plan.id}::uuid,${actorUserId}::uuid,'TARIFF_CREATED',${code})
        `);
        return { id: plan.id, status: 'DRAFT' as UtilityTariffPlanStatus };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Tariff code already exists in this society');
      throw error;
    }
  }

  async activateTariffPlan(societyId: string, actorUserId: string, planId: string) {
    return this.prisma.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<Array<{
        id: string;
        status: UtilityTariffPlanStatus;
        meterType: UtilityMeterType;
        effectiveFrom: Date;
        effectiveTo: Date | null;
      }>>(Prisma.sql`
        SELECT "id","status","meterType","effectiveFrom","effectiveTo"
        FROM "UtilityTariffPlan"
        WHERE "id"=${planId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const plan = plans[0];
      if (!plan) throw new NotFoundException('Utility tariff plan not found');
      if (plan.status !== 'DRAFT') throw new BadRequestException('Only draft tariff plans can be activated');

      const slabCount = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count" FROM "UtilityTariffSlab"
        WHERE "planId"=${planId}::uuid AND "societyId"=${societyId}::uuid
      `);
      if (Number(slabCount[0]?.count ?? 0) === 0) throw new BadRequestException('Tariff plan has no slabs');

      const overlaps = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "UtilityTariffPlan"
        WHERE "societyId"=${societyId}::uuid
          AND "meterType"=${plan.meterType}
          AND "status"='ACTIVE'
          AND daterange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::date), '[)')
              && daterange(${plan.effectiveFrom}::date, ${plan.effectiveTo}::date, '[)')
        LIMIT 1
      `);
      if (overlaps[0]) throw new ConflictException('An active tariff already overlaps this effective period');

      const rows = await tx.$queryRaw<Array<{ id: string; status: UtilityTariffPlanStatus }>>(Prisma.sql`
        UPDATE "UtilityTariffPlan"
        SET "status"='ACTIVE',"activatedByUserId"=${actorUserId}::uuid,"activatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${planId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
        RETURNING "id","status"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UtilityTariffEvent" ("societyId","planId","actorUserId","action")
        VALUES (${societyId}::uuid,${planId}::uuid,${actorUserId}::uuid,'TARIFF_ACTIVATED')
      `);
      return rows[0];
    });
  }

  async retireTariffPlan(societyId: string, actorUserId: string, planId: string, noteInput?: string) {
    const note = noteInput?.trim() || null;
    if (note && note.length > 300) throw new BadRequestException('Tariff retirement note is too long');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: UtilityTariffPlanStatus }>>(Prisma.sql`
        UPDATE "UtilityTariffPlan"
        SET "status"='RETIRED',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${planId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE'
        RETURNING "id","status"
      `);
      if (!rows[0]) throw new NotFoundException('Active utility tariff plan not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UtilityTariffEvent" ("societyId","planId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${planId}::uuid,${actorUserId}::uuid,'TARIFF_RETIRED',${note})
      `);
      return rows[0];
    });
  }

  tariffHistory(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*, p."code" AS "tariffCode", p."name" AS "tariffName", p."meterType", actor."name" AS "actorName"
      FROM "UtilityTariffEvent" e
      LEFT JOIN "UtilityTariffPlan" p ON p."id"=e."planId" AND p."societyId"=e."societyId"
      JOIN "User" actor ON actor."id"=e."actorUserId"
      WHERE e."societyId"=${societyId}::uuid
      ORDER BY e."occurredAt" DESC
      LIMIT 500
    `);
  }

  history(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*, m."code" AS "meterCode", actor."name" AS "actorName"
      FROM "UtilityEvent" e
      LEFT JOIN "UtilityMeter" m ON m."id"=e."meterId" AND m."societyId"=e."societyId"
      JOIN "User" actor ON actor."id"=e."actorUserId"
      WHERE e."societyId"=${societyId}::uuid
      ORDER BY e."occurredAt" DESC
      LIMIT 500
    `);
  }

  private validateTariffSlabs(input: TariffSlabInput[]) {
    if (!Array.isArray(input) || input.length === 0 || input.length > 50) throw new BadRequestException('Tariff plan must contain between 1 and 50 slabs');
    const slabs = input.map((slab) => ({
      fromUnit: Number(slab.fromUnit),
      toUnit: slab.toUnit === null || slab.toUnit === undefined ? null : Number(slab.toUnit),
      ratePaisePerUnit: Number(slab.ratePaisePerUnit),
    }));
    for (const slab of slabs) {
      if (!Number.isFinite(slab.fromUnit) || slab.fromUnit < 0) throw new BadRequestException('Tariff slab fromUnit must be non-negative');
      if (slab.toUnit !== null && (!Number.isFinite(slab.toUnit) || slab.toUnit <= slab.fromUnit)) throw new BadRequestException('Tariff slab toUnit must be greater than fromUnit');
      if (!Number.isInteger(slab.ratePaisePerUnit) || slab.ratePaisePerUnit < 0) throw new BadRequestException('Tariff slab rate must be a non-negative paise integer');
    }
    const sorted = [...slabs].sort((a, b) => a.fromUnit - b.fromUnit);
    if (sorted[0].fromUnit !== 0) throw new BadRequestException('Tariff slabs must start at zero units');
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      if (current.toUnit === null) throw new BadRequestException('Only the final tariff slab may be open-ended');
      if (current.toUnit !== next.fromUnit) throw new BadRequestException('Tariff slabs must be contiguous with no gaps or overlaps');
    }
    return sorted;
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must use YYYY-MM-DD`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${field} is invalid`);
    return value;
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
