import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceService } from './governance.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class AudienceDto{@IsIn(['COMMUNITY','OWNER_ONLY']) audienceScope!:'COMMUNITY'|'OWNER_ONLY';}

@Controller('governance')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class GovernanceCommunityController{
  constructor(private readonly prisma:PrismaService,private readonly governance:GovernanceService){}

  @Get('community/meetings')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  listMeetings(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){
    const actor=this.user(userId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT m."id",m."meetingType",m."status",m."title",m."scheduledAt",m."heldAt",m."location",
             m."quorumRequired",m."quorumPresent",m."minutesSummary",m."byeLawReference",m."audienceScope"
      FROM "GovernanceMeeting" m
      WHERE m."societyId"=${societyId}::uuid
        AND (
          EXISTS(SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
          OR EXISTS(SELECT 1 FROM "UnitOccupancy" oc WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${actor}::uuid AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP))
        )
        AND (m."audienceScope"='COMMUNITY' OR (m."audienceScope"='OWNER_ONLY' AND EXISTS(
          SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        )))
      ORDER BY m."scheduledAt" DESC LIMIT 250
    `);
  }

  @Get('community/meetings/:id')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  async getMeeting(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    const actor=this.user(userId);
    const visible=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT m."id" FROM "GovernanceMeeting" m
      WHERE m."id"=${id}::uuid AND m."societyId"=${societyId}::uuid
        AND (
          EXISTS(SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
          OR EXISTS(SELECT 1 FROM "UnitOccupancy" oc WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${actor}::uuid AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP))
        )
        AND (m."audienceScope"='COMMUNITY' OR (m."audienceScope"='OWNER_ONLY' AND EXISTS(
          SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        ))) LIMIT 1
    `);
    if(!visible.length)throw new BadRequestException('Governance meeting not available');
    return this.governance.getMeeting(societyId,id);
  }

  @Get('community/documents')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  listDocuments(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){
    const actor=this.user(userId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT d."id",d."meetingId",d."resolutionId",d."kind",d."fileReference",d."note",d."verifiedAt",d."audienceScope",d."createdAt"
      FROM "GovernanceDocumentReference" d
      JOIN "GovernanceMeeting" m ON m."id"=d."meetingId" AND m."societyId"=d."societyId"
      WHERE d."societyId"=${societyId}::uuid
        AND (
          (
            (EXISTS(SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
             OR EXISTS(SELECT 1 FROM "UnitOccupancy" oc WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${actor}::uuid AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)))
            AND d."audienceScope"='COMMUNITY' AND m."audienceScope"='COMMUNITY'
          )
          OR (
            d."audienceScope" IN ('COMMUNITY','OWNER_ONLY') AND m."audienceScope" IN ('COMMUNITY','OWNER_ONLY')
            AND EXISTS(SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
          )
        )
      ORDER BY d."createdAt" DESC LIMIT 250
    `);
  }

  @Post('audience/:kind/:id')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async setAudience(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('kind') kind:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AudienceDto){
    const actor=this.user(userId);
    const resourceType=kind==='meeting'?'MEETING':kind==='document'?'DOCUMENT':kind==='poll'?'POLL':null;
    if(!resourceType)throw new BadRequestException('Unsupported governance audience resource');
    return this.prisma.$transaction(async tx=>{
      const current=resourceType==='MEETING'
        ?await tx.$queryRaw<Array<{audienceScope:'COMMUNITY'|'OWNER_ONLY'}>>(Prisma.sql`SELECT "audienceScope" FROM "GovernanceMeeting" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`)
        :resourceType==='DOCUMENT'
          ?await tx.$queryRaw<Array<{audienceScope:'COMMUNITY'|'OWNER_ONLY'}>>(Prisma.sql`SELECT "audienceScope" FROM "GovernanceDocumentReference" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`)
          :await tx.$queryRaw<Array<{audienceScope:'COMMUNITY'|'OWNER_ONLY'}>>(Prisma.sql`SELECT "audienceScope" FROM "GovernancePoll" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`);
      if(!current.length)throw new BadRequestException('Governance resource not found');
      if(current[0].audienceScope===dto.audienceScope)return {id,audienceScope:dto.audienceScope,idempotent:true};
      const rows=resourceType==='MEETING'
        ?await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "GovernanceMeeting" SET "audienceScope"=${dto.audienceScope},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING "id","audienceScope"`)
        :resourceType==='DOCUMENT'
          ?await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "GovernanceDocumentReference" SET "audienceScope"=${dto.audienceScope} WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING "id","audienceScope"`)
          :await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "GovernancePoll" SET "audienceScope"=${dto.audienceScope},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING "id","audienceScope"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GovernanceAudienceAudit" ("societyId","resourceType","resourceId","fromScope","toScope","actorUserId")
        VALUES (${societyId}::uuid,${resourceType},${id}::uuid,${current[0].audienceScope},${dto.audienceScope},${actor}::uuid)
      `);
      return rows[0];
    });
  }

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
