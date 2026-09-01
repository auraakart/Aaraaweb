import { BadRequestException, Body, Controller, ExecutionContext, Post, Sse, UseGuards, createParamDecorator } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { NotificationRealtimeService } from './notification-realtime.service';
import { PushNotificationService } from './push-notification.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class RegisterPushDeviceDto {
  @IsString() @IsNotEmpty() token!: string;
  @IsEnum(DevicePlatform) platform!: DevicePlatform;
  @IsOptional() @IsString() deviceId?: string;
}

class UnregisterPushDeviceDto {
  @IsString() @IsNotEmpty() token!: string;
}

@Controller('notifications')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    private readonly realtime: NotificationRealtimeService,
    private readonly push: PushNotificationService,
  ) {}

  @Post('devices/register')
  @RequiresPermissions(AppPermission.ACCESS_READ_OWN)
  registerDevice(@Body() dto: RegisterPushDeviceDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.push.register(societyId, userId, dto.token, dto.platform, dto.deviceId);
  }

  @Post('devices/unregister')
  @RequiresPermissions(AppPermission.ACCESS_READ_OWN)
  unregisterDevice(@Body() dto: UnregisterPushDeviceDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.push.unregister(societyId, userId, dto.token);
  }

  @Sse('resident-stream')
  @RequiresPermissions(AppPermission.ACCESS_READ_OWN)
  residentStream(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.realtime.residentStream(societyId, userId);
  }

  @Sse('gate-stream')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateStream(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated guard is required');
    return this.realtime.gateStream(societyId);
  }
}
