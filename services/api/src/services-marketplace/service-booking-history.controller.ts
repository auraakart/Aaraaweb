import { BadRequestException, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, UseGuards, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { FeatureGuard } from '../entitlements/feature.guard';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { ServiceBookingHistoryService } from './service-booking-history.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

@Controller('services-marketplace/bookings')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.HOUSEHOLD_SERVICES)
export class ServiceBookingHistoryController {
  constructor(private readonly history: ServiceBookingHistoryService) {}

  @Get(':bookingId/timeline')
  @RequiresPermissions(AppPermission.SERVICES_MARKETPLACE_USE)
  timeline(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.history.timeline(societyId, userId, bookingId);
  }
}
