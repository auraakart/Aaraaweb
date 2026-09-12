import { BadRequestException, Body, Controller, ExecutionContext, Get, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { LateFeesService } from './late-fees.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class ApplyLateFeeDto {
  @IsDateString() asOfDate!: string;
  @IsDateString() entryDate!: string;
  @IsString() @MinLength(1) @MaxLength(120) idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(40) journalPrefix!: string;
}

@Controller('accounting/late-fees')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class LateFeesController {
  constructor(private readonly lateFees: LateFeesService) {}

  @Get('preview')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  preview(@CurrentTenant() societyId: string, @Query('asOf') asOf?: string) {
    return this.lateFees.preview(societyId, this.resolveDate(asOf));
  }

  @Post('apply')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  apply(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Body() dto: ApplyLateFeeDto,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.lateFees.apply(societyId, userId, dto);
  }

  @Get('batches')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  listBatches(@CurrentTenant() societyId: string) {
    return this.lateFees.listBatches(societyId);
  }

  @Get('unapplied-cash')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  unappliedCash(@CurrentTenant() societyId: string) {
    return this.lateFees.unappliedCashSummary(societyId);
  }

  private resolveDate(value?: string) {
    const resolved = value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved)) throw new BadRequestException('asOf must be YYYY-MM-DD');
    return resolved;
  }
}
