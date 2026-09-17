import { BadRequestException, Body, ConflictException, Controller, ExecutionContext, ForbiddenException, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsUUID } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { PrismaService } from '../prisma/prisma.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class PollResponseDto{@IsUUID() optionId!:string;}
class PollStatusDto{@IsIn(['OPEN','CLOSED','CANCELLED']) status!:'OPEN'|'CLOSED'|'CANCELLED';}

@Controller('governance/community-polls')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.GOVERNANCE_POLLS)
export class GovernancePollParticipationController{
  constructor(private readonly prisma:PrismaService){}

  @Get()
  @RequiresPermissions(AppPermission.NOTICE_READ)
  listAvailable(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){
    const actor=this.user(userId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p."id",p."pollType",p."status",p."title",p."description",p."opensAt",p."closesAt",p."statutoryUseProhibited",p."audienceScope",
        COALESCE(json_agg(json_build_object('id',o."id",'ordinal',o."ordinal",'label',o."label") ORDER BY o."ordinal") FILTER (WHERE o."id" IS NOT NULL),'[]'::json) AS options,
        r."optionId" AS "myOptionId"
      FROM "GovernancePoll" p
      LEFT JOIN "GovernancePollOption" o ON o."pollId"=p."id"
      LEFT JOIN "GovernancePollResponse" r ON r."pollId"=p."id" AND r."userId"=${actor}::uuid
      WHERE p."societyId"=${societyId}::uuid AND p."statutoryUseProhibited"=TRUE AND p."status" IN ('OPEN','CLOSED')
        AND (p."opensAt" IS NULL OR p."opensAt"<=CURRENT_TIMESTAMP)
        AND (
          EXISTS(SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
          OR EXISTS(SELECT 1 FROM "UnitOccupancy" oc WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${actor}::uuid AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP))
        )
        AND (p."audienceScope"='COMMUNITY' OR EXISTS(
          SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        ))
      GROUP BY p."id",r."optionId" ORDER BY p."createdAt" DESC
    `);
  }

  @Get(':id/results')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  async results(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    const actor=this.user(userId);
    const polls=await this.prisma.$queryRaw<Array<{id:string;status:string;statutoryUseProhibited:boolean}>>(Prisma.sql`
      SELECT p."id",p."status",p."statutoryUseProhibited" FROM "GovernancePoll" p
      WHERE p."id"=${id}::uuid AND p."societyId"=${societyId}::uuid
        AND (
          EXISTS(SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
          OR EXISTS(SELECT 1 FROM "UnitOccupancy" oc WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${actor}::uuid AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP))
        )
        AND (p."audienceScope"='COMMUNITY' OR EXISTS(
          SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        ))
      LIMIT 1
    `);
    if(!polls.length)throw new BadRequestException('Community poll not found');
    const poll=polls[0];
    if(!poll.statutoryUseProhibited)throw new ForbiddenException('Statutory voting is not supported by community poll results');
    if(poll.status!=='CLOSED')throw new ConflictException('Community poll results are available only after the poll is closed');
    const options=await this.prisma.$queryRaw<Array<{id:string;ordinal:number;label:string;responseCount:number}>>(Prisma.sql`
      SELECT o."id",o."ordinal",o."label",COUNT(r."id")::int AS "responseCount"
      FROM "GovernancePollOption" o
      LEFT JOIN "GovernancePollResponse" r ON r."optionId"=o."id" AND r."pollId"=${id}::uuid
      WHERE o."pollId"=${id}::uuid
      GROUP BY o."id",o."ordinal",o."label"
      ORDER BY o."ordinal"
    `);
    return {pollId:id,status:poll.status,totalResponses:options.reduce((sum,option)=>sum+option.responseCount,0),options,statutoryUseProhibited:true};
  }

  @Post(':id/responses')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  async respond(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:PollResponseDto){
    const actor=this.user(userId);
    return this.prisma.$transaction(async tx=>{
      const polls=await tx.$queryRaw<Array<{id:string;status:string;opensAt:Date|null;closesAt:Date|null;statutoryUseProhibited:boolean}>>(Prisma.sql`
        SELECT p."id",p."status",p."opensAt",p."closesAt",p."statutoryUseProhibited" FROM "GovernancePoll" p
        WHERE p."id"=${id}::uuid AND p."societyId"=${societyId}::uuid
          AND (
            EXISTS(SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP))
            OR EXISTS(SELECT 1 FROM "UnitOccupancy" oc WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${actor}::uuid AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP))
          )
          AND (p."audienceScope"='COMMUNITY' OR EXISTS(
            SELECT 1 FROM "UnitOwnership" uo WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${actor}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          ))
        FOR UPDATE
      `);
      if(!polls.length)throw new BadRequestException('Community poll not found');
      const poll=polls[0],now=Date.now();
      if(!poll.statutoryUseProhibited)throw new ForbiddenException('Statutory voting is not supported by community polls');
      if(poll.status!=='OPEN')throw new ConflictException('Community poll is not open');
      if(poll.opensAt&&poll.opensAt.getTime()>now)throw new ConflictException('Community poll has not opened yet');
      if(poll.closesAt&&poll.closesAt.getTime()<now)throw new ConflictException('Community poll is closed');
      const option=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernancePollOption" WHERE "id"=${dto.optionId}::uuid AND "pollId"=${id}::uuid LIMIT 1`);
      if(!option.length)throw new BadRequestException('Poll option does not belong to this poll');
      const existing=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernancePollResponse" WHERE "pollId"=${id}::uuid AND "userId"=${actor}::uuid LIMIT 1`);
      if(existing.length)throw new ConflictException('A response has already been recorded for this poll');
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "GovernancePollResponse" ("pollId","optionId","userId") VALUES (${id}::uuid,${dto.optionId}::uuid,${actor}::uuid) RETURNING *`);
      return rows[0];
    });
  }

  @Post(':id/status')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async setStatus(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:PollStatusDto){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;status:string;closesAt:Date|null;statutoryUseProhibited:boolean}>>(Prisma.sql`
        SELECT "id","status","closesAt","statutoryUseProhibited" FROM "GovernancePoll"
        WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if(!rows.length)throw new BadRequestException('Governance poll not found');
      const poll=rows[0];
      if(!poll.statutoryUseProhibited)throw new ForbiddenException('Statutory voting cannot be managed through the community poll lifecycle');
      if(dto.status==='OPEN'&&poll.closesAt&&poll.closesAt.getTime()<Date.now())throw new ConflictException('Community poll cannot be opened after its close time');
      const current=poll.status;
      const allowed=(current==='DRAFT'&&(dto.status==='OPEN'||dto.status==='CANCELLED'))||(current==='OPEN'&&(dto.status==='CLOSED'||dto.status==='CANCELLED'));
      if(!allowed)throw new ConflictException(`Poll cannot transition from ${current} to ${dto.status}`);
      const updated=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        UPDATE "GovernancePoll" SET "status"=${dto.status},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *
      `);
      return updated[0];
    });
  }

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
