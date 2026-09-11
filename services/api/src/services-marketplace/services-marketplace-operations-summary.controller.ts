import { Controller, Get, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ServicesMarketplaceOperationsSummaryService } from './services-marketplace-operations-summary.service';

@Controller('platform/services/operations')
@UseGuards(BearerGuard, PermissionsGuard)
@RequiresPermissions(AppPermission.PLATFORM_SERVICE_CATALOG_MANAGE)
export class ServicesMarketplaceOperationsSummaryController {
  constructor(private readonly summary: ServicesMarketplaceOperationsSummaryService) {}

  @Get('summary')
  getSummary() {
    return this.summary.getSummary();
  }
}
