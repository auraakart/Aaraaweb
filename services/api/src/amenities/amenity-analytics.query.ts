import { PrismaService } from '../prisma/prisma.service';

export class AmenityAnalyticsQuery {
  constructor(private readonly prisma: PrismaService) {}

  async run(societyId: string) {
    const [summaryRows,demandRows]=await Promise.all([
      this.prisma.$queryRaw<Array<{
        bookingCount:number;completedCount:number;checkedInCount:number;noShowCount:number;
        cancelledCount:number;rejectedCount:number;waitingCount:number;promotedCount:number;
      }>>`
        SELECT
          COUNT(b."id")::int AS "bookingCount",
          COUNT(b."id") FILTER (WHERE b."status"='COMPLETED')::int AS "completedCount",
          COUNT(b."id") FILTER (WHERE b."status"='CHECKED_IN')::int AS "checkedInCount",
          COUNT(b."id") FILTER (WHERE b."status"='NO_SHOW')::int AS "noShowCount",
          COUNT(b."id") FILTER (WHERE b."status"='CANCELLED')::int AS "cancelledCount",
          COUNT(b."id") FILTER (WHERE b."status"='REJECTED')::int AS "rejectedCount",
          (SELECT COUNT(*)::int FROM "AmenityWaitlistEntry" w
             WHERE w."societyId"=${societyId}::uuid AND w."joinedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
               AND w."status"='WAITING') AS "waitingCount",
          (SELECT COUNT(*)::int FROM "AmenityWaitlistEntry" w
             WHERE w."societyId"=${societyId}::uuid AND w."promotedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
               AND w."status"='PROMOTED') AS "promotedCount"
        FROM "AmenityBooking" b
        WHERE b."societyId"=${societyId}::uuid
          AND b."createdAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
      `,
      this.prisma.$queryRaw<Array<{
        amenityId:string;amenityName:string;bookingCount:number;waitlistJoinCount:number;noShowCount:number;
      }>>`
        SELECT a."id" AS "amenityId",a."name" AS "amenityName",
               COUNT(DISTINCT b."id")::int AS "bookingCount",
               COUNT(DISTINCT w."id")::int AS "waitlistJoinCount",
               COUNT(DISTINCT b."id") FILTER (WHERE b."status"='NO_SHOW')::int AS "noShowCount"
        FROM "Amenity" a
        LEFT JOIN "AmenityBooking" b ON b."amenityId"=a."id" AND b."societyId"=a."societyId"
          AND b."createdAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
        LEFT JOIN "AmenityWaitlistEntry" w ON w."amenityId"=a."id" AND w."societyId"=a."societyId"
          AND w."joinedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
        WHERE a."societyId"=${societyId}::uuid
        GROUP BY a."id",a."name"
        HAVING COUNT(DISTINCT b."id")>0 OR COUNT(DISTINCT w."id")>0
        ORDER BY (COUNT(DISTINCT b."id")+COUNT(DISTINCT w."id")) DESC,a."name"
        LIMIT 8
      `,
    ]);
    const summary=summaryRows[0]??{
      bookingCount:0,completedCount:0,checkedInCount:0,noShowCount:0,
      cancelledCount:0,rejectedCount:0,waitingCount:0,promotedCount:0,
    };
    const attendanceEligible=summary.completedCount+summary.noShowCount;
    const attendanceRatePct=attendanceEligible===0?0:Math.round(summary.completedCount*1000/attendanceEligible)/10;
    const cancellationRatePct=summary.bookingCount===0?0:Math.round(summary.cancelledCount*1000/summary.bookingCount)/10;
    const noShowRatePct=attendanceEligible===0?0:Math.round(summary.noShowCount*1000/attendanceEligible)/10;
    const waitlistTracked=summary.waitingCount+summary.promotedCount;
    const waitlistPromotionRatePct=waitlistTracked===0?0:Math.round(summary.promotedCount*1000/waitlistTracked)/10;
    const demandTotal=demandRows.reduce((sum,row)=>sum+row.bookingCount+row.waitlistJoinCount,0);
    return {
      periodDays:30,
      summary:{
        ...summary,
        attendanceEligibleCount:attendanceEligible,
        attendanceRatePct,
        cancellationRatePct,
        noShowRatePct,
        waitlistPromotionRatePct,
      },
      demand:demandRows.map((row,index)=>{
        const demandSignals=row.bookingCount+row.waitlistJoinCount;
        return {
          ...row,
          demandSignals,
          demandRank:index+1,
          demandSharePct:demandTotal===0?0:Math.round(demandSignals*1000/demandTotal)/10,
        };
      }),
      generatedAt:new Date().toISOString(),
      predictive:false,
    };
  }
}
