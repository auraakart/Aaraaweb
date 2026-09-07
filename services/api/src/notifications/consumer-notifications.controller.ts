import { BadRequestException, Body, Controller, ExecutionContext, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PushNotificationService } from './push-notification.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class RegisterConsumerPushDeviceDto {
  @IsString() @IsNotEmpty() token!: string;
  @IsEnum(DevicePlatform) platform!: DevicePlatform;
  @IsOptional() @IsString() deviceId?: string;
}

class UnregisterConsumerPushDeviceDto {
  @IsString() @IsNotEmpty() token!: string;
}

@Controller('consumer/notifications')
@UseGuards(BearerGuard)
export class ConsumerNotificationsController {
  constructor(private readonly push: PushNotificationService) {}

  @Post('devices/register')
  registerDevice(@Body() dto: RegisterConsumerPushDeviceDto, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated consumer is required');
    return this.push.registerConsumer(userId, dto.token, dto.platform, dto.deviceId);
  }

  @Post('devices/unregister')
  unregisterDevice(@Body() dto: UnregisterConsumerPushDeviceDto, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated consumer is required');
    return this.push.unregisterConsumer(userId, dto.token);
  }
}
