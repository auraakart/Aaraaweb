import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UtilityResidentService {
  constructor(private readonly prisma: PrismaService) {}

  listIssuedCharges(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        d."id" AS "chargeDraftId",
        d."unitId",
        d."meterId",
        d."periodStart",
        d."periodEnd",
        d."consumption"::text AS "consumption",
        d."variableChargePaise",
        d."fixedChargePaise",
        d."minimumChargePaise",
        d."totalPaise",
        d."calculationJson",
        d."issuedAt",
        m."code" AS "meterCode",
        m."label" AS "meterLabel",
        m."meterType",
        p."id" AS "tariffPlanId",
        p."code" AS "tariffCode",
        p."name" AS "tariffName",
        o."id" AS "openingReadingId",
        o."readingAt" AS "openingReadingAt",
        o."value"::text AS "openingReadingValue",
        c."id" AS "closingReadingId",
        c."readingAt" AS "closingReadingAt",
        c."value"::text AS "closingReadingValue",
        i."id" AS "invoiceId",
        i."invoiceNumber",
        i."billingPeriod",
        i."amountPaise",
        i."dueDate",
        i."status" AS "invoiceStatus",
        i."paidAt",
        u."number" AS "unitNumber",
        b."name" AS "buildingName"
      FROM "UtilityChargeDraft" d
      JOIN "MaintenanceInvoice" i
        ON i."sourceUtilityChargeDraftId"=d."id" AND i."societyId"=d."societyId"
      JOIN "UtilityMeter" m
        ON m."id"=d."meterId" AND m."societyId"=d."societyId"
      JOIN "UtilityTariffPlan" p
        ON p."id"=d."tariffPlanId" AND p."societyId"=d."societyId"
      JOIN "UtilityReading" o
        ON o."id"=d."openingReadingId" AND o."societyId"=d."societyId"
      JOIN "UtilityReading" c
        ON c."id"=d."closingReadingId" AND c."societyId"=d."societyId"
      JOIN "Unit" u
        ON u."id"=d."unitId" AND u."societyId"=d."societyId"
      JOIN "Building" b
        ON b."id"=u."buildingId" AND b."societyId"=d."societyId"
      WHERE d."societyId"=${societyId}::uuid
        AND d."status"='ISSUED'
        AND (
          EXISTS (
            SELECT 1 FROM "UnitOwnership" uo
            WHERE uo."societyId"=${societyId}::uuid
              AND uo."unitId"=d."unitId"
              AND uo."userId"=${userId}::uuid
              AND uo."verified"=true
              AND uo."active"=true
              AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          ) OR EXISTS (
            SELECT 1 FROM "UnitOccupancy" ur
            WHERE ur."societyId"=${societyId}::uuid
              AND ur."unitId"=d."unitId"
              AND ur."userId"=${userId}::uuid
              AND ur."relation"='TENANT'
              AND ur."active"=true
              AND ur."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (ur."effectiveTo" IS NULL OR ur."effectiveTo">CURRENT_TIMESTAMP)
          )
        )
      ORDER BY d."periodEnd" DESC, d."createdAt" DESC
      LIMIT 1000
    `);
  }
}
