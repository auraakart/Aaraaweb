import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { SettlementService } from './settlement.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class AllocatePaymentDto {
  @IsUUID() paymentId!: string;
  @IsInt() @Min(1) amountPaise!: number;
  @IsString() @MinLength(1) @MaxLength(120) idempotencyKey!: string;
}

@Controller('accounting/settlements')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Post('receivables/:receivableId/allocate')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  allocate(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('receivableId', new ParseUUIDPipe()) receivableId: string,
    @Body() dto: AllocatePaymentDto,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.settlement.allocate(societyId, userId, receivableId, dto);
  }

  @Get('payments/:paymentId/availability')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  availability(
    @CurrentTenant() societyId: string,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
  ) {
    return this.settlement.paymentAvailability(societyId, paymentId);
  }

  @Get('payments/:paymentId/allocations')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  allocations(
    @CurrentTenant() societyId: string,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
  ) {
    return this.settlement.listPaymentAllocations(societyId, paymentId);
  }
}
