import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreateContractDto{
  @IsUUID() providerId!:string;
  @IsOptional() @IsUUID() assetId?:string;
  @IsOptional() @IsUUID() maintenancePlanId?:string;
  @IsIn(['AMC','WARRANTY','SERVICE_AGREEMENT']) contractType!:'AMC'|'WARRANTY'|'SERVICE_AGREEMENT';
  @IsOptional() @IsString() @MaxLength(120) contractNumber?:string;
  @IsString() @MinLength(1) @MaxLength(240) title!:string;
  @IsISO8601() startsAt!:string;
  @IsISO8601() endsAt!:string;
  @IsOptional() @IsInt() @Min(0) amountPaise?:number;
  @IsOptional() @IsString() @MaxLength(8) currency?:string;
  @IsOptional() @IsString() @MaxLength(5000) notes?:string;
}
class ContractStatusDto{@IsIn(['ACTIVE','EXPIRED','TERMINATED']) status!:'ACTIVE'|'EXPIRED'|'TERMINATED';}
class EvidenceDto{
  @IsOptional() @IsUUID() assetId?:string;
  @IsOptional() @IsUUID() workOrderId?:string;
  @IsOptional() @IsUUID() serviceContractId?:string;
  @IsString() @MinLength(1) @MaxLength(48) kind!:string;
  @IsString() @MinLength(1) @MaxLength(2000) fileReference!:string;
  @IsOptional() @IsString() @MaxLength(5000) note?:string;
}

@Controller('facilities/contracts')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesContractsController{
  constructor(private readonly prisma:PrismaService){}

  @Get('providers')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  providers(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT p."id",p."businessName" FROM "ServiceProviderSociety" s JOIN "ServiceProvider" p ON p."id"=s."providerId" WHERE s."societyId"=${societyId}::uuid AND s."status"='APPROVED' AND p."active"=TRUE AND p."verification"='VERIFIED' ORDER BY p."businessName" ASC`);}

  @Get()
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  list(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT c.*,p."businessName" AS "providerName",a."code" AS "assetCode",a."name" AS "assetName" FROM "FacilityServiceContract" c JOIN "ServiceProvider" p ON p."id"=c."providerId" LEFT JOIN "FacilityAsset" a ON a."id"=c."assetId" WHERE c."societyId"=${societyId}::uuid ORDER BY c."endsAt" ASC`);}

  @Post()
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateContractDto){
    const actor=this.user(userId),starts=new Date(dto.startsAt),ends=new Date(dto.endsAt);
    if(ends<starts)throw new BadRequestException('Contract end cannot precede start');
    const provider=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT p."id" FROM "ServiceProviderSociety" s JOIN "ServiceProvider" p ON p."id"=s."providerId" WHERE s."societyId"=${societyId}::uuid AND s."providerId"=${dto.providerId}::uuid AND s."status"='APPROVED' AND p."active"=TRUE AND p."verification"='VERIFIED' LIMIT 1`);if(!provider.length)throw new BadRequestException('Approved service provider not found for this society');
    if(dto.assetId){const a=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityAsset" WHERE "id"=${dto.assetId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!a.length)throw new BadRequestException('Facility asset not found');}
    if(dto.maintenancePlanId){const p=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityMaintenancePlan" WHERE "id"=${dto.maintenancePlanId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!p.length)throw new BadRequestException('Maintenance plan not found');}
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "FacilityServiceContract" ("societyId","providerId","assetId","maintenancePlanId","contractType","contractNumber","title","startsAt","endsAt","amountPaise","currency","notes","createdByUserId") VALUES (${societyId}::uuid,${dto.providerId}::uuid,${dto.assetId??null}::uuid,${dto.maintenancePlanId??null}::uuid,${dto.contractType},${dto.contractNumber?.trim()||null},${dto.title.trim()},${starts},${ends},${dto.amountPaise??null},${dto.currency?.trim().toUpperCase()||'INR'},${dto.notes?.trim()||null},${actor}::uuid) RETURNING *`);return rows[0];
  }

  @Post(':id/status')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async setStatus(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ContractStatusDto){const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "FacilityServiceContract" SET "status"=${dto.status},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *`);if(!rows.length)throw new BadRequestException('Facility contract not found');return rows[0];}

  @Get('evidence')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  evidence(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "FacilityEvidenceReference" WHERE "societyId"=${societyId}::uuid ORDER BY "createdAt" DESC`);}

  @Post('evidence')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async addEvidence(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:EvidenceDto){
    const actor=this.user(userId);if(!dto.assetId&&!dto.workOrderId&&!dto.serviceContractId)throw new BadRequestException('Evidence must reference an asset, work order, or contract');
    await this.assertScopedReference(societyId,dto);
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "FacilityEvidenceReference" ("societyId","assetId","workOrderId","serviceContractId","kind","fileReference","note","createdByUserId") VALUES (${societyId}::uuid,${dto.assetId??null}::uuid,${dto.workOrderId??null}::uuid,${dto.serviceContractId??null}::uuid,${dto.kind.trim()},${dto.fileReference.trim()},${dto.note?.trim()||null},${actor}::uuid) RETURNING *`);return rows[0];
  }

  @Post('evidence/:id/verify')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async verifyEvidence(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){const actor=this.user(userId);const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "FacilityEvidenceReference" SET "verifiedAt"=CURRENT_TIMESTAMP,"verifiedByUserId"=${actor}::uuid WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *`);if(!rows.length)throw new BadRequestException('Facility evidence not found');return rows[0];}

  private async assertScopedReference(societyId:string,dto:EvidenceDto){
    if(dto.assetId){const r=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityAsset" WHERE "id"=${dto.assetId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!r.length)throw new BadRequestException('Facility asset not found');}
    if(dto.workOrderId){const r=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityWorkOrder" WHERE "id"=${dto.workOrderId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!r.length)throw new BadRequestException('Facility work order not found');}
    if(dto.serviceContractId){const r=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityServiceContract" WHERE "id"=${dto.serviceContractId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!r.length)throw new BadRequestException('Facility contract not found');}
  }
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
