import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreateAssetDto{@IsString() @MinLength(1) @MaxLength(80) code!:string;@IsString() @MinLength(1) @MaxLength(240) name!:string;@IsString() @MinLength(1) @MaxLength(120) category!:string;@IsOptional() @IsString() @MaxLength(240) location?:string;@IsOptional() @IsString() @MaxLength(160) manufacturer?:string;@IsOptional() @IsString() @MaxLength(160) model?:string;@IsOptional() @IsString() @MaxLength(160) serialNumber?:string;@IsOptional() @IsISO8601() installedAt?:string;@IsOptional() @IsISO8601() warrantyEndsAt?:string;@IsOptional() @IsString() @MaxLength(5000) notes?:string;}
class CreateWorkOrderDto{@IsOptional() @IsUUID() assetId?:string;@IsIn(['CORRECTIVE','PREVENTIVE','INSPECTION']) workType!:'CORRECTIVE'|'PREVENTIVE'|'INSPECTION';@IsIn(['LOW','MEDIUM','HIGH','CRITICAL']) priority!:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';@IsString() @MinLength(1) @MaxLength(240) title!:string;@IsOptional() @IsString() @MaxLength(5000) description?:string;@IsOptional() @IsISO8601() scheduledAt?:string;@IsOptional() @IsISO8601() dueAt?:string;@IsOptional() @IsUUID() assignedUserId?:string;}
class WorkOrderStatusDto{@IsIn(['IN_PROGRESS','COMPLETED','CANCELLED']) status!:'IN_PROGRESS'|'COMPLETED'|'CANCELLED';@IsOptional() @IsString() @MaxLength(5000) completionNote?:string;}

@Controller('facilities')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesController{
  constructor(private readonly prisma:PrismaService){}
  @Get('assets') @RequiresPermissions(AppPermission.FACILITIES_READ)
  listAssets(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "FacilityAsset" WHERE "societyId"=${societyId}::uuid ORDER BY "createdAt" DESC`);}
  @Post('assets') @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async createAsset(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateAssetDto){const actor=this.user(userId);const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "FacilityAsset" ("societyId","code","name","category","location","manufacturer","model","serialNumber","installedAt","warrantyEndsAt","notes","createdByUserId") VALUES (${societyId}::uuid,${dto.code.trim()},${dto.name.trim()},${dto.category.trim()},${dto.location?.trim()||null},${dto.manufacturer?.trim()||null},${dto.model?.trim()||null},${dto.serialNumber?.trim()||null},${dto.installedAt?new Date(dto.installedAt):null},${dto.warrantyEndsAt?new Date(dto.warrantyEndsAt):null},${dto.notes?.trim()||null},${actor}::uuid) RETURNING *`);return rows[0];}
  @Get('work-orders') @RequiresPermissions(AppPermission.FACILITIES_READ)
  listWorkOrders(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT w.*,a."code" AS "assetCode",a."name" AS "assetName" FROM "FacilityWorkOrder" w LEFT JOIN "FacilityAsset" a ON a."id"=w."assetId" WHERE w."societyId"=${societyId}::uuid ORDER BY w."createdAt" DESC`);}
  @Post('work-orders') @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async createWorkOrder(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateWorkOrderDto){const actor=this.user(userId);if(dto.assetId){const a=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityAsset" WHERE "id"=${dto.assetId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!a.length)throw new BadRequestException('Facility asset not found');}const scheduled=dto.scheduledAt?new Date(dto.scheduledAt):null,due=dto.dueAt?new Date(dto.dueAt):null;if(scheduled&&due&&due<scheduled)throw new BadRequestException('Due time cannot precede scheduled time');const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "FacilityWorkOrder" ("societyId","assetId","workType","priority","title","description","scheduledAt","dueAt","assignedUserId","createdByUserId") VALUES (${societyId}::uuid,${dto.assetId??null}::uuid,${dto.workType},${dto.priority},${dto.title.trim()},${dto.description?.trim()||null},${scheduled},${due},${dto.assignedUserId??null}::uuid,${actor}::uuid) RETURNING *`);return rows[0];}
  @Post('work-orders/:id/status') @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async setWorkOrderStatus(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:WorkOrderStatusDto){const rows=await this.prisma.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT "status" FROM "FacilityWorkOrder" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!rows.length)throw new BadRequestException('Facility work order not found');const current=rows[0].status;const allowed=(current==='OPEN'&&(dto.status==='IN_PROGRESS'||dto.status==='CANCELLED'||dto.status==='COMPLETED'))||(current==='IN_PROGRESS'&&(dto.status==='COMPLETED'||dto.status==='CANCELLED'));if(!allowed)throw new BadRequestException(`Work order cannot transition from ${current} to ${dto.status}`);const updated=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "FacilityWorkOrder" SET "status"=${dto.status},"completionNote"=COALESCE(${dto.completionNote?.trim()||null},"completionNote"),"completedAt"=CASE WHEN ${dto.status}='COMPLETED' THEN CURRENT_TIMESTAMP ELSE "completedAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *`);return updated[0];}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
