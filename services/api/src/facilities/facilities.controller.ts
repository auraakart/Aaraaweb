import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
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
class WorkOrderStatusDto{@IsIn(['IN_PROGRESS','COMPLETED','CANCELLED']) status!:'IN_PROGRESS'|'COMPLETED'|'CANCELLED';@ValidateIf((o:WorkOrderStatusDto)=>o.status==='COMPLETED'||o.completionNote!==undefined) @IsString() @MinLength(5) @MaxLength(5000) completionNote?:string;}

@Controller('facilities')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesController{
  constructor(private readonly prisma:PrismaService){}
  @Get('operator-context') @RequiresPermissions(AppPermission.FACILITIES_READ)
  operatorContext(@CurrentTenant() societyId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT DISTINCT u."id",u."name",u."phone"
      FROM "SocietyMembership" sm
      JOIN "User" u ON u."id"=sm."userId"
      WHERE sm."societyId"=${societyId}::uuid AND sm."active"=TRUE
      ORDER BY u."name" ASC
    `);
  }
    @Get('readiness') @RequiresPermissions(AppPermission.FACILITIES_READ)
  async readiness(@CurrentTenant() societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{
      id:string;title:string;priority:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';status:'OPEN'|'IN_PROGRESS';
      dueAt:Date|null;assetId:string|null;assetCode:string|null;assetName:string|null;assetStatus:string|null;
      assignedUserId:string|null;assignedUserName:string|null;evidenceCount:number;verifiedEvidenceCount:number;
    }>>(Prisma.sql`
      SELECT w."id",w."title",w."priority",w."status",w."dueAt",w."assetId",
             a."code" AS "assetCode",a."name" AS "assetName",a."status" AS "assetStatus",
             w."assignedUserId",assignee."name" AS "assignedUserName",
             (SELECT COUNT(*)::int FROM "FacilityEvidenceReference" e
               WHERE e."societyId"=w."societyId" AND e."workOrderId"=w."id") AS "evidenceCount",
             (SELECT COUNT(*)::int FROM "FacilityEvidenceReference" e
               WHERE e."societyId"=w."societyId" AND e."workOrderId"=w."id" AND e."verifiedAt" IS NOT NULL) AS "verifiedEvidenceCount"
      FROM "FacilityWorkOrder" w
      LEFT JOIN "FacilityAsset" a ON a."id"=w."assetId" AND a."societyId"=w."societyId"
      LEFT JOIN "User" assignee ON assignee."id"=w."assignedUserId"
      WHERE w."societyId"=${societyId}::uuid AND w."status" IN ('OPEN','IN_PROGRESS')
      ORDER BY
        CASE w."priority" WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        CASE WHEN w."dueAt" IS NOT NULL AND w."dueAt"<CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
        w."dueAt" ASC NULLS LAST,w."createdAt" ASC
      LIMIT 250
    `);
    const now=Date.now();
    const items=rows.map(row=>{
      const overdue=!!row.dueAt&&row.dueAt.getTime()<now;
      const signals:string[]=[];
      if(row.priority==='CRITICAL')signals.push('PRIORITY_CRITICAL');
      if(overdue)signals.push('WORK_ORDER_OVERDUE');
      if(!row.assignedUserId)signals.push('ASSIGNEE_MISSING');
      if(row.assetStatus==='OUT_OF_SERVICE')signals.push('ASSET_OUT_OF_SERVICE');
      if(row.assetStatus==='RETIRED')signals.push('ASSET_RETIRED');
      const nextActions:string[]=[];
      if(!row.assignedUserId)nextActions.push('Assign an active society member to own this work order.');
      if(overdue)nextActions.push('Review the overdue work and record current progress or completion.');
      if(row.priority==='CRITICAL')nextActions.push('Prioritize operational response for this critical work order.');
      if(row.assetStatus==='OUT_OF_SERVICE'||row.assetStatus==='RETIRED')nextActions.push('Confirm the work order remains appropriate for the current asset service state.');
      if(row.evidenceCount===0)nextActions.push('Attach maintenance evidence when supporting records become available.');
      if(nextActions.length===0)nextActions.push('Continue the planned work-order lifecycle and record evidence as work progresses.');
      return {...row,overdue,signals,nextActions};
    });
    return {
      summary:{
        activeWorkOrders:items.length,
        criticalActive:items.filter(item=>item.priority==='CRITICAL').length,
        overdue:items.filter(item=>item.overdue).length,
        unassigned:items.filter(item=>!item.assignedUserId).length,
        outOfServiceAssetWork:items.filter(item=>item.assetStatus==='OUT_OF_SERVICE'||item.assetStatus==='RETIRED').length,
      },
      items,
      boundary:'Operational readiness evidence only; this view does not certify maintenance quality, contract validity or physical asset condition.',
    };
  }

  @Get('assets') @RequiresPermissions(AppPermission.FACILITIES_READ)
  listAssets(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "FacilityAsset" WHERE "societyId"=${societyId}::uuid ORDER BY "createdAt" DESC`);}
  @Post('assets') @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async createAsset(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateAssetDto){const actor=this.user(userId);const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "FacilityAsset" ("societyId","code","name","category","location","manufacturer","model","serialNumber","installedAt","warrantyEndsAt","notes","createdByUserId") VALUES (${societyId}::uuid,${dto.code.trim()},${dto.name.trim()},${dto.category.trim()},${dto.location?.trim()||null},${dto.manufacturer?.trim()||null},${dto.model?.trim()||null},${dto.serialNumber?.trim()||null},${dto.installedAt?new Date(dto.installedAt):null},${dto.warrantyEndsAt?new Date(dto.warrantyEndsAt):null},${dto.notes?.trim()||null},${actor}::uuid) RETURNING *`);return rows[0];}
  @Get('work-orders') @RequiresPermissions(AppPermission.FACILITIES_READ)
  listWorkOrders(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT w.*,a."code" AS "assetCode",a."name" AS "assetName",assignee."name" AS "assignedUserName" FROM "FacilityWorkOrder" w LEFT JOIN "FacilityAsset" a ON a."id"=w."assetId" LEFT JOIN "User" assignee ON assignee."id"=w."assignedUserId" WHERE w."societyId"=${societyId}::uuid ORDER BY w."createdAt" DESC`);}
  @Get('work-orders/:id/events') @RequiresPermissions(AppPermission.FACILITIES_READ)
  async listWorkOrderEvents(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){const work=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityWorkOrder" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!work.length)throw new BadRequestException('Facility work order not found');return this.prisma.$queryRaw(Prisma.sql`SELECT e.*,actor."name" AS "actorName" FROM "FacilityWorkOrderEvent" e LEFT JOIN "User" actor ON actor."id"=e."actorUserId" WHERE e."societyId"=${societyId}::uuid AND e."workOrderId"=${id}::uuid ORDER BY e."occurredAt" ASC`);}
  @Post('work-orders') @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async createWorkOrder(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateWorkOrderDto){const actor=this.user(userId);if(dto.assetId){const a=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityAsset" WHERE "id"=${dto.assetId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!a.length)throw new BadRequestException('Facility asset not found');}if(dto.assignedUserId)await this.assertActiveSocietyMember(societyId,dto.assignedUserId);const scheduled=dto.scheduledAt?new Date(dto.scheduledAt):null,due=dto.dueAt?new Date(dto.dueAt):null;if(scheduled&&due&&due<scheduled)throw new BadRequestException('Due time cannot precede scheduled time');return this.prisma.$transaction(async tx=>{const rows=await tx.$queryRaw<Array<Record<string,unknown>&{id:string}>>(Prisma.sql`INSERT INTO "FacilityWorkOrder" ("societyId","assetId","workType","priority","title","description","scheduledAt","dueAt","assignedUserId","createdByUserId") VALUES (${societyId}::uuid,${dto.assetId??null}::uuid,${dto.workType},${dto.priority},${dto.title.trim()},${dto.description?.trim()||null},${scheduled},${due},${dto.assignedUserId??null}::uuid,${actor}::uuid) RETURNING *`);const created=rows[0];await tx.$executeRaw(Prisma.sql`INSERT INTO "FacilityWorkOrderEvent" ("societyId","workOrderId","eventType","toStatus","actorUserId") VALUES (${societyId}::uuid,${created.id}::uuid,'CREATED','OPEN',${actor}::uuid)`);return created;});}
  @Post('work-orders/:id/status') @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async setWorkOrderStatus(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:WorkOrderStatusDto){const actor=this.user(userId);return this.prisma.$transaction(async tx=>{const rows=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT "status" FROM "FacilityWorkOrder" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`);if(!rows.length)throw new BadRequestException('Facility work order not found');const current=rows[0].status;const allowed=(current==='OPEN'&&(dto.status==='IN_PROGRESS'||dto.status==='CANCELLED'||dto.status==='COMPLETED'))||(current==='IN_PROGRESS'&&(dto.status==='COMPLETED'||dto.status==='CANCELLED'));if(!allowed)throw new BadRequestException(`Work order cannot transition from ${current} to ${dto.status}`);const updated=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "FacilityWorkOrder" SET "status"=${dto.status},"completionNote"=COALESCE(${dto.completionNote?.trim()||null},"completionNote"),"completedAt"=CASE WHEN ${dto.status}='COMPLETED' THEN CURRENT_TIMESTAMP ELSE "completedAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *`);await tx.$executeRaw(Prisma.sql`INSERT INTO "FacilityWorkOrderEvent" ("societyId","workOrderId","eventType","fromStatus","toStatus","note","actorUserId") VALUES (${societyId}::uuid,${id}::uuid,'STATUS_CHANGED',${current},${dto.status},${dto.completionNote?.trim()||null},${actor}::uuid)`);return updated[0];});}
  private async assertActiveSocietyMember(societyId:string,userId:string){const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "SocietyMembership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=TRUE LIMIT 1`);if(!rows.length)throw new BadRequestException('Assigned user must have an active membership in this society');}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
