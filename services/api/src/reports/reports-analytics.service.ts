import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS=24*60*60*1000;
const DEFAULT_WINDOW_DAYS=30;
const MAX_WINDOW_DAYS=366;

@Injectable()
export class ReportsAnalyticsService{
  constructor(private readonly prisma:PrismaService){}

  async journeyFunnel(societyId:string,from?:string,to?:string){
    const range=this.dateRange(from,to);
    const [visitorRows,helpdeskRows,serviceRows,paymentRows]=await Promise.all([
      this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte})::int AS requested,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte} AND "status" IN ('APPROVED','CHECKED_IN','CHECKED_OUT'))::int AS approved,
          COUNT(*) FILTER (WHERE "enteredAt" BETWEEN ${range.gte} AND ${range.lte})::int AS entered,
          COUNT(*) FILTER (WHERE "exitedAt" BETWEEN ${range.gte} AND ${range.lte})::int AS exited
        FROM "AccessRequest"
        WHERE "societyId"=${societyId}::uuid AND "subjectType"='VISITOR'
      `),
      this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte})::int AS created,
          COUNT(*) FILTER (WHERE "resolvedAt" BETWEEN ${range.gte} AND ${range.lte})::int AS resolved,
          COUNT(*) FILTER (WHERE "closedAt" BETWEEN ${range.gte} AND ${range.lte})::int AS closed
        FROM "HelpdeskTicket" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte})::int AS requested,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte} AND "status" IN ('CONFIRMED','IN_PROGRESS','COMPLETED'))::int AS confirmed,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte} AND "status" IN ('IN_PROGRESS','COMPLETED'))::int AS inProgress,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte} AND "status"='COMPLETED')::int AS completed
        FROM "ServiceBooking" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte})::int AS created,
          COUNT(*) FILTER (WHERE "completedAt" BETWEEN ${range.gte} AND ${range.lte} AND "status"='CAPTURED')::int AS captured,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte} AND "status"='FAILED')::int AS failed
        FROM "Payment" WHERE "societyId"=${societyId}::uuid
      `),
    ]);
    return {
      range:{from:range.gte.toISOString(),to:range.lte.toISOString()},
      visitor:visitorRows[0]??{},
      helpdesk:helpdeskRows[0]??{},
      services:serviceRows[0]??{},
      payments:paymentRows[0]??{},
      source:'authoritative-domain-records',
    };
  }

  async operationsDashboard(societyId:string,from?:string,to?:string){
    const range=this.dateRange(from,to);
    const [helpdeskRows,facilityRows,incidentRows]=await Promise.all([
      this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "status" NOT IN ('RESOLVED','CLOSED'))::int AS open,
          COUNT(*) FILTER (WHERE "slaState"='RESPONSE_BREACHED')::int AS responseBreached,
          COUNT(*) FILTER (WHERE "slaState"='RESOLUTION_BREACHED')::int AS resolutionBreached,
          COUNT(*) FILTER (WHERE "resolvedAt" BETWEEN ${range.gte} AND ${range.lte})::int AS resolvedInRange
        FROM "HelpdeskTicket" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "status"='OPEN')::int AS open,
          COUNT(*) FILTER (WHERE "status"='IN_PROGRESS')::int AS inProgress,
          COUNT(*) FILTER (WHERE "status"='COMPLETED' AND "completedAt" BETWEEN ${range.gte} AND ${range.lte})::int AS completedInRange,
          COUNT(*) FILTER (WHERE "status" IN ('OPEN','IN_PROGRESS') AND "dueAt" IS NOT NULL AND "dueAt"<CURRENT_TIMESTAMP)::int AS overdue,
          COUNT(*) FILTER (WHERE "status" IN ('OPEN','IN_PROGRESS') AND "priority"='CRITICAL')::int AS criticalOpen
        FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "status"='ACTIVE')::int AS active,
          COUNT(*) FILTER (WHERE "status"='ACKNOWLEDGED')::int AS acknowledged,
          COUNT(*) FILTER (WHERE "status" IN ('ACTIVE','ACKNOWLEDGED') AND "severity"='CRITICAL')::int AS criticalOpen,
          COUNT(*) FILTER (WHERE "resolvedAt" BETWEEN ${range.gte} AND ${range.lte})::int AS resolvedInRange,
          COUNT(*) FILTER (WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte})::int AS createdInRange
        FROM "SosIncident" WHERE "societyId"=${societyId}::uuid
      `),
    ]);
    return {
      range:{from:range.gte.toISOString(),to:range.lte.toISOString()},
      helpdesk:helpdeskRows[0]??{},
      facilities:facilityRows[0]??{},
      incidents:incidentRows[0]??{},
      source:'authoritative-domain-records',
    };
  }

  async outcomes(societyId:string,from?:string,to?:string,includeFinance=false){
    const range=this.dateRange(from,to);
    const [
      financeRows,ageingRows,reconciliationRows,helpdeskRows,gateRows,guardRows,
      amenityRows,notificationRows,serviceRows,adoptionRows,usageRows,
    ]=await Promise.all([
      includeFinance?this.prisma.$queryRaw<Array<{billedPaise:bigint|number;collectedPaise:bigint|number}>>(Prisma.sql`
        SELECT
          COALESCE(SUM("amountPaise") FILTER (WHERE "issuedAt" BETWEEN ${range.gte} AND ${range.lte} AND "status"<>'VOID'),0)::bigint AS "billedPaise",
          COALESCE(SUM("amountPaise") FILTER (
            WHERE "issuedAt" BETWEEN ${range.gte} AND ${range.lte}
              AND "status"='PAID' AND "paidAt" IS NOT NULL AND "paidAt"<=${range.lte}
          ),0)::bigint AS "collectedPaise"
        FROM "MaintenanceInvoice" WHERE "societyId"=${societyId}::uuid
      `):Promise.resolve([]),
      includeFinance?this.prisma.$queryRaw<Array<Record<string,bigint|number>>>(Prisma.sql`
        SELECT
          COALESCE(SUM("amountPaise") FILTER (WHERE "status"='ISSUED' AND "dueDate">=CURRENT_DATE),0)::bigint AS "currentPaise",
          COALESCE(SUM("amountPaise") FILTER (WHERE "status"='ISSUED' AND "dueDate"<CURRENT_DATE AND "dueDate">=CURRENT_DATE-30),0)::bigint AS "days1To30Paise",
          COALESCE(SUM("amountPaise") FILTER (WHERE "status"='ISSUED' AND "dueDate"<CURRENT_DATE-30 AND "dueDate">=CURRENT_DATE-60),0)::bigint AS "days31To60Paise",
          COALESCE(SUM("amountPaise") FILTER (WHERE "status"='ISSUED' AND "dueDate"<CURRENT_DATE-60 AND "dueDate">=CURRENT_DATE-90),0)::bigint AS "days61To90Paise",
          COALESCE(SUM("amountPaise") FILTER (WHERE "status"='ISSUED' AND "dueDate"<CURRENT_DATE-90),0)::bigint AS "days90PlusPaise"
        FROM "MaintenanceInvoice" WHERE "societyId"=${societyId}::uuid
      `):Promise.resolve([]),
      includeFinance?this.prisma.$queryRaw<Array<{open:number}>>(Prisma.sql`
        SELECT COUNT(*)::int AS "open" FROM "PaymentReconciliationCase"
        WHERE "societyId"=${societyId}::uuid AND "status"<>'RESOLVED'
      `):Promise.resolve([]),
      this.prisma.$queryRaw<Array<{resolved:number;met:number;breached:number}>>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "resolved",
          COUNT(*) FILTER (
            WHERE "resolutionDueAt" IS NOT NULL
              AND COALESCE("resolvedAt","closedAt") IS NOT NULL
              AND COALESCE("resolvedAt","closedAt")<="resolutionDueAt"
          )::int AS "met",
          COUNT(*) FILTER (
            WHERE "resolutionDueAt" IS NOT NULL
              AND COALESCE("resolvedAt","closedAt") IS NOT NULL
              AND COALESCE("resolvedAt","closedAt")>"resolutionDueAt"
          )::int AS "breached"
        FROM "HelpdeskTicket"
        WHERE "societyId"=${societyId}::uuid
          AND COALESCE("resolvedAt","closedAt") BETWEEN ${range.gte} AND ${range.lte}
      `),
      this.prisma.$queryRaw<Array<{processed:number;avgProcessingSeconds:number|null;avgApprovalSeconds:number|null}>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE ar."enteredAt" BETWEEN ${range.gte} AND ${range.lte})::int AS "processed",
          ROUND(AVG(EXTRACT(EPOCH FROM (ar."enteredAt"-ar."createdAt"))) FILTER (
            WHERE ar."enteredAt" BETWEEN ${range.gte} AND ${range.lte} AND ar."enteredAt">=ar."createdAt"
          )::numeric,2)::float8 AS "avgProcessingSeconds",
          ROUND(AVG(EXTRACT(EPOCH FROM (approved."approvedAt"-ar."createdAt"))) FILTER (
            WHERE approved."approvedAt" BETWEEN ${range.gte} AND ${range.lte} AND approved."approvedAt">=ar."createdAt"
          )::numeric,2)::float8 AS "avgApprovalSeconds"
        FROM "AccessRequest" ar
        LEFT JOIN LATERAL (
          SELECT MIN(ae."occurredAt") AS "approvedAt"
          FROM "AuditEvent" ae
          WHERE ae."societyId"=ar."societyId" AND ae."accessRequestId"=ar."id" AND ae."event"='ACCESS_APPROVED'
        ) approved ON TRUE
        WHERE ar."societyId"=${societyId}::uuid AND ar."subjectType"='VISITOR'
      `),
      this.prisma.$queryRaw<Array<Record<string,bigint|number>>>(Prisma.sql`
        SELECT
          COALESCE(SUM("syncRuns"),0)::bigint AS "syncRuns",
          COALESCE(SUM("actionsConsidered"),0)::bigint AS "actionsConsidered",
          COALESCE(SUM("actionsSynced"),0)::bigint AS "actionsSynced",
          COALESCE(SUM("actionsRetried"),0)::bigint AS "actionsRetried",
          COALESCE(SUM("actionsUnresolved"),0)::bigint AS "actionsUnresolved",
          COALESCE(SUM("reviewRequired"),0)::bigint AS "reviewRequired"
        FROM "GuardOfflineSyncMetric"
        WHERE "societyId"=${societyId}::uuid AND "bucketDate" BETWEEN ${range.gte}::date AND ${range.lte}::date
      `),
      this.prisma.$queryRaw<Array<{activeAmenities:number;confirmedBookings:number;distinctUsers:number;bookingHours:number}>>(Prisma.sql`
        SELECT
          (SELECT COUNT(*)::int FROM "Amenity" WHERE "societyId"=${societyId}::uuid AND "active"=TRUE) AS "activeAmenities",
          COUNT(*) FILTER (WHERE b."status"='CONFIRMED')::int AS "confirmedBookings",
          COUNT(DISTINCT b."userId") FILTER (WHERE b."status"='CONFIRMED')::int AS "distinctUsers",
          COALESCE(ROUND((SUM(EXTRACT(EPOCH FROM (b."endsAt"-b."startsAt"))/3600.0) FILTER (WHERE b."status"='CONFIRMED'))::numeric,2),0)::float8 AS "bookingHours"
        FROM "AmenityBooking" b
        WHERE b."societyId"=${societyId}::uuid AND b."startsAt" BETWEEN ${range.gte} AND ${range.lte}
      `),
      this.prisma.$queryRaw<Array<{attempted:number;dispatched:number;retried:number}>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "attemptCount">0)::int AS "attempted",
          COUNT(*) FILTER (WHERE "status"='DISPATCHED')::int AS "dispatched",
          COUNT(*) FILTER (WHERE "attemptCount">1)::int AS "retried"
        FROM "NoticeDispatch"
        WHERE "societyId"=${societyId}::uuid AND "createdAt" BETWEEN ${range.gte} AND ${range.lte}
      `),
      this.prisma.$queryRaw<Array<{bookings:number;completed:number;cancelled:number;distinctBookers:number}>>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "bookings",
          COUNT(*) FILTER (WHERE "status"='COMPLETED')::int AS "completed",
          COUNT(*) FILTER (WHERE "status"='CANCELLED')::int AS "cancelled",
          COUNT(DISTINCT "residentUserId")::int AS "distinctBookers"
        FROM "ServiceBooking"
        WHERE "societyId"=${societyId}::uuid AND "createdAt" BETWEEN ${range.gte} AND ${range.lte}
      `),
      this.prisma.$queryRaw<Array<{eligibleResidents:number;activeResidents:number}>>(Prisma.sql`
        WITH eligible AS (
          SELECT DISTINCT "userId" FROM "UnitOccupancy"
          WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
            AND "effectiveFrom"<=${range.lte} AND ("effectiveTo" IS NULL OR "effectiveTo">=${range.gte})
          UNION
          SELECT DISTINCT "userId" FROM "UnitOwnership"
          WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND "verified"=TRUE
            AND "effectiveFrom"<=${range.lte} AND ("effectiveTo" IS NULL OR "effectiveTo">=${range.gte})
        )
        SELECT
          COUNT(*)::int AS "eligibleResidents",
          COUNT(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM "Session" s WHERE s."userId"=eligible."userId" AND s."societyId"=${societyId}::uuid
              AND s."createdAt" BETWEEN ${range.gte} AND ${range.lte}
          ))::int AS "activeResidents"
        FROM eligible
      `),
      this.prisma.$queryRaw<Array<{serviceDiscoverers:number;serviceBookers:number;propertySwitchers:number}>>(Prisma.sql`
        SELECT
          COUNT(DISTINCT "subjectHash") FILTER (WHERE "eventType"='SERVICE_DISCOVERY_VIEWED')::int AS "serviceDiscoverers",
          COUNT(DISTINCT "subjectHash") FILTER (WHERE "eventType"='SERVICE_BOOKING_CREATED')::int AS "serviceBookers",
          COUNT(DISTINCT "subjectHash") FILTER (WHERE "eventType"='PROPERTY_CONTEXT_SWITCHED')::int AS "propertySwitchers"
        FROM "OperationalUsageEvent"
        WHERE "societyId"=${societyId}::uuid AND "occurredAt" BETWEEN ${range.gte} AND ${range.lte}
      `),
    ]);

    const finance=financeRows[0];
    const ageing=ageingRows[0]??{};
    const helpdesk=helpdeskRows[0]??{resolved:0,met:0,breached:0};
    const guard=guardRows[0]??{};
    const services=serviceRows[0]??{bookings:0,completed:0,cancelled:0,distinctBookers:0};
    const adoption=adoptionRows[0]??{eligibleResidents:0,activeResidents:0};
    const usage=usageRows[0]??{serviceDiscoverers:0,serviceBookers:0,propertySwitchers:0};
    const number=(value:unknown)=>Number(value??0);
    const rate=(numerator:number,denominator:number)=>denominator>0?Math.round((numerator/denominator)*10000)/100:null;

    return {
      range:{from:range.gte.toISOString(),to:range.lte.toISOString()},
      finance:includeFinance?{
        billedPaise:number(finance?.billedPaise),
        collectedPaise:number(finance?.collectedPaise),
        collectionPercent:rate(number(finance?.collectedPaise),number(finance?.billedPaise)),
        outstandingAgeingPaise:{
          current:number(ageing.currentPaise),days1To30:number(ageing.days1To30Paise),
          days31To60:number(ageing.days31To60Paise),days61To90:number(ageing.days61To90Paise),
          days90Plus:number(ageing.days90PlusPaise),
        },
        reconciliationExceptions:number(reconciliationRows[0]?.open),
      }:null,
      helpdesk:{
        resolved:helpdesk.resolved,slaMet:helpdesk.met,slaBreached:helpdesk.breached,
        slaCompliancePercent:rate(helpdesk.met,helpdesk.met+helpdesk.breached),
      },
      gate:gateRows[0]??{processed:0,avgProcessingSeconds:null,avgApprovalSeconds:null},
      guardOfflineSync:{
        syncRuns:number(guard.syncRuns),actionsConsidered:number(guard.actionsConsidered),actionsSynced:number(guard.actionsSynced),
        actionsRetried:number(guard.actionsRetried),actionsUnresolved:number(guard.actionsUnresolved),reviewRequired:number(guard.reviewRequired),
        unresolvedPercent:rate(number(guard.actionsUnresolved),number(guard.actionsConsidered)),
      },
      amenities:amenityRows[0]??{activeAmenities:0,confirmedBookings:0,distinctUsers:0,bookingHours:0},
      notifications:{
        ...(notificationRows[0]??{attempted:0,dispatched:0,retried:0}),
        deliverySuccessPercent:rate(notificationRows[0]?.dispatched??0,notificationRows[0]?.attempted??0),
        scope:'scheduled notice dispatch handoff',
      },
      services:{
        ...services,
        completionPercent:rate(services.completed,services.bookings),
        cancellationPercent:rate(services.cancelled,services.bookings),
        serviceDiscoverers:usage.serviceDiscoverers,
        discoveryToBookingPercent:rate(usage.serviceBookers,usage.serviceDiscoverers),
      },
      adoption:{
        ...adoption,
        activationPercent:rate(adoption.activeResidents,adoption.eligibleResidents),
        propertySwitchers:usage.propertySwitchers,
      },
      evidence:'authoritative-domain-records-and-pseudonymous-usage-events',
    };
  }

  async platformOutcomes(from?:string,to?:string){
    const range=this.dateRange(from,to);
    const [bookings,entries]=await Promise.all([
      this.prisma.$queryRaw<Array<{homeBookings:number;completed:number;cancelled:number;distinctUsers:number}>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "homeId" IS NOT NULL)::int AS "homeBookings",
          COUNT(*) FILTER (WHERE "homeId" IS NOT NULL AND "status"='COMPLETED')::int AS "completed",
          COUNT(*) FILTER (WHERE "homeId" IS NOT NULL AND "status"='CANCELLED')::int AS "cancelled",
          COUNT(DISTINCT "userId") FILTER (WHERE "homeId" IS NOT NULL)::int AS "distinctUsers"
        FROM "ConsumerServiceBooking"
        WHERE "createdAt" BETWEEN ${range.gte} AND ${range.lte}
      `),
      this.prisma.$queryRaw<Array<{independentHomeEntrants:number}>>(Prisma.sql`
        SELECT COUNT(DISTINCT "subjectHash")::int AS "independentHomeEntrants"
        FROM "OperationalUsageEvent"
        WHERE "societyId" IS NULL AND "eventType"='INDEPENDENT_HOME_ENTERED'
          AND "occurredAt" BETWEEN ${range.gte} AND ${range.lte}
      `),
    ]);
    const row=bookings[0]??{homeBookings:0,completed:0,cancelled:0,distinctUsers:0};
    const rate=(n:number,d:number)=>d>0?Math.round((n/d)*10000)/100:null;
    return {
      range:{from:range.gte.toISOString(),to:range.lte.toISOString()},
      independentHome:{
        ...row,
        entrants:entries[0]?.independentHomeEntrants??0,
        bookingEngagementPercent:rate(row.distinctUsers,entries[0]?.independentHomeEntrants??0),
        completionPercent:rate(row.completed,row.homeBookings),
        cancellationPercent:rate(row.cancelled,row.homeBookings),
      },
      evidence:'platform-consumer-bookings-and-pseudonymous-usage-events',
    };
  }

  private dateRange(from?:string,to?:string){
    const end=to?new Date(to):new Date();
    const start=from?new Date(from):new Date(end.getTime()-DEFAULT_WINDOW_DAYS*DAY_MS);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))throw new BadRequestException('from/to must be valid ISO-8601 dates');
    if(start>end)throw new BadRequestException('from must be before to');
    if(end.getTime()-start.getTime()>MAX_WINDOW_DAYS*DAY_MS)throw new BadRequestException(`Report range cannot exceed ${MAX_WINDOW_DAYS} days`);
    return {gte:start,lte:end};
  }
}
