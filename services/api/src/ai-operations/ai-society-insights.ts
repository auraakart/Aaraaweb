import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export class AiSocietyInsights {
  constructor(private readonly prisma: PrismaService) {}

async societyFinance(societyId:string,minimumPaise:number){
    const overdue=await this.prisma.$queryRaw<Array<{count:number;amountPaise:bigint|number;over30:number}>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count",COALESCE(SUM("amountPaise"),0)::bigint AS "amountPaise",
        COUNT(*) FILTER (WHERE "dueDate"<CURRENT_DATE-30)::int AS "over30"
      FROM "MaintenanceInvoice"
      WHERE "societyId"=${societyId}::uuid AND "status"='ISSUED' AND "dueDate"<CURRENT_DATE
        AND "amountPaise">=${minimumPaise}
    `);
    const collections=await this.prisma.$queryRaw<Array<{currentPaise:bigint|number;previousPaise:bigint|number}>>(Prisma.sql`
      SELECT
        COALESCE(SUM("amountPaise") FILTER (WHERE "status"='CAPTURED' AND "completedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'),0)::bigint AS "currentPaise",
        COALESCE(SUM("amountPaise") FILTER (WHERE "status"='CAPTURED' AND "completedAt"<CURRENT_TIMESTAMP-INTERVAL '30 days' AND "completedAt">=CURRENT_TIMESTAMP-INTERVAL '60 days'),0)::bigint AS "previousPaise"
      FROM "Payment" WHERE "societyId"=${societyId}::uuid
    `);
    const current=Number(collections[0]?.currentPaise??0),previous=Number(collections[0]?.previousPaise??0);
    return {
      overdueCount:Number(overdue[0]?.count??0),
      overduePaise:Number(overdue[0]?.amountPaise??0),
      overdueOver30Days:Number(overdue[0]?.over30??0),
      collections30dPaise:current,
      previous30dPaise:previous,
      collectionChangePercent:previous>0?Math.round(((current-previous)/previous)*10000)/100:null,
      minimumOverduePaise:minimumPaise,
    };
  }

  async gateAttentionSummary(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{
      overstayCount:number;openIncidents:number;criticalIncidents:number;stalePatrolCount:number;
      criticalIncidentId:string|null;criticalIncidentTitle:string|null;
      oldestOverstayId:string|null;oldestOverstayName:string|null;oldestOverstayMinutes:number|null;
      staleCheckpointId:string|null;staleCheckpointName:string|null;
    }>>(Prisma.sql`
      WITH overstays AS (
        SELECT r."id",r."subjectName",r."enteredAt" FROM "AccessRequest" r
        WHERE r."societyId"=${societyId}::uuid AND r."status"='CHECKED_IN'
          AND r."enteredAt" IS NOT NULL AND r."exitedAt" IS NULL
          AND r."enteredAt"<CURRENT_TIMESTAMP-INTERVAL '4 hours'
      ),
      open_incidents AS (
        SELECT i."id",i."title",i."severity",i."occurredAt" FROM "SecurityIncident" i
        WHERE i."societyId"=${societyId}::uuid AND i."status"='OPEN'
      ),
      stale_checkpoints AS (
        SELECT c."id",c."name",MAX(s."scannedAt") AS "lastScannedAt"
        FROM "PatrolCheckpoint" c
        LEFT JOIN "PatrolScan" s ON s."societyId"=c."societyId" AND s."checkpointId"=c."id"
        WHERE c."societyId"=${societyId}::uuid AND c."active"=TRUE
        GROUP BY c."id",c."name"
        HAVING MAX(s."scannedAt") IS NULL OR MAX(s."scannedAt")<CURRENT_TIMESTAMP-INTERVAL '8 hours'
      )
      SELECT
        (SELECT COUNT(*)::int FROM overstays) AS "overstayCount",
        (SELECT COUNT(*)::int FROM open_incidents) AS "openIncidents",
        (SELECT COUNT(*)::int FROM open_incidents WHERE "severity"='CRITICAL') AS "criticalIncidents",
        (SELECT COUNT(*)::int FROM stale_checkpoints) AS "stalePatrolCount",
        (SELECT "id" FROM open_incidents WHERE "severity"='CRITICAL' ORDER BY "occurredAt" ASC,"id" ASC LIMIT 1) AS "criticalIncidentId",
        (SELECT "title" FROM open_incidents WHERE "severity"='CRITICAL' ORDER BY "occurredAt" ASC,"id" ASC LIMIT 1) AS "criticalIncidentTitle",
        (SELECT "id" FROM overstays ORDER BY "enteredAt" ASC,"id" ASC LIMIT 1) AS "oldestOverstayId",
        (SELECT "subjectName" FROM overstays ORDER BY "enteredAt" ASC,"id" ASC LIMIT 1) AS "oldestOverstayName",
        (SELECT FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-"enteredAt"))/60)::int FROM overstays ORDER BY "enteredAt" ASC,"id" ASC LIMIT 1) AS "oldestOverstayMinutes",
        (SELECT "id" FROM stale_checkpoints ORDER BY "lastScannedAt" ASC NULLS FIRST,"id" ASC LIMIT 1) AS "staleCheckpointId",
        (SELECT "name" FROM stale_checkpoints ORDER BY "lastScannedAt" ASC NULLS FIRST,"id" ASC LIMIT 1) AS "staleCheckpointName"
    `);
    const row=rows[0];
    return {
      overstayCount:Number(row?.overstayCount??0),openIncidents:Number(row?.openIncidents??0),
      criticalIncidents:Number(row?.criticalIncidents??0),stalePatrolCount:Number(row?.stalePatrolCount??0),
      criticalIncidentId:row?.criticalIncidentId??null,criticalIncidentTitle:row?.criticalIncidentTitle??null,
      oldestOverstayId:row?.oldestOverstayId??null,oldestOverstayName:row?.oldestOverstayName??null,
      oldestOverstayMinutes:row?.oldestOverstayMinutes===null||row?.oldestOverstayMinutes===undefined?null:Number(row.oldestOverstayMinutes),
      staleCheckpointId:row?.staleCheckpointId??null,staleCheckpointName:row?.staleCheckpointName??null,
    };
  }

  async securitySummary(societyId:string){
    const counts=await this.prisma.$queryRaw<Array<{eventType:string;count:number}>>(Prisma.sql`
      SELECT "eventType",COUNT(*)::int AS "count" FROM "SecurityEvent"
      WHERE "societyId"=${societyId}::uuid AND "occurredAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
      GROUP BY "eventType" ORDER BY COUNT(*) DESC,"eventType" ASC
    `);
    const recent=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT "id","eventType","reason","occurredAt" FROM "SecurityEvent"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "occurredAt" DESC,"id" DESC LIMIT 20
    `);
    return {windowDays:30,byType:counts,recent};
  }

  async facilitiesSummary(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{
      activeAssets:number;openWorkOrders:number;overdueWorkOrders:number;maintenanceDue30d:number;
      repeatedCorrectiveAssets90d:number;warrantiesExpiring60d:number;
    }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "FacilityAsset" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE') AS "activeAssets",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED')) AS "openWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED') AND "dueAt"<CURRENT_TIMESTAMP) AS "overdueWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityMaintenancePlan" WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND "nextDueAt"<=CURRENT_TIMESTAMP+INTERVAL '30 days') AS "maintenanceDue30d",
        (
          SELECT COUNT(*)::int FROM (
            SELECT w."assetId"
            FROM "FacilityWorkOrder" w
            JOIN "FacilityAsset" a ON a."id"=w."assetId" AND a."societyId"=w."societyId"
            WHERE w."societyId"=${societyId}::uuid
              AND w."workType"='CORRECTIVE'
              AND w."createdAt">=CURRENT_TIMESTAMP-INTERVAL '90 days'
              AND a."status"<>'RETIRED'
            GROUP BY w."assetId"
            HAVING COUNT(*)>=3
          ) recurring
        ) AS "repeatedCorrectiveAssets90d",
        (
          SELECT COUNT(*)::int FROM "FacilityAsset"
          WHERE "societyId"=${societyId}::uuid AND "status"<>'RETIRED'
            AND "warrantyEndsAt" IS NOT NULL
            AND "warrantyEndsAt">=CURRENT_TIMESTAMP
            AND "warrantyEndsAt"<CURRENT_TIMESTAMP+INTERVAL '60 days'
        ) AS "warrantiesExpiring60d"
    `);
    return rows[0]??{
      activeAssets:0,openWorkOrders:0,overdueWorkOrders:0,maintenanceDue30d:0,
      repeatedCorrectiveAssets90d:0,warrantiesExpiring60d:0,
    };
  }

  async vendorSummary(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{activeVendors:number;submittedRequests:number;approvedRequests:number}>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "SocietyVendor" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE') AS "activeVendors",
        (SELECT COUNT(*)::int FROM "ProcurementRequest" WHERE "societyId"=${societyId}::uuid AND "status"='SUBMITTED') AS "submittedRequests",
        (SELECT COUNT(*)::int FROM "ProcurementRequest" WHERE "societyId"=${societyId}::uuid AND "status"='APPROVED') AS "approvedRequests"
    `);
    return rows[0]??{activeVendors:0,submittedRequests:0,approvedRequests:0};
  }

  async residentNotices(societyId:string,userId:string,unitId:string){
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT n."id",n."title",n."category",n."importance",n."requiresAcknowledgement",
             n."publishedAt",n."expiresAt",nr."readAt",nr."acknowledgedAt"
      FROM "Notice" n
      LEFT JOIN "NoticeRecipient" nr
        ON nr."noticeId"=n."id" AND nr."societyId"=n."societyId" AND nr."userId"=${userId}::uuid
      WHERE n."societyId"=${societyId}::uuid
        AND n."status"='PUBLISHED'
        AND n."publishedAt"<=CURRENT_TIMESTAMP
        AND (n."expiresAt" IS NULL OR n."expiresAt">CURRENT_TIMESTAMP)
        AND (
          n."targetUnitId"=${unitId}::uuid
          OR (n."targetUnitId" IS NULL AND n."targetBuildingId" IS NULL)
          OR nr."userId" IS NOT NULL
        )
        AND (
          EXISTS(
            SELECT 1 FROM "UnitOwnership" ow
            WHERE ow."societyId"=${societyId}::uuid AND ow."unitId"=${unitId}::uuid AND ow."userId"=${userId}::uuid
              AND ow."active"=TRUE AND ow."verified"=TRUE AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
          )
          OR (
            n."audience"='OWNER_AND_OCCUPANTS' AND EXISTS(
              SELECT 1 FROM "UnitOccupancy" oc
              WHERE oc."societyId"=${societyId}::uuid AND oc."unitId"=${unitId}::uuid AND oc."userId"=${userId}::uuid
                AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
            )
          )
        )
      ORDER BY CASE n."importance" WHEN 'CRITICAL' THEN 0 WHEN 'IMPORTANT' THEN 1 ELSE 2 END,n."publishedAt" DESC
      LIMIT 20
    `);
  }

  async residentGateStatus(societyId:string,userId:string,unitId:string){
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT v."id",v."name",v."purpose",v."status",v."createdAt",
             vp."id" AS "passId",vp."status" AS "passStatus",vp."validFrom",vp."validUntil",vp."checkedInAt",vp."checkedOutAt"
      FROM "Visitor" v
      LEFT JOIN "VisitorPass" vp ON vp."visitorId"=v."id" AND vp."societyId"=v."societyId"
      WHERE v."societyId"=${societyId}::uuid AND v."unitId"=${unitId}::uuid AND v."hostUserId"=${userId}::uuid
      ORDER BY v."createdAt" DESC,vp."createdAt" DESC
      LIMIT 20
    `);
  }

  async residentUtilities(societyId:string,unitId:string){
    const [meters,charges,attention]=await Promise.all([
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT m."id",m."code",m."label",m."meterType",
          latest."readingAt" AS "latestReadingAt",latest."value"::text AS "latestReadingValue",
          previous."value"::text AS "previousReadingValue",
          CASE
            WHEN latest."readingKind"='RESET' OR previous."readingKind"='RESET' THEN NULL
            WHEN previous."value" IS NULL OR latest."value"<previous."value" THEN NULL
            ELSE (latest."value"-previous."value")::text
          END AS "latestConsumption",
          EXISTS(
            SELECT 1
            FROM "UtilityIntegrationMeterMap" map
            JOIN "UtilityIntegration" integration
              ON integration."id"=map."integrationId" AND integration."societyId"=map."societyId"
            WHERE map."societyId"=m."societyId" AND map."meterId"=m."id"
              AND map."active"=TRUE AND integration."status"='ACTIVE'
          ) AS "providerLinked"
        FROM "UtilityMeter" m
        LEFT JOIN LATERAL (
          SELECT r."readingAt",r."value",r."readingKind"
          FROM "UtilityReading" r
          WHERE r."societyId"=m."societyId" AND r."meterId"=m."id"
          ORDER BY r."readingAt" DESC LIMIT 1
        ) latest ON TRUE
        LEFT JOIN LATERAL (
          SELECT r."value",r."readingKind"
          FROM "UtilityReading" r
          WHERE r."societyId"=m."societyId" AND r."meterId"=m."id"
          ORDER BY r."readingAt" DESC OFFSET 1 LIMIT 1
        ) previous ON TRUE
        WHERE m."societyId"=${societyId}::uuid AND m."unitId"=${unitId}::uuid AND m."active"=TRUE
        ORDER BY m."meterType",m."code"
        LIMIT 20
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT d."id" AS "chargeDraftId",d."meterId",d."periodStart",d."periodEnd",
          d."consumption"::text AS "consumption",d."totalPaise",d."issuedAt",
          m."code" AS "meterCode",m."meterType",i."invoiceNumber",i."status" AS "invoiceStatus"
        FROM "UtilityChargeDraft" d
        JOIN "UtilityMeter" m ON m."id"=d."meterId" AND m."societyId"=d."societyId"
        JOIN "MaintenanceInvoice" i ON i."sourceUtilityChargeDraftId"=d."id" AND i."societyId"=d."societyId"
        WHERE d."societyId"=${societyId}::uuid AND d."unitId"=${unitId}::uuid AND d."status"='ISSUED'
        ORDER BY d."periodEnd" DESC,d."createdAt" DESC
        LIMIT 12
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        WITH ordered AS (
          SELECT r."meterId",m."code",m."label",m."meterType",r."readingAt",r."value",r."readingKind",
            LAG(r."value") OVER (PARTITION BY r."meterId" ORDER BY r."readingAt") AS "previousValue",
            LAG(r."readingKind") OVER (PARTITION BY r."meterId" ORDER BY r."readingAt") AS "previousKind"
          FROM "UtilityReading" r
          JOIN "UtilityMeter" m ON m."id"=r."meterId" AND m."societyId"=r."societyId"
          WHERE r."societyId"=${societyId}::uuid AND m."unitId"=${unitId}::uuid AND m."active"=TRUE
        ),
        deltas AS (
          SELECT *,
            CASE
              WHEN "readingKind"='RESET' OR "previousKind"='RESET' OR "previousValue" IS NULL OR "value"<"previousValue" THEN NULL
              ELSE ("value"-"previousValue")::numeric
            END AS delta,
            ROW_NUMBER() OVER (PARTITION BY "meterId" ORDER BY "readingAt" DESC) AS rn
          FROM ordered
        ),
        rollup AS (
          SELECT "meterId","code","label","meterType",
            MAX(delta) FILTER (WHERE rn=1) AS latest,
            AVG(delta) FILTER (WHERE rn BETWEEN 2 AND 6 AND delta IS NOT NULL) AS baseline
          FROM deltas
          GROUP BY "meterId","code","label","meterType"
        )
        SELECT "meterId","code","label","meterType",
          latest::text AS "latestConsumption",
          baseline::text AS "recentBaselineAverage",
          CASE WHEN latest IS NOT NULL AND baseline>0 THEN ROUND(((latest-baseline)/baseline*100)::numeric,1)::text ELSE NULL END AS "changePercent",
          CASE
            WHEN latest IS NULL OR baseline IS NULL THEN 'INSUFFICIENT_EVIDENCE'
            WHEN latest>baseline*1.5 THEN 'HIGHER_THAN_RECENT'
            WHEN latest<baseline*0.5 THEN 'LOWER_THAN_RECENT'
            ELSE 'NORMAL_RANGE'
          END AS "attention"
        FROM rollup
        ORDER BY CASE WHEN latest>baseline*1.5 THEN 0 ELSE 1 END,"code"
        LIMIT 20
      `),
    ]);
    return {
      meters,
      recentCharges:charges,
      consumptionAttention:attention,
      providerLinkedCount:meters.filter((meter)=>meter.providerLinked===true).length,
      prepaidBalanceAvailable:false,
      rechargeExecutionAvailable:false,
      boundary:'Utility usage and attention are grounded in recorded meter evidence. A higher recent delta is a deterministic comparison signal, not a leak, fault or billing diagnosis. Prepaid balance and recharge execution require an authoritative provider adapter and are not inferred.',
    };
  }

  async residentRequests(societyId:string,userId:string,unitId:string){
    const requests=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT "id","title","category","status","priority","createdAt","updatedAt","resolvedAt","closedAt"
      FROM "HelpdeskTicket"
      WHERE "societyId"=${societyId}::uuid
        AND "unitId"=${unitId}::uuid
        AND "category" LIKE 'RESIDENT_REQUEST:%' AND "createdById"=${userId}::uuid
      ORDER BY "createdAt" DESC
      LIMIT 20
    `);
    return {
      requests,
      boundary:'Aaraagate reports the audited request status only. Certificate, NOC, no-dues or permission validity remains a society decision.',
    };
  }

  async governanceSummary(societyId:string){
    const [meetings,resolutions,actions]=await Promise.all([
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingType","status","title","scheduledAt","heldAt","location","quorumRequired","quorumPresent"
        FROM "GovernanceMeeting" WHERE "societyId"=${societyId}::uuid ORDER BY "scheduledAt" DESC LIMIT 20
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingId","title","status","approvalRequired","approvalRecorded","recordedAt"
        FROM "GovernanceResolution" WHERE "societyId"=${societyId}::uuid ORDER BY "recordedAt" DESC LIMIT 20
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingId","title","status","ownerUserId","dueAt","completedAt"
        FROM "GovernanceActionItem" WHERE "societyId"=${societyId}::uuid
        ORDER BY COALESCE("dueAt","createdAt") DESC LIMIT 20
      `),
    ]);
    return {meetings,resolutions,actions};
  }

  async discovery(societyId:string){
    const amenities=await this.prisma.$queryRaw<Array<{id:string;name:string;location:string|null;requiresApproval:boolean}>>(Prisma.sql`
      SELECT "id","name","location","requiresApproval" FROM "Amenity"
      WHERE "societyId"=${societyId}::uuid AND "active"=TRUE ORDER BY "name" ASC LIMIT 20
    `);
    const services=await this.prisma.$queryRaw<Array<{id:string;name:string;pricePaise:number;providerName:string;categoryName:string}>>(Prisma.sql`
      SELECT so."id",so."name",so."pricePaise",sp."businessName" AS "providerName",sc."name" AS "categoryName"
      FROM "ServiceOffering" so
      JOIN "ServiceProvider" sp ON sp."id"=so."providerId" AND sp."active"=TRUE AND sp."verification"='VERIFIED'
      JOIN "ServiceCategory" sc ON sc."id"=so."categoryId" AND sc."active"=TRUE
      JOIN "ServiceProviderSociety" sps ON sps."providerId"=sp."id" AND sps."societyId"=${societyId}::uuid AND sps."status"='APPROVED'
      WHERE so."active"=TRUE ORDER BY so."name" ASC LIMIT 20
    `);
    return {amenities,services};
  }


}
