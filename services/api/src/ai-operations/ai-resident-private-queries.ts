import { Prisma } from '@prisma/client';
import { currentOccupantPropertySql } from '../auth/property-scope.sql';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bounded read-only data projection for private resident vehicle and parcel
 * questions. Every caller must first check role permission and currently
 * selected-unit occupancy; the SQL predicates recheck residency to prevent
 * move-out/revocation races between authorization and retrieval.
 */
export class AiResidentPrivateQueries {
  constructor(private readonly prisma: PrismaService) {}

  async vehicles(societyId:string,userId:string,unitId:string) {
      const rows=await this.prisma.$queryRaw<Array<{plateNumber:string,vehicleType:string,make:string|null}>>(Prisma.sql`
        SELECT v."plateNumber",v."vehicleType",v."make"
        FROM "HouseholdVehicle" v
        JOIN "Household" h ON h."id"=v."householdId" AND h."societyId"=v."societyId"
        WHERE v."societyId"=${societyId}::uuid AND h."unitId"=${unitId}::uuid
          AND v."active"=TRUE
          AND ${currentOccupantPropertySql(societyId,userId,unitId)}
        ORDER BY v."createdAt" DESC,v."id" DESC LIMIT 20
      `);
      const vehicles=rows.map(row=>{
        const plate=String(row.plateNumber??'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
        return {
          plateSuffix:plate.length>=4?plate.slice(-4):'',
          vehicleType:String(row.vehicleType??'').slice(0,32),
          make:String(row.make??'').replace(/\s+/g,' ').trim().slice(0,50),
        };
      });
      const answer=vehicles.length
        ? 'Your current home has '+vehicles.length+' active registered vehicle(s): '
          +vehicles.map(v=>v.vehicleType+(v.make?' ('+v.make+')':'')+' • '+(v.plateSuffix?'plate ending '+v.plateSuffix:'plate unavailable')).join('; ')
          +'. Open Profile → Vehicles for authorized vehicle management.'
        : 'No active household vehicles are recorded for your selected home. Open Profile → Vehicles to review or request changes.';
    return {facts:{vehicles,limitedTo:20},answer};
  }

  async parcels(societyId:string,userId:string,unitId:string) {
      const rows=await this.prisma.$queryRaw<Array<{status:string,courierName:string|null}>>(Prisma.sql`
        SELECT p."status",p."courierName"
        FROM "Parcel" p
        WHERE p."societyId"=${societyId}::uuid
          AND p."unitId"=${unitId}::uuid
          AND p."recipientUserId"=${userId}::uuid
          AND ${currentOccupantPropertySql(societyId,userId,unitId)}
        ORDER BY CASE p."status" WHEN 'RECEIVED' THEN 0 ELSE 1 END,
          p."receivedAt" DESC,p."id" DESC
        LIMIT 20
      `);
      const received=rows.filter(item=>item.status==='RECEIVED');
      const collected=rows.filter(item=>item.status==='COLLECTED').length;
      const returned=rows.filter(item=>item.status==='RETURNED').length;
      const waitingCouriers=received.slice(0,3)
        .map(item=>String(item.courierName??'').replace(/\s+/g,' ').trim().slice(0,60))
        .filter(Boolean);
      const facts={
        waitingCount:received.length,
        collectedCount:collected,
        returnedCount:returned,
        latestRecordsReviewed:rows.length,
        limitedTo:20,
        waitingCourierNames:waitingCouriers,
      };
      const answer=rows.length
        ? 'Among your latest '+rows.length+' parcel record(s), '+received.length
          +' are waiting at the parcel desk, '+collected+' are collected and '
          +returned+' are returned.'
          +(waitingCouriers.length?' Recent couriers: '+waitingCouriers.join(', ')+'.':'')
          +' Open Parcels to see the latest status or generate your own pickup code.'
        : 'No parcels addressed to you were found for the selected home. Open Parcels to check future deliveries.';
    return {facts,answer};
  }
}
