import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ACCOUNTING_EXPORT_CONTRACT_V1, AccountingExportService } from './accounting-export.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreateAccountingExportDto {
  @IsString() @MinLength(1) @MaxLength(120) idempotencyKey!:string;
  @IsIn([ACCOUNTING_EXPORT_CONTRACT_V1]) contractVersion!:string;
  @IsIn(['CSV','JSONL']) format!:'CSV'|'JSONL';
  @Matches(/^\d{4}-\d{2}-\d{2}$/) fromDate!:string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) toDate!:string;
}

@Controller('accounting/exports')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class AccountingExportController {
  constructor(private readonly exports:AccountingExportService){}
  @Post() @RequiresPermissions(AppPermission.FINANCE_READ) create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateAccountingExportDto){if(!userId)throw new BadRequestException('Authenticated user is required');return this.exports.create(societyId,userId,dto);}
  @Get() @RequiresPermissions(AppPermission.FINANCE_READ) list(@CurrentTenant() societyId:string){return this.exports.list(societyId);}
  @Get(':id') @RequiresPermissions(AppPermission.FINANCE_READ) get(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.exports.get(societyId,id);}
}
