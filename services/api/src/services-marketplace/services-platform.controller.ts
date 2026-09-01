import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ServicesMarketplaceService } from './services-marketplace.service';

@Controller('platform/services')
@UseGuards(BearerGuard, PermissionsGuard)
export class ServicesPlatformController {
  constructor(private readonly marketplace: ServicesMarketplaceService) {}

  @Post('providers/:providerId/verify')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  verifyProvider(@Param('providerId') providerId: string) {
    return this.marketplace.verifyProvider(providerId);
  }
}
