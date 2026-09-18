import { BadRequestException, Body, Controller, ExecutionContext, Get, Put, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { FinanceTaxService } from './finance-tax.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class TaxConfigurationDto{
  @IsBoolean() gstEnabled!:boolean;
  @IsOptional() @IsString() @MaxLength(20) gstin?:string;
  @IsBoolean() tdsEnabled!:boolean;
  @IsOptional() @IsString() @MaxLength(20) tan?:string;
  @IsOptional() @IsString() @MaxLength(20) defaultTdsSection?:string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) defaultTdsBasisPoints?:number;
}
class TaxMetadataDto{
  @IsIn(['EXPENSE','CHARGE_RULE','RECEIVABLE']) documentType!:'EXPENSE'|'CHARGE_RULE'|'RECEIVABLE';
  @IsUUID() documentId!:string;
  @IsOptional() @IsInt() @Min(0) taxableAmountPaise?:number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) gstRateBasisPoints?:number;
  @IsOptional() @IsInt() @Min(0) gstAmountPaise?:number;
  @IsOptional() @IsString() @MaxLength(20) vendorGstin?:string;
  @IsOptional() @IsString() @MaxLength(120) invoiceNumber?:string;
  @IsOptional() @IsString() @MaxLength(20) tdsSection?:string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) tdsRateBasisPoints?:number;
  @IsOptional() @IsInt() @Min(0) tdsAmountPaise?:number;
  @IsOptional() @IsObject() metadata?:Record<string,unknown>;
}

@Controller('accounting/tax')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class FinanceTaxController{
  constructor(private readonly tax:FinanceTaxService){}
  @Get('configuration') @RequiresPermissions(AppPermission.FINANCE_READ)
  configuration(@CurrentTenant() societyId:string){return this.tax.configuration(societyId);}
  @Put('configuration') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  updateConfiguration(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:TaxConfigurationDto){return this.tax.updateConfiguration(societyId,this.user(userId),dto);}
  @Get('metadata') @RequiresPermissions(AppPermission.FINANCE_READ)
  listMetadata(@CurrentTenant() societyId:string,@Query('documentType') documentType?:string){return this.tax.listMetadata(societyId,documentType);}
  @Put('metadata') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  upsertMetadata(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:TaxMetadataDto){return this.tax.upsertMetadata(societyId,this.user(userId),dto);}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
