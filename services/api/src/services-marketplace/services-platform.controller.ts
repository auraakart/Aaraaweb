import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { ProviderVerificationStatus, ServiceBookingStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerFulfilmentService } from './consumer-fulfilment.service';
import { ServicesMarketplaceOperationsService } from './services-marketplace-operations.service';
import { ServicesMarketplaceService } from './services-marketplace.service';

const CurrentPlatformUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class SetProviderVerificationDto {
  @IsEnum(ProviderVerificationStatus)
  verification!: ProviderVerificationStatus;
}

class SetConsumerBookingStatusDto {
  @IsEnum(ServiceBookingStatus)
  status!: ServiceBookingStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('platform/services')
@UseGuards(BearerGuard, PermissionsGuard)
export class ServicesPlatformController {
  constructor(
    private readonly marketplace: ServicesMarketplaceService,
    private readonly operations: ServicesMarketplaceOperationsService,
    private readonly prisma: PrismaService,
    private readonly consumerFulfilment: ConsumerFulfilmentService,
  ) {}

  @Get('providers')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  listProviders() {
    return this.prisma.serviceProvider.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        contactName: true,
        phone: true,
        email: true,
        description: true,
        verification: true,
        active: true,
        createdAt: true,
        societies: {
          select: {
            societyId: true,
            status: true,
            commissionBps: true,
            society: { select: { name: true, code: true } },
          },
        },
      },
    });
  }

  @Post('providers/:providerId/verify')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  verifyProvider(@Param('providerId', ParseUUIDPipe) providerId: string) {
    return this.marketplace.verifyProvider(providerId);
  }

  @Patch('providers/:providerId/verification')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  setVerification(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: SetProviderVerificationDto,
  ) {
    return this.operations.setPlatformVerification(providerId, dto.verification);
  }

  @Get('consumer-bookings')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_BOOKING_READ)
  listConsumerBookings() {
    return this.consumerFulfilment.listBookings();
  }

  @Get('consumer-bookings/:bookingId')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_BOOKING_READ)
  getConsumerBooking(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.consumerFulfilment.getBooking(bookingId);
  }

  @Get('consumer-bookings/:bookingId/events')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_BOOKING_READ)
  listConsumerBookingEvents(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.consumerFulfilment.listEvents(bookingId);
  }

  @Post('consumer-bookings/:bookingId/status')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_BOOKING_FULFIL)
  setConsumerBookingStatus(
    @CurrentPlatformUser() actorUserId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: SetConsumerBookingStatusDto,
  ) {
    if (!actorUserId) throw new UnauthorizedException('Authentication required');
    return this.consumerFulfilment.transition(actorUserId, bookingId, dto.status, dto.note);
  }
}
