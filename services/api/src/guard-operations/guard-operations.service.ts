import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type WatchlistInput={kind:'WATCH'|'DENY'|'INFO';subjectName:string;phone?:string;vehicleNumber?:string;reason:string;validFrom?:string;validUntil?:string};
export type GatePassInput={gateId?:string;unitId?:string;referenceCode:string;movementType:'MATERIAL_IN'|'MATERIAL_OUT'|'MOVE_IN'|'MOVE_OUT';subjectName:string;itemDescription:string;vehicleNumber?:string;validFrom?:string;validUntil?:string};
export type CheckpointInput={code:string;name:string;location?:string};
export type IncidentInput={gateId?:string;severity:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';category:string;title:string;description?:string;mediaRefs?:string[];occurredAt?:string};

@Injectable()
export class GuardOperationsService {
  constructor(private readonly prisma:PrismaService) {}

  async summary(societyId:string,overstayMinutes=240){
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "AccessRequest" r WHERE r."societyId"=${societyId}::uuid AND r."status"='CHECKED_IN' AND r."enteredAt" IS NOT NULL AND r."exitedAt" IS NULL AND r."enteredAt" < CURRENT_TIMESTAMP - (${overstayMinutes} * INTERVAL '1 minute')) AS "overstayCount",
        (SELECT COUNT(*)::int FROM "GuardWatchlistEntry" w WHERE w."societyId"=${societyId}::uuid AND w."active"=true AND (w."validFrom" IS NULL OR w."validFrom"<=CURRENT_TIMESTAMP) AND (w."validUntil" IS NULL OR w."validUntil">CURRENT_TIMESTAMP)) AS "watchlistCount",
        (SELECT COUNT(*)::int FROM "MaterialGatePass" p WHERE p."societyId"=${societyId}::uuid AND p."status"='OPEN' AND p."validFrom"<=CURRENT_TIMESTAMP AND (p."validUntil" IS NULL OR p."validUntil">CURRENT_TIMESTAMP)) AS "openPassCount",
        (SELECT COUNT(*)::int FROM "SecurityIncident" i WHERE i."societyId"=${societyId}::uuid AND i."status"='OPEN') AS "openIncidentCount",
        (SELECT COUNT(*)::int FROM "PatrolCheckpoint" c WHERE c."societyId"=${societyId}::uuid AND c."active"=true) AS "activeCheckpointCount"
    `);return rows[0]??{overstayCount:0,watchlistCount:0,openPassCount:0,openIncidentCount:0,activeCheckpointCount:0};
  }

  overstays(societyId:string,minutes=240){
    if(!Number.isInteger(minutes)||minutes<30||minutes>10080)throw new BadRequestException('Overstay threshold must be between 30 and 10080 minutes');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT r."id",r."unitId",r."subjectType"::text AS "subjectType",r."subjectName",r."subjectPhone",r."enteredAt",r."metadata",
             u."number" AS "unitNumber",b."name" AS "buildingName",
             FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-r."enteredAt"))/60)::int AS "minutesInside"
      FROM "AccessRequest" r JOIN "Unit" u ON u."id"=r."unitId" AND u."societyId"=r."societyId"
      JOIN "Building" b ON b."id"=u."buildingId"
      WHERE r."societyId"=${societyId}::uuid AND r."status"='CHECKED_IN' AND r."enteredAt" IS NOT NULL AND r."exitedAt" IS NULL
        AND r."enteredAt" < CURRENT_TIMESTAMP - (${minutes} * INTERVAL '1 minute')
      ORDER BY r."enteredAt" ASC LIMIT 300
    `);
  }

  async escalateOverstay(societyId:string,userId:string,accessRequestId:string,note?:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;subjectName:string;enteredAt:Date;unitNumber:string;buildingName:string}>>(Prisma.sql`
        SELECT r."id",r."subjectName",r."enteredAt",u."number" AS "unitNumber",b."name" AS "buildingName"
        FROM "AccessRequest" r
        JOIN "Unit" u ON u."id"=r."unitId" AND u."societyId"=r."societyId"
        JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=r."societyId"
        WHERE r."id"=${accessRequestId}::uuid AND r."societyId"=${societyId}::uuid
          AND r."status"='CHECKED_IN' AND r."enteredAt" IS NOT NULL AND r."exitedAt" IS NULL
          AND r."enteredAt"<CURRENT_TIMESTAMP-INTERVAL '4 hours'
        LIMIT 1
        FOR UPDATE OF r
      `);
      const overstay=rows[0];if(!overstay)throw new ConflictException('Access request is not an active four-hour overstay');
      const sourceRef=`access-request:${accessRequestId}`;
      const existing=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","status","severity","title","occurredAt" FROM "SecurityIncident"
        WHERE "societyId"=${societyId}::uuid AND "category"='OVERSTAY'
          AND ("sourceKey"=${sourceRef} OR ("sourceKey" IS NULL AND "mediaRefs" @> ${JSON.stringify([sourceRef])}::jsonb))
        ORDER BY ("sourceKey"=${sourceRef}) DESC,"occurredAt" ASC LIMIT 1
      `);
      if(existing[0])return {...existing[0],idempotent:true};
      const description=`Access request ${accessRequestId} has remained inside since ${overstay.enteredAt.toISOString()} for ${overstay.buildingName} ${overstay.unitNumber}.${note?.trim()?` Guard note: ${note.trim()}`:''}`;
      const incident=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "SecurityIncident" ("societyId","guardUserId","severity","category","title","description","mediaRefs","sourceKey")
        VALUES (${societyId}::uuid,${userId}::uuid,'HIGH','OVERSTAY',${`Visitor overstay · ${overstay.subjectName}`},${description},${JSON.stringify([sourceRef])}::jsonb,${sourceRef})
        RETURNING "id","severity","category","title","status","occurredAt"
      `);
      return {...incident[0],idempotent:false};
    });
  }

  watchlist(societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT "id","kind","subjectName","phone","vehicleNumber","reason","active","validFrom","validUntil","createdAt","updatedAt"
    FROM "GuardWatchlistEntry" WHERE "societyId"=${societyId}::uuid AND "active"=true
      AND ("validFrom" IS NULL OR "validFrom"<=CURRENT_TIMESTAMP) AND ("validUntil" IS NULL OR "validUntil">CURRENT_TIMESTAMP)
    ORDER BY CASE "kind" WHEN 'DENY' THEN 0 WHEN 'WATCH' THEN 1 ELSE 2 END,"updatedAt" DESC LIMIT 500
  `);}

  async createWatchlist(societyId:string,userId:string,input:WatchlistInput){
    this.window(input.validFrom,input.validUntil);
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "GuardWatchlistEntry" ("societyId","kind","subjectName","phone","vehicleNumber","reason","validFrom","validUntil","createdByUserId") VALUES
      (${societyId}::uuid,${input.kind},${input.subjectName.trim()},${input.phone?.trim()||null},${input.vehicleNumber?.trim().toUpperCase()||null},${input.reason.trim()},${input.validFrom??null}::timestamptz,${input.validUntil??null}::timestamptz,${userId}::uuid)
      RETURNING "id","kind","subjectName","phone","vehicleNumber","reason","active","validFrom","validUntil","createdAt"
    `);return rows[0];
  }

  async deactivateWatchlist(societyId:string,userId:string,id:string){const changed=await this.prisma.$executeRaw(Prisma.sql`UPDATE "GuardWatchlistEntry" SET "active"=false,"deactivatedByUserId"=${userId}::uuid,"deactivatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid AND "active"=true`);if(!changed)throw new NotFoundException('Active watchlist entry not found');return {id,active:false};}

  passes(societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT p."id",p."gateId",p."unitId",p."referenceCode",p."movementType",p."subjectName",p."itemDescription",p."vehicleNumber",p."status",p."validFrom",p."validUntil",p."processedAt",g."name" AS "gateName",u."number" AS "unitNumber"
    FROM "MaterialGatePass" p LEFT JOIN "Gate" g ON g."id"=p."gateId" AND g."societyId"=p."societyId" LEFT JOIN "Unit" u ON u."id"=p."unitId" AND u."societyId"=p."societyId"
    WHERE p."societyId"=${societyId}::uuid ORDER BY p."createdAt" DESC LIMIT 500
  `);}

  async createPass(societyId:string,userId:string,input:GatePassInput){
    this.window(input.validFrom,input.validUntil);await this.assertGateUnit(societyId,input.gateId,input.unitId);
    try{const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "MaterialGatePass" ("societyId","gateId","unitId","referenceCode","movementType","subjectName","itemDescription","vehicleNumber","validFrom","validUntil","createdByUserId") VALUES
      (${societyId}::uuid,${input.gateId??null}::uuid,${input.unitId??null}::uuid,${input.referenceCode.trim().toUpperCase()},${input.movementType},${input.subjectName.trim()},${input.itemDescription.trim()},${input.vehicleNumber?.trim().toUpperCase()||null},COALESCE(${input.validFrom??null}::timestamptz,CURRENT_TIMESTAMP),${input.validUntil??null}::timestamptz,${userId}::uuid)
      RETURNING "id","referenceCode","movementType","subjectName","itemDescription","status","validFrom","validUntil"
    `);return rows[0];}catch(e){if(String(e).includes('MaterialGatePass_society_reference_key'))throw new ConflictException('Gate pass reference already exists');throw e;}
  }

  async processPass(societyId:string,userId:string,id:string){
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      UPDATE "MaterialGatePass" SET "status"='PROCESSED',"processedByUserId"=${userId}::uuid,"processedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid AND "status"='OPEN' AND "validFrom"<=CURRENT_TIMESTAMP AND ("validUntil" IS NULL OR "validUntil">CURRENT_TIMESTAMP)
      RETURNING "id","referenceCode","status","processedAt"
    `);if(!rows.length)throw new ConflictException('Gate pass is unavailable, expired, or already processed');return rows[0];
  }

  async cancelPass(societyId:string,userId:string,id:string){const changed=await this.prisma.$executeRaw(Prisma.sql`UPDATE "MaterialGatePass" SET "status"='CANCELLED',"cancelledByUserId"=${userId}::uuid,"cancelledAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid AND "status"='OPEN'`);if(!changed)throw new ConflictException('Open gate pass not found');return {id,status:'CANCELLED'};}

  checkpoints(societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT "id","code","name","location","active" FROM "PatrolCheckpoint" WHERE "societyId"=${societyId}::uuid AND "active"=true ORDER BY "name"`);}
  patrolStatus(societyId:string,staleHours=8){
    if(!Number.isInteger(staleHours)||staleHours<1||staleHours>72)throw new BadRequestException('Patrol stale threshold must be between 1 and 72 hours');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT c."id",c."code",c."name",c."location",
             latest."scannedAt" AS "lastScannedAt",latest."guardUserId" AS "lastGuardUserId",
             CASE WHEN latest."scannedAt" IS NULL THEN NULL ELSE FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-latest."scannedAt"))/3600)::int END AS "hoursSinceLastScan",
             (latest."scannedAt" IS NULL OR latest."scannedAt"<CURRENT_TIMESTAMP-(${staleHours}*INTERVAL '1 hour')) AS "stale"
      FROM "PatrolCheckpoint" c
      LEFT JOIN LATERAL (
        SELECT s."scannedAt",s."guardUserId" FROM "PatrolScan" s
        WHERE s."societyId"=c."societyId" AND s."checkpointId"=c."id"
        ORDER BY s."scannedAt" DESC LIMIT 1
      ) latest ON TRUE
      WHERE c."societyId"=${societyId}::uuid AND c."active"=true
      ORDER BY "stale" DESC,latest."scannedAt" ASC NULLS FIRST,c."name"
    `);
  }
  async createCheckpoint(societyId:string,userId:string,input:CheckpointInput){const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "PatrolCheckpoint" ("societyId","code","name","location","createdByUserId") VALUES (${societyId}::uuid,${input.code.trim().toUpperCase()},${input.name.trim()},${input.location?.trim()||null},${userId}::uuid) RETURNING "id","code","name","location","active"`);return rows[0];}
  async scanCheckpoint(societyId:string,userId:string,checkpointId:string,gateId?:string,note?:string){await this.assertCheckpoint(societyId,checkpointId);await this.assertGateUnit(societyId,gateId,undefined);const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "PatrolScan" ("societyId","checkpointId","guardUserId","gateId","note") VALUES (${societyId}::uuid,${checkpointId}::uuid,${userId}::uuid,${gateId??null}::uuid,${note?.trim()||null}) RETURNING "id","checkpointId","gateId","scannedAt","note"`);return rows[0];}

  incidents(societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT "id","gateId","guardUserId","severity","category","title","description","mediaRefs","status","occurredAt","reviewedAt","resolution" FROM "SecurityIncident" WHERE "societyId"=${societyId}::uuid ORDER BY "occurredAt" DESC LIMIT 500`);}
  async createIncident(societyId:string,userId:string,input:IncidentInput){await this.assertGateUnit(societyId,input.gateId,undefined);const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "SecurityIncident" ("societyId","gateId","guardUserId","severity","category","title","description","mediaRefs","occurredAt") VALUES (${societyId}::uuid,${input.gateId??null}::uuid,${userId}::uuid,${input.severity},${input.category.trim()},${input.title.trim()},${input.description?.trim()||null},${JSON.stringify(input.mediaRefs??[])}::jsonb,COALESCE(${input.occurredAt??null}::timestamptz,CURRENT_TIMESTAMP)) RETURNING "id","severity","category","title","status","occurredAt"`);return rows[0];}
  async reviewIncident(societyId:string,userId:string,id:string,status:'REVIEWED'|'CLOSED',resolution?:string){const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "SecurityIncident" SET "status"=${status},"reviewedByUserId"=${userId}::uuid,"reviewedAt"=CURRENT_TIMESTAMP,"resolution"=${resolution?.trim()||null},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING "id","status","reviewedAt","resolution"`);if(!rows.length)throw new NotFoundException('Incident not found');return rows[0];}

  private window(from?:string,to?:string){if(from&&to&&new Date(to)<=new Date(from))throw new BadRequestException('validUntil must be after validFrom');}
  private async assertGateUnit(societyId:string,gateId?:string,unitId?:string){if(gateId){const g=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "Gate" WHERE "id"=${gateId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!g.length)throw new BadRequestException('Gate does not belong to current society');}if(unitId){const u=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "Unit" WHERE "id"=${unitId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!u.length)throw new BadRequestException('Unit does not belong to current society');}}
  private async assertCheckpoint(societyId:string,id:string){const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "PatrolCheckpoint" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1`);if(!rows.length)throw new NotFoundException('Active checkpoint not found');}
}
