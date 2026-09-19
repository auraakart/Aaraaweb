import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesPreventiveService } from './facilities-preventive.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreatePlanDto{
  @IsUUID() assetId!:string;
  @IsString() @MinLength(1) @MaxLength(240) title!:string;
  @IsOptional() @IsString() @MaxLength(5000) description?:string;
  @IsInt() @Min(1) @Max(3650) frequencyDays!:number;
  @IsInt() @Min(0) @Max(3650) leadDays!:number;
  @IsIn(['LOW','MEDIUM','HIGH','CRITICAL']) priority!:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
  @IsOptional() @IsUUID() assignedUserId?:string;
  @IsISO8601() nextDueAt!:string;
}
class PlanActiveDto{@IsBoolean() active!:boolean;}

@Controller('facilities/preventive-plans')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesPreventiveController{
  constructor(private readonly prisma:PrismaService,private readonly preventive:FacilitiesPreventiveService){}

  @Get()
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  list(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT p.*,a."code" AS "assetCode",a."name" AS "assetName",assignee."name" AS "assignedUserName" FROM "FacilityMaintenancePlan" p JOIN "FacilityAsset" a ON a."id"=p."assetId" LEFT JOIN "User" assignee ON assignee."id"=p."assignedUserId" WHERE p."societyId"=${societyId}::uuid ORDER BY p."nextDueAt" ASC`);}

  @Get('metrics')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  metrics(@CurrentTenant() societyId:string){return this.preventive.metrics(societyId);}

  @Post()
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreatePlanDto){
    const actor=this.user(userId);
    if(dto.leadDays>=dto.frequencyDays)throw new BadRequestException('Lead days must be less than frequency days');
    const assets=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityAsset" WHERE "id"=${dto.assetId}::uuid AND "societyId"=${societyId}::uuid AND "status"<>'RETIRED' LIMIT 1`);
    if(!assets.length)throw new BadRequestException('Active facility asset not found');
    if(dto.assignedUserId){const memberships=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "SocietyMembership" WHERE "userId"=${dto.assignedUserId}::uuid AND "societyId"=${societyId}::uuid AND "active"=TRUE LIMIT 1`);if(!memberships.length)throw new BadRequestException('Assigned user must have an active membership in this society');}
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "FacilityMaintenancePlan" ("societyId","assetId","title","description","frequencyDays","leadDays","priority","assignedUserId","nextDueAt","createdByUserId") VALUES (${societyId}::uuid,${dto.assetId}::uuid,${dto.title.trim()},${dto.description?.trim()||null},${dto.frequencyDays},${dto.leadDays},${dto.priority},${dto.assignedUserId??null}::uuid,${new Date(dto.nextDueAt)},${actor}::uuid) RETURNING *`);
    return rows[0];
  }

  @Get(':id/evidence')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  async evidence(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){
    const plans=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT p.*,a."code" AS "assetCode",a."name" AS "assetName",assignee."name" AS "assignedUserName"
      FROM "FacilityMaintenancePlan" p
      JOIN "FacilityAsset" a ON a."id"=p."assetId" AND a."societyId"=p."societyId"
      LEFT JOIN "User" assignee ON assignee."id"=p."assignedUserId"
      WHERE p."id"=${id}::uuid AND p."societyId"=${societyId}::uuid
      LIMIT 1
    `);
    if(!plans.length)throw new BadRequestException('Maintenance plan not found');
    const [workOrders,contracts,evidence]=await Promise.all([
      this.prisma.$queryRaw(Prisma.sql`
        SELECT w."id",w."title",w."priority",w."status",w."scheduledAt",w."dueAt",w."completedAt",w."completionNote",u."name" AS "assignedUserName"
        FROM "FacilityWorkOrder" w
        LEFT JOIN "User" u ON u."id"=w."assignedUserId"
        WHERE w."societyId"=${societyId}::uuid AND w."maintenancePlanId"=${id}::uuid
        ORDER BY w."scheduledAt" DESC NULLS LAST,w."createdAt" DESC
      `),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT c."id",c."title",c."contractType",c."status",c."startsAt",c."endsAt",p."businessName" AS "providerName"
        FROM "FacilityServiceContract" c
        JOIN "ServiceProvider" p ON p."id"=c."providerId"
        WHERE c."societyId"=${societyId}::uuid AND c."maintenancePlanId"=${id}::uuid
        ORDER BY c."endsAt" ASC
      `),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT e.*
        FROM "FacilityEvidenceReference" e
        WHERE e."societyId"=${societyId}::uuid
          AND (
            e."assetId"=(SELECT "assetId" FROM "FacilityMaintenancePlan" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid)
            OR e."workOrderId" IN (SELECT "id" FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "maintenancePlanId"=${id}::uuid)
            OR e."serviceContractId" IN (SELECT "id" FROM "FacilityServiceContract" WHERE "societyId"=${societyId}::uuid AND "maintenancePlanId"=${id}::uuid)
          )
        ORDER BY e."createdAt" DESC
      `)
    ]);
    return {plan:plans[0],workOrders,contracts,evidence,boundary:'Operational maintenance evidence only; contract references do not establish legal, warranty or AMC validity.'};
  }

  @Post(':id/active')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async setActive(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:PlanActiveDto){
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "FacilityMaintenancePlan" SET "active"=${dto.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *`);
    if(!rows.length)throw new BadRequestException('Maintenance plan not found');
    return rows[0];
  }

  @Post('generate-due')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  generateDue(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){return this.preventive.generateForSociety(societyId,this.user(userId));}

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
