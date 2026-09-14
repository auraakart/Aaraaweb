import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type UtilityMeterType = 'ELECTRICITY' | 'WATER' | 'DG' | 'GAS' | 'OTHER';
export type UtilityReadingKind = 'ACTUAL' | 'RESET';
export type UtilityReadingSource = 'MANUAL' | 'IMPORT' | 'INTEGRATION';

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

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
