import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DirectoryProfileInput={
  visible:boolean;
  displayName?:string;
  bio?:string;
  interests?:string[];
};

@Injectable()
export class ResidentDirectoryService {
  constructor(private readonly prisma:PrismaService){}

  async mine(societyId:string,userId:string){
    await this.assertCurrentResident(societyId,userId);
    const [profile]=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT p."id",p."displayName",p."bio",p."interests",p."visible",p."updatedAt"
      FROM "ResidentDirectoryProfile" p
      WHERE p."societyId"=${societyId}::uuid AND p."userId"=${userId}::uuid
      LIMIT 1
    `);
    if(profile)return {...profile,boundary:this.boundary()};
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{name:true}});
    return {
      displayName:user?.name?.trim()||'Resident',
      bio:null,
      interests:[],
      visible:false,
      configured:false,
      boundary:this.boundary(),
    };
  }

  async updateMine(societyId:string,userId:string,input:DirectoryProfileInput){
    await this.assertCurrentResident(societyId,userId);
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{name:true}});
    const displayName=(input.displayName?.trim()||user?.name?.trim()||'Resident').slice(0,80);
    if(!displayName)throw new BadRequestException('Directory display name is required');
    const bio=input.bio?.trim()||null;
    const interests=[...new Set((input.interests??[]).map(value=>value.trim()).filter(Boolean))].slice(0,8);
    if(interests.some(value=>value.length>40))throw new BadRequestException('Directory interests must be 40 characters or less');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "ResidentDirectoryProfile" ("societyId","userId","displayName","bio","interests","visible")
      VALUES (${societyId}::uuid,${userId}::uuid,${displayName},${bio},${JSON.stringify(interests)}::jsonb,${input.visible})
      ON CONFLICT ("societyId","userId") DO UPDATE
      SET "displayName"=EXCLUDED."displayName","bio"=EXCLUDED."bio","interests"=EXCLUDED."interests",
          "visible"=EXCLUDED."visible","updatedAt"=CURRENT_TIMESTAMP
      RETURNING "id","displayName","bio","interests","visible","updatedAt"
    `);
    return {...rows[0],boundary:this.boundary()};
  }

  async listVisible(societyId:string,userId:string){
    await this.assertCurrentResident(societyId,userId);
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT p."userId",p."displayName",p."bio",p."interests",p."updatedAt",
        (p."userId"=${userId}::uuid) AS "mine",
        (
          SELECT r."status" FROM "ResidentDirectoryContactRequest" r
          WHERE r."societyId"=p."societyId"
            AND (
              (r."requesterUserId"=${userId}::uuid AND r."recipientUserId"=p."userId")
              OR (r."recipientUserId"=${userId}::uuid AND r."requesterUserId"=p."userId")
            )
          ORDER BY r."createdAt" DESC LIMIT 1
        ) AS "latestContactStatus"
      FROM "ResidentDirectoryProfile" p
      WHERE p."societyId"=${societyId}::uuid
        AND p."visible"=TRUE
        AND (
          EXISTS(
            SELECT 1 FROM "UnitOwnership" ow
            WHERE ow."societyId"=p."societyId" AND ow."userId"=p."userId"
              AND ow."verified"=TRUE AND ow."active"=TRUE AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
          )
          OR EXISTS(
            SELECT 1 FROM "UnitOccupancy" oc
            WHERE oc."societyId"=p."societyId" AND oc."userId"=p."userId"
              AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
          )
        )
      ORDER BY CASE WHEN p."userId"=${userId}::uuid THEN 0 ELSE 1 END,p."displayName" ASC,p."updatedAt" DESC
      LIMIT 250
    `);
  }

  async contactRequests(societyId:string,userId:string){
    await this.assertCurrentResident(societyId,userId);
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT r."id",r."requesterUserId",r."recipientUserId",r."message",r."responseNote",
        r."status",r."createdAt",r."respondedAt",
        (r."requesterUserId"=${userId}::uuid) AS "outgoing",
        COALESCE(requester."displayName",'Resident') AS "requesterName",
        COALESCE(recipient."displayName",'Resident') AS "recipientName"
      FROM "ResidentDirectoryContactRequest" r
      LEFT JOIN "ResidentDirectoryProfile" requester
        ON requester."societyId"=r."societyId" AND requester."userId"=r."requesterUserId"
      LEFT JOIN "ResidentDirectoryProfile" recipient
        ON recipient."societyId"=r."societyId" AND recipient."userId"=r."recipientUserId"
      WHERE r."societyId"=${societyId}::uuid
        AND (r."requesterUserId"=${userId}::uuid OR r."recipientUserId"=${userId}::uuid)
      ORDER BY CASE r."status" WHEN 'PENDING' THEN 0 ELSE 1 END,r."createdAt" DESC
      LIMIT 200
    `);
  }

  async requestContact(societyId:string,userId:string,recipientUserId:string,messageInput?:string){
    if(recipientUserId===userId)throw new BadRequestException('You cannot send a contact request to yourself');
    await this.assertCurrentResident(societyId,userId);
    const message=messageInput?.trim()||null;
    const pair=[userId,recipientUserId].sort().join(':');
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resident-directory:${societyId}:${pair}`},0))`);
      const recipient=await tx.$queryRaw<Array<{allowed:boolean;visible:boolean}>>(Prisma.sql`
        SELECT
          EXISTS(
            SELECT 1 FROM "ResidentDirectoryProfile" p
            WHERE p."societyId"=${societyId}::uuid AND p."userId"=${recipientUserId}::uuid AND p."visible"=TRUE
          ) AS "visible",
          (
            EXISTS(
              SELECT 1 FROM "UnitOwnership" ow
              WHERE ow."societyId"=${societyId}::uuid AND ow."userId"=${recipientUserId}::uuid
                AND ow."verified"=TRUE AND ow."active"=TRUE AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
            )
            OR EXISTS(
              SELECT 1 FROM "UnitOccupancy" oc
              WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${recipientUserId}::uuid
                AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
            )
          ) AS "allowed"
      `);
      if(recipient[0]?.allowed!==true||recipient[0]?.visible!==true)throw new NotFoundException('Directory resident not found');
      const pending=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "ResidentDirectoryContactRequest"
        WHERE "societyId"=${societyId}::uuid AND "status"='PENDING'
          AND (
            ("requesterUserId"=${userId}::uuid AND "recipientUserId"=${recipientUserId}::uuid)
            OR ("requesterUserId"=${recipientUserId}::uuid AND "recipientUserId"=${userId}::uuid)
          )
        LIMIT 1
      `);
      if(pending[0])throw new ConflictException('A contact request between these residents is already pending');
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "ResidentDirectoryContactRequest" ("societyId","requesterUserId","recipientUserId","message")
        VALUES (${societyId}::uuid,${userId}::uuid,${recipientUserId}::uuid,${message})
        RETURNING "id","requesterUserId","recipientUserId","message","status","createdAt"
      `);
      return {...rows[0],boundary:this.contactBoundary()};
    });
  }

  async respond(societyId:string,userId:string,requestId:string,status:'ACCEPTED'|'DECLINED',responseNoteInput?:string){
    await this.assertCurrentResident(societyId,userId);
    const responseNote=responseNoteInput?.trim()||null;
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      UPDATE "ResidentDirectoryContactRequest"
      SET "status"=${status},"responseNote"=${responseNote},"respondedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid
        AND "recipientUserId"=${userId}::uuid AND "status"='PENDING'
      RETURNING "id","requesterUserId","recipientUserId","message","responseNote","status","createdAt","respondedAt"
    `);
    if(!rows[0])throw new NotFoundException('Pending contact request not found');
    return {...rows[0],boundary:this.contactBoundary()};
  }

  async withdraw(societyId:string,userId:string,requestId:string){
    await this.assertCurrentResident(societyId,userId);
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      UPDATE "ResidentDirectoryContactRequest"
      SET "status"='WITHDRAWN',"respondedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid
        AND "requesterUserId"=${userId}::uuid AND "status"='PENDING'
      RETURNING "id","status","respondedAt"
    `);
    if(!rows[0])throw new NotFoundException('Pending outgoing contact request not found');
    return rows[0];
  }

  private async assertCurrentResident(societyId:string,userId:string){
    const rows=await this.prisma.$queryRaw<Array<{allowed:boolean}>>(Prisma.sql`
      SELECT (
        EXISTS(
          SELECT 1 FROM "UnitOwnership" ow
          WHERE ow."societyId"=${societyId}::uuid AND ow."userId"=${userId}::uuid
            AND ow."verified"=TRUE AND ow."active"=TRUE AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
            AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
        )
        OR EXISTS(
          SELECT 1 FROM "UnitOccupancy" oc
          WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${userId}::uuid
            AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
            AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
        )
      ) AS "allowed"
    `);
    if(rows[0]?.allowed!==true)throw new ForbiddenException('Resident directory is available only to current residents or verified owners');
  }

  private boundary(){
    return 'Opt-in society directory only. Directory responses never expose phone numbers, email addresses, unit numbers or a hidden resident roster.';
  }

  private contactBoundary(){
    return 'Contact requests exchange only the resident-authored request and optional response note. Acceptance does not reveal phone or email details and does not create direct-message authority.';
  }
}
