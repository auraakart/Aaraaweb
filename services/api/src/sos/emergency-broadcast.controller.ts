import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { EmergencyBroadcastManageGuard } from './emergency-broadcast-manage.guard';
import { EmergencyBroadcastService } from './emergency-broadcast.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM'] as const;

class PublishEmergencyBroadcastDto {
  @IsOptional() @IsUUID() incidentId?: string;
  @IsString() @MaxLength(160) title!: string;
  @IsString() @MaxLength(2000) body!: string;
  @IsOptional() @IsIn(SEVERITIES) severity?: (typeof SEVERITIES)[number];
}

@Controller('sos/broadcasts')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOS)
export class EmergencyBroadcastController {
  constructor(private readonly broadcasts: EmergencyBroadcastService) {}

  @Get('mine')
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.broadcasts.listMine(societyId, this.requireUser(userId));
  }

  @Patch(':broadcastId/acknowledge')
  acknowledge(
    @Param('broadcastId', ParseUUIDPipe) broadcastId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.broadcasts.acknowledge(societyId, this.requireUser(userId), broadcastId);
  }

  @Get('manage')
  @RequiresPermissions(AppPermission.SOS_RESPOND)
  @UseGuards(EmergencyBroadcastManageGuard)
  manage(@CurrentTenant() societyId: string) {
    return this.broadcasts.listManage(societyId);
  }

  @Post('manage')
  @RequiresPermissions(AppPermission.SOS_RESPOND)
  @UseGuards(EmergencyBroadcastManageGuard)
  publish(
    @Body() dto: PublishEmergencyBroadcastDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.broadcasts.publish(societyId, this.requireUser(userId), dto);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}