import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ReceivablesService } from './receivables.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateChargeRuleDto {
  @IsString() @MinLength(1) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsIn(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL']) frequency!: string;
  @IsInt() @Min(1) amountPaise!: number;
  @IsUUID() receivableAccountId!: string;
  @IsUUID() incomeAccountId!: string;
  @IsOptional() @IsUUID() fundId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(28) dueDay?: number;
  @IsIn(['NONE', 'FIXED', 'PERCENTAGE']) lateFeeMode!: string;
  @IsOptional() @IsInt() @Min(1) lateFeeFixedPaise?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) lateFeeBasisPoints?: number;
  @IsInt() @Min(0) @Max(365) graceDays!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
}

class IssueReceivableDto {
  @IsUUID() chargeRuleId!: string;
  @IsUUID() unitId!: string;
  @IsString() @MinLength(1) @MaxLength(40) billingPeriod!: string;
  @IsDateString() entryDate!: string;
  @IsDateString() dueDate!: string;
  @IsString() @MinLength(1) @MaxLength(60) receivableNumber!: string;
  @IsString() @MinLength(1) @MaxLength(60) journalEntryNumber!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(180) sourceId?: string;
}

class CreateAdjustmentDto {
  @IsIn(['DEBIT', 'CREDIT', 'WAIVER']) type!: 'DEBIT' | 'CREDIT' | 'WAIVER';
  @IsInt() @Min(1) amountPaise!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  @IsDateString() entryDate!: string;
  @IsString() @MinLength(1) @MaxLength(60) journalEntryNumber!: string;
}

@Controller('accounting/receivables')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class ReceivablesController {
  constructor(private readonly receivables: ReceivablesService) {}

  @Get('charge-rules')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  listChargeRules(@CurrentTenant() societyId: string) {
    return this.receivables.listChargeRules(societyId);
  }

  @Post('charge-rules')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  createChargeRule(@CurrentTenant() societyId: string, @Body() dto: CreateChargeRuleDto) {
    return this.receivables.createChargeRule(societyId, dto);
  }

  @Post('preview')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  preview(@CurrentTenant() societyId: string, @Body() dto: IssueReceivableDto) {
    return this.receivables.previewIssue(societyId, dto);
  }

  @Post('issue')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  issue(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Body() dto: IssueReceivableDto,
  ) {
    return this.receivables.issue(societyId, this.requireUser(userId), dto);
  }

  @Get()
  @RequiresPermissions(AppPermission.FINANCE_READ)
  list(@CurrentTenant() societyId: string) {
    return this.receivables.listReceivables(societyId);
  }

  @Get('ageing')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  ageing(@CurrentTenant() societyId: string, @Query('asOf') asOf?: string) {
    const resolved = asOf?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved)) throw new BadRequestException('asOf must be YYYY-MM-DD');
    return this.receivables.ageing(societyId, resolved);
  }

  @Post(':receivableId/adjustments')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  addAdjustment(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('receivableId', new ParseUUIDPipe()) receivableId: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.receivables.addAdjustment(societyId, this.requireUser(userId), receivableId, dto);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
