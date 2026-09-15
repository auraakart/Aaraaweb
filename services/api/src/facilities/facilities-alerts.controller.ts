import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesAlertsService } from './facilities-alerts.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class GenerateAlertsDto{@IsInt() @Min(1) @Max(120) windowDays=30;}
class AlertStatusDto{@IsIn(['ACKNOWLEDGED','RESOLVED']) status!:'ACKNOWLEDGED'|'RESOLVED';}

@Controller('facilities/alerts')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesAlertsController{
  constructor(private readonly prisma:PrismaService,private readonly alerts:FacilitiesAlertsService){}

  @Get()
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  list(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "FacilityOperationalAlert" WHERE "societyId"=${societyId}::uuid ORDER BY CASE "severity" WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,"dueAt" ASC NULLS LAST,"createdAt" DESC`);}

  @Post('generate')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  generate(@CurrentTenant() societyId:string,@Body() dto:GenerateAlertsDto){return this.alerts.generateForSociety(societyId,dto.windowDays);}

  @Post(':id/status')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async setStatus(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AlertStatusDto){
    if(!userId)throw new BadRequestException('Authenticated user is required');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "FacilityOperationalAlert" SET "status"=${dto.status},"acknowledgedAt"=CASE WHEN ${dto.status}='ACKNOWLEDGED' THEN CURRENT_TIMESTAMP ELSE "acknowledgedAt" END,"acknowledgedByUserId"=CASE WHEN ${dto.status}='ACKNOWLEDGED' THEN ${userId}::uuid ELSE "acknowledgedByUserId" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *`);
    if(!rows.length)throw new BadRequestException('Facility alert not found');
    return rows[0];
  }
}
