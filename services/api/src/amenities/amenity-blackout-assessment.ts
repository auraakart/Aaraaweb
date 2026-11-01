import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AmenityPolicyEngine } from './amenity-policy.engine';

export async function assessAmenityBlackout(
    tx:Prisma.TransactionClient,
    policy:AmenityPolicyEngine,
    societyId:string,
    amenityId:string,
    input:{startsAt:string;endsAt:string;kind?:'MAINTENANCE'|'CLOSURE'|'PRIVATE_EVENT';reason:string},
  ){
    const startsAt=new Date(input.startsAt),endsAt=new Date(input.endsAt);
    if(!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||startsAt>=endsAt){
      throw new BadRequestException('A valid blackout window is required');
    }
    if(endsAt.getTime()<=Date.now()) throw new BadRequestException('Amenity blackout must end in the future');
    const reason=input.reason.trim();
    if(reason.length<3) throw new BadRequestException('Blackout reason must contain at least 3 characters');
    const kind=input.kind??'MAINTENANCE';
    const [amenity]=await tx.$queryRaw<Array<{schedule:unknown}>>`
      SELECT "schedule" FROM "Amenity"
      WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
      LIMIT 1
    `;
    if(!amenity) throw new NotFoundException('Amenity not found');
    if(policy.findScheduleBlackout(amenity.schedule,startsAt,endsAt)){
      throw new ConflictException('Amenity already has an overlapping configured blackout');
    }
    const impactedBookings=await tx.$queryRaw<Array<{id:string;unitNumber:string;buildingName:string;status:string;startsAt:Date;endsAt:Date}>>`
      SELECT b."id",u."number" AS "unitNumber",bd."name" AS "buildingName",b."status"::text AS "status",b."startsAt",b."endsAt"
      FROM "AmenityBooking" b
      JOIN "Unit" u ON u."id"=b."unitId" AND u."societyId"=b."societyId"
      JOIN "Building" bd ON bd."id"=u."buildingId" AND bd."societyId"=u."societyId"
      WHERE b."societyId"=${societyId}::uuid AND b."amenityId"=${amenityId}::uuid
        AND b."status" IN ('PENDING','CONFIRMED','CHECKED_IN')
        AND b."startsAt"<${endsAt} AND b."endsAt">${startsAt}
      ORDER BY b."startsAt" ASC
    `;
    const impactedWaitlist=await tx.$queryRaw<Array<{id:string;unitNumber:string;startsAt:Date;endsAt:Date}>>`
      SELECT w."id",u."number" AS "unitNumber",w."startsAt",w."endsAt"
      FROM "AmenityWaitlistEntry" w
      JOIN "Unit" u ON u."id"=w."unitId" AND u."societyId"=w."societyId"
      WHERE w."societyId"=${societyId}::uuid AND w."amenityId"=${amenityId}::uuid
        AND w."status"='WAITING'
        AND w."startsAt"<${endsAt} AND w."endsAt">${startsAt}
      ORDER BY w."startsAt" ASC,w."joinedAt" ASC
    `;
    return {
      blackout:{start:startsAt.toISOString(),end:endsAt.toISOString(),kind,reason},
      impactedBookings,
      impactedWaitlist,
      canApply:impactedBookings.length===0&&impactedWaitlist.length===0,
      mutationPerformed:false,
      automaticCancellation:false,
      boundary:'Preview only. Resolve overlapping bookings and waitlist entries explicitly before applying the blackout.',
    };
  }
