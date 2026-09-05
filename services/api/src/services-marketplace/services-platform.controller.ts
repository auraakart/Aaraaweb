import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ProviderVerificationStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesMarketplaceOperationsService } from './services-marketplace-operations.service';
import { ServicesMarketplaceService } from './services-marketplace.service';

class SetProviderVerificationDto {
  @IsEnum(ProviderVerificationStatus)
  verification!: ProviderVerificationStatus;
}

@Controller('platform/services')
@UseGuards(BearerGuard, PermissionsGuard)
export class ServicesPlatformController {
  constructor(
    private readonly marketplace: ServicesMarketplaceService,
    private readonly operations: ServicesMarketplaceOperationsService,
    private readonly prisma: PrismaService,
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
}
