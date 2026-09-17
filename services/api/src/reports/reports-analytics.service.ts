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

  private dateRange(from?:string,to?:string){
    const end=to?new Date(to):new Date();
    const start=from?new Date(from):new Date(end.getTime()-DEFAULT_WINDOW_DAYS*DAY_MS);
    if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))throw new BadRequestException('from/to must be valid ISO-8601 dates');
    if(start>end)throw new BadRequestException('from must be before to');
    if(end.getTime()-start.getTime()>MAX_WINDOW_DAYS*DAY_MS)throw new BadRequestException(`Report range cannot exceed ${MAX_WINDOW_DAYS} days`);
    return {gte:start,lte:end};
  }
}
