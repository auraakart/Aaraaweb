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
    const rows=await this.prisma.$queryRaw<Array<{activeAssets:number;openWorkOrders:number;overdueWorkOrders:number;maintenanceDue30d:number}>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "FacilityAsset" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE') AS "activeAssets",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED')) AS "openWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED') AND "dueAt"<CURRENT_TIMESTAMP) AS "overdueWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityMaintenancePlan" WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND "nextDueAt"<=CURRENT_TIMESTAMP+INTERVAL '30 days') AS "maintenanceDue30d"
    `);
    return rows[0]??{activeAssets:0,openWorkOrders:0,overdueWorkOrders:0,maintenanceDue30d:0};
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
