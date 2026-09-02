import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { SosService } from './sos.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class TriggerSosDto {
  @IsUUID() unitId!: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}

class SosActionDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller('sos')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOS)
export class SosController {
  constructor(private readonly sos: SosService) {}

  @Post()
  @RequiresPermissions(AppPermission.SOS_TRIGGER)
  trigger(@Body() dto: TriggerSosDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.sos.trigger(societyId, this.requireUser(userId), dto);
  }

  @Get('mine')
  @RequiresPermissions(AppPermission.SOS_READ_OWN)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.sos.listMine(societyId, this.requireUser(userId));
  }

  @Patch(':incidentId/cancel')
  @RequiresPermissions(AppPermission.SOS_TRIGGER)
  cancel(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: SosActionDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.sos.cancel(societyId, this.requireUser(userId), incidentId, dto.note);
  }

  @Get('manage')
  @RequiresPermissions(AppPermission.SOS_RESPOND)
  manage(@CurrentTenant() societyId: string) {
    return this.sos.listManage(societyId);
  }

  @Patch('manage/:incidentId/acknowledge')
  @RequiresPermissions(AppPermission.SOS_RESPOND)
  acknowledge(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: SosActionDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.sos.acknowledge(societyId, this.requireUser(userId), incidentId, dto.note);
  }

  @Patch('manage/:incidentId/resolve')
  @RequiresPermissions(AppPermission.SOS_RESPOND)
  resolve(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: SosActionDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.sos.resolve(societyId, this.requireUser(userId), incidentId, dto.note);
  }

  @Get('manage/:incidentId/history')
  @RequiresPermissions(AppPermission.SOS_RESPOND)
  history(@Param('incidentId', ParseUUIDPipe) incidentId: string, @CurrentTenant() societyId: string) {
    return this.sos.history(societyId, incidentId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
