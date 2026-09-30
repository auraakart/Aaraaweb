import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CommunityEventAudience='COMMUNITY'|'OWNER_ONLY';
export type CommunityEventLifecycle='DRAFT'|'PUBLISHED'|'CANCELLED';
export type CommunityEventRsvp='GOING'|'NOT_GOING';

export type CreateCommunityEventInput={
  title:string;
  description?:string;
  audienceScope:CommunityEventAudience;
  startsAt:Date;
  endsAt:Date;
  location?:string;
  capacity?:number|null;
};

@Injectable()
export class CommunityEventsService{
  constructor(private readonly prisma:PrismaService){}

  listVisible(societyId:string,userId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e."id",e."title",e."description",e."audienceScope",e."status",
             e."startsAt",e."endsAt",e."location",e."capacity",
             COALESCE(s."goingCount",0)::int AS "goingCount",
             COALESCE(s."notGoingCount",0)::int AS "notGoingCount",
             mine."status" AS "myRsvp"
      FROM "CommunityEvent" e
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE r."status"='GOING')::int AS "goingCount",
          COUNT(*) FILTER (WHERE r."status"='NOT_GOING')::int AS "notGoingCount"
        FROM "CommunityEventRsvp" r
        WHERE r."societyId"=e."societyId" AND r."eventId"=e."id"
      ) s ON TRUE
      LEFT JOIN "CommunityEventRsvp" mine
        ON mine."societyId"=e."societyId" AND mine."eventId"=e."id" AND mine."userId"=${userId}::uuid
      WHERE e."societyId"=${societyId}::uuid
        AND e."status"='PUBLISHED'
        AND e."endsAt">CURRENT_TIMESTAMP
        AND (
          EXISTS(
            SELECT 1 FROM "UnitOwnership" uo
            WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid
              AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          )
          OR EXISTS(
            SELECT 1 FROM "UnitOccupancy" oc
            WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${userId}::uuid
              AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
          )
        )
        AND (
          e."audienceScope"='COMMUNITY'
          OR (
            e."audienceScope"='OWNER_ONLY'
            AND EXISTS(
              SELECT 1 FROM "UnitOwnership" uo
              WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid
                AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
            )
          )
        )
      ORDER BY e."startsAt",e."createdAt"
      LIMIT 100
    `);
  }

  listManage(societyId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e."id",e."title",e."description",e."audienceScope",e."status",
             e."startsAt",e."endsAt",e."location",e."capacity",e."createdAt",e."updatedAt",
             COALESCE(s."goingCount",0)::int AS "goingCount",
             COALESCE(s."notGoingCount",0)::int AS "notGoingCount"
      FROM "CommunityEvent" e
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE r."status"='GOING')::int AS "goingCount",
          COUNT(*) FILTER (WHERE r."status"='NOT_GOING')::int AS "notGoingCount"
        FROM "CommunityEventRsvp" r
        WHERE r."societyId"=e."societyId" AND r."eventId"=e."id"
      ) s ON TRUE
      WHERE e."societyId"=${societyId}::uuid
      ORDER BY e."startsAt" DESC,e."createdAt" DESC
      LIMIT 250
    `);
  }

  async create(societyId:string,actorUserId:string,input:CreateCommunityEventInput){
    const title=input.title.trim();
    const description=input.description?.trim()||null;
    const location=input.location?.trim()||null;
    if(!title)throw new BadRequestException('Community event title is required');
    if(Number.isNaN(input.startsAt.getTime())||Number.isNaN(input.endsAt.getTime()))throw new BadRequestException('Valid event start and end times are required');
    if(input.endsAt<=input.startsAt)throw new BadRequestException('Community event end must be after start');
    // Optional DTO fields accept null; both null and omission mean unlimited.
    if(input.capacity!=null&&(!Number.isInteger(input.capacity)||input.capacity<1||input.capacity>10000))throw new BadRequestException('Community event capacity must be between 1 and 10000');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "CommunityEvent" (
        "societyId","title","description","audienceScope","startsAt","endsAt","location","capacity","createdByUserId"
      ) VALUES (
        ${societyId}::uuid,${title},${description},${input.audienceScope},
        ${input.startsAt},${input.endsAt},${location},${input.capacity??null},${actorUserId}::uuid
      )
      RETURNING *
    `);
    return rows[0];
  }

  async setStatus(societyId:string,eventId:string,next:'PUBLISHED'|'CANCELLED'){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;status:CommunityEventLifecycle;publishable:boolean}>>(Prisma.sql`
        SELECT "id","status",("endsAt">CURRENT_TIMESTAMP) AS "publishable"
        FROM "CommunityEvent"
        WHERE "id"=${eventId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const current=rows[0];
      if(!current)throw new NotFoundException('Community event not found');
      if(current.status===next)return {id:eventId,status:next,idempotent:true};
      if(current.status==='CANCELLED')throw new ConflictException('Cancelled community event cannot be republished');
      if(next==='PUBLISHED'&&!current.publishable)throw new ConflictException('Ended community event cannot be published');
      const updated=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        UPDATE "CommunityEvent"
        SET "status"=${next},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${eventId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      return updated[0];
    });
  }

  async rsvp(societyId:string,userId:string,eventId:string,status:CommunityEventRsvp){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{
        id:string;status:CommunityEventLifecycle;audienceScope:CommunityEventAudience;capacity:number|null;
        rsvpOpen:boolean;isOwner:boolean;isOccupant:boolean;
      }>>(Prisma.sql`
        SELECT e."id",e."status",e."audienceScope",e."capacity",
               (e."startsAt">CURRENT_TIMESTAMP) AS "rsvpOpen",
               EXISTS(
                 SELECT 1 FROM "UnitOwnership" uo
                 WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid
                   AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
                   AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
               ) AS "isOwner",
               EXISTS(
                 SELECT 1 FROM "UnitOccupancy" oc
                 WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${userId}::uuid
                   AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
                   AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
               ) AS "isOccupant"
        FROM "CommunityEvent" e
        WHERE e."id"=${eventId}::uuid AND e."societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const event=rows[0];
      if(!event)throw new NotFoundException('Community event not found');
      if(event.status!=='PUBLISHED')throw new ConflictException('Community event is not open for RSVP');
      if(!event.rsvpOpen)throw new ConflictException('Community event RSVP is closed');
      if(!event.isOwner&&!event.isOccupant)throw new ForbiddenException('Community event is not available to this resident');
      if(event.audienceScope==='OWNER_ONLY'&&!event.isOwner)throw new ForbiddenException('Community event is restricted to current verified owners');

      const existing=await tx.$queryRaw<Array<{status:CommunityEventRsvp}>>(Prisma.sql`
        SELECT "status" FROM "CommunityEventRsvp"
        WHERE "societyId"=${societyId}::uuid AND "eventId"=${eventId}::uuid AND "userId"=${userId}::uuid
        FOR UPDATE
      `);
      if(existing[0]?.status===status)return this.summary(tx,societyId,userId,eventId);

      if(status==='GOING'&&existing[0]?.status!=='GOING'&&event.capacity!==null){
        const counts=await tx.$queryRaw<Array<{goingCount:number}>>(Prisma.sql`
          SELECT COUNT(*)::int AS "goingCount"
          FROM "CommunityEventRsvp"
          WHERE "societyId"=${societyId}::uuid AND "eventId"=${eventId}::uuid AND "status"='GOING'
        `);
        if((counts[0]?.goingCount??0)>=event.capacity)throw new ConflictException('Community event has reached capacity');
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CommunityEventRsvp" ("societyId","eventId","userId","status")
        VALUES (${societyId}::uuid,${eventId}::uuid,${userId}::uuid,${status})
        ON CONFLICT ("societyId","eventId","userId")
        DO UPDATE SET "status"=EXCLUDED."status","updatedAt"=CURRENT_TIMESTAMP
      `);
      return this.summary(tx,societyId,userId,eventId);
    });
  }

  private async summary(tx:Prisma.TransactionClient,societyId:string,userId:string,eventId:string){
    const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT e."id",e."title",e."audienceScope",e."status",e."startsAt",e."endsAt",e."location",e."capacity",
             mine."status" AS "myRsvp",
             COUNT(r."id") FILTER (WHERE r."status"='GOING')::int AS "goingCount",
             COUNT(r."id") FILTER (WHERE r."status"='NOT_GOING')::int AS "notGoingCount"
      FROM "CommunityEvent" e
      LEFT JOIN "CommunityEventRsvp" mine
        ON mine."societyId"=e."societyId" AND mine."eventId"=e."id" AND mine."userId"=${userId}::uuid
      LEFT JOIN "CommunityEventRsvp" r
        ON r."societyId"=e."societyId" AND r."eventId"=e."id"
      WHERE e."id"=${eventId}::uuid AND e."societyId"=${societyId}::uuid
      GROUP BY e."id",mine."status"
    `);
    return rows[0];
  }
}
