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

  async residentInsights(societyId: string, userId: string, unitId?: string) {
    const usage=await this.listUsageHistory(societyId,userId,unitId);
    const providerRows=await this.prisma.$queryRaw<Array<{meterId:string;providerLinked:boolean}>>(Prisma.sql`
      SELECT m."id" AS "meterId",
        EXISTS (
          SELECT 1
          FROM "UtilityIntegrationMeterMap" map
          JOIN "UtilityIntegration" integration
            ON integration."id"=map."integrationId"
           AND integration."societyId"=map."societyId"
           AND integration."status"='ACTIVE'
          WHERE map."societyId"=m."societyId"
            AND map."meterId"=m."id"
            AND map."active"=TRUE
        ) AS "providerLinked"
      FROM "UtilityMeter" m
      WHERE m."societyId"=${societyId}::uuid
        AND m."active"=TRUE
        AND (${unitId ?? null}::uuid IS NULL OR m."unitId"=${unitId ?? null}::uuid)
        AND (
          EXISTS (
            SELECT 1 FROM "UnitOwnership" ow
            WHERE ow."societyId"=${societyId}::uuid
              AND ow."unitId"=m."unitId"
              AND ow."userId"=${userId}::uuid
              AND ow."verified"=TRUE AND ow."active"=TRUE
              AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
          )
          OR EXISTS (
            SELECT 1 FROM "UnitOccupancy" oc
            WHERE oc."societyId"=${societyId}::uuid
              AND oc."unitId"=m."unitId"
              AND oc."userId"=${userId}::uuid
              AND oc."active"=TRUE
              AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
          )
        )
    `);
    const providerByMeter=new Map(providerRows.map((row)=>[row.meterId,row.providerLinked]));
    const grouped=new Map<string,Array<Record<string,unknown>>>();
    for(const row of usage){
      const meterId=String(row.meterId??'');
      if(!meterId) continue;
      const current=grouped.get(meterId)??[];
      current.push(row);
      grouped.set(meterId,current);
    }
    const meters=[...grouped.entries()].map(([meterId,rows])=>{
      const samples=rows
        .map((row)=>({row,value:Number(row.consumptionSincePrevious)}))
        .filter((item)=>Number.isFinite(item.value)&&item.value>=0)
        .slice(0,6);
      const latest=samples[0]?.value??null;
      const baselineValues=samples.slice(1).map((item)=>item.value);
      const baselineAverage=baselineValues.length
        ? baselineValues.reduce((sum,value)=>sum+value,0)/baselineValues.length
        : null;
      const changePercent=latest!==null&&baselineAverage!==null&&baselineAverage>0
        ? Math.round(((latest-baselineAverage)/baselineAverage)*1000)/10
        : null;
      const attention=
        latest===null||baselineAverage===null?'INSUFFICIENT_EVIDENCE':
        baselineAverage>0&&latest>baselineAverage*1.5?'HIGHER_THAN_RECENT':
        baselineAverage>0&&latest<baselineAverage*0.5?'LOWER_THAN_RECENT':
        'NORMAL_RANGE';
      const head=rows[0]??{};
      return {
        meterId,
        unitId:head.unitId??null,
        meterCode:head.meterCode??null,
        meterLabel:head.meterLabel??null,
        meterType:head.meterType??null,
        latestReadingAt:head.readingAt??null,
        latestConsumption:latest,
        recentBaselineAverage:baselineAverage===null?null:Math.round(baselineAverage*1000)/1000,
        changePercent,
        attention,
        providerLinked:providerByMeter.get(meterId)===true,
        prepaidBalanceAvailable:false,
        rechargeExecutionAvailable:false,
      };
    });
    return {
      meters,
      attentionCount:meters.filter((meter)=>meter.attention==='HIGHER_THAN_RECENT').length,
      providerLinkedCount:meters.filter((meter)=>meter.providerLinked).length,
      prepaid:{
        balanceEvidenceAvailable:false,
        rechargeExecutionAvailable:false,
        boundary:'Aaraagate can ingest meter readings through provider-neutral integrations. Prepaid balance and recharge execution remain unavailable until an explicit provider adapter supplies authoritative balance and credit-confirmation evidence.',
      },
      boundary:'Consumption attention compares recent recorded deltas only. It is a deterministic usage signal, not a leak, fault or billing diagnosis.',
    };
  }

  listUsageHistory(societyId: string, userId: string, unitId?: string) {
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH allowed_meters AS (
        SELECT m."id",m."unitId",m."code",m."label",m."meterType",
               u."number" AS "unitNumber",b."name" AS "buildingName"
        FROM "UtilityMeter" m
        JOIN "Unit" u ON u."id"=m."unitId" AND u."societyId"=m."societyId"
        JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=m."societyId"
        WHERE m."societyId"=${societyId}::uuid
          AND m."active"=TRUE
          AND (${unitId ?? null}::uuid IS NULL OR m."unitId"=${unitId ?? null}::uuid)
          AND (
            EXISTS (
              SELECT 1 FROM "UnitOwnership" ow
              WHERE ow."societyId"=${societyId}::uuid
                AND ow."unitId"=m."unitId"
                AND ow."userId"=${userId}::uuid
                AND ow."verified"=TRUE
                AND ow."active"=TRUE
                AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
            )
            OR EXISTS (
              SELECT 1 FROM "UnitOccupancy" oc
              WHERE oc."societyId"=${societyId}::uuid
                AND oc."unitId"=m."unitId"
                AND oc."userId"=${userId}::uuid
                AND oc."active"=TRUE
                AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
            )
          )
      ),
      readings AS (
        SELECT r."id",r."meterId",r."readingAt",r."value",r."readingKind",r."source",
          lag(r."value") OVER (PARTITION BY r."meterId" ORDER BY r."readingAt") AS "previousValue",
          lag(r."readingKind") OVER (PARTITION BY r."meterId" ORDER BY r."readingAt") AS "previousKind"
        FROM "UtilityReading" r
        JOIN allowed_meters am ON am."id"=r."meterId"
        WHERE r."societyId"=${societyId}::uuid
          AND r."readingAt">=CURRENT_TIMESTAMP-INTERVAL '13 months'
      )
      SELECT
        am."id" AS "meterId",am."unitId",am."code" AS "meterCode",am."label" AS "meterLabel",
        am."meterType",am."unitNumber",am."buildingName",
        rr."id" AS "readingId",rr."readingAt",rr."value"::text AS "value",
        rr."readingKind",rr."source",
        CASE
          WHEN rr."previousValue" IS NULL THEN NULL
          WHEN rr."readingKind"='RESET' OR rr."previousKind"='RESET' THEN NULL
          WHEN rr."value"<rr."previousValue" THEN NULL
          ELSE (rr."value"-rr."previousValue")::text
        END AS "consumptionSincePrevious"
      FROM allowed_meters am
      LEFT JOIN readings rr ON rr."meterId"=am."id"
      ORDER BY am."meterType",am."code",rr."readingAt" DESC NULLS LAST
      LIMIT 1000
    `);
  }

}
