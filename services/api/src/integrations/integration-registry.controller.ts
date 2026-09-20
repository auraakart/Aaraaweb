import { Controller, Get, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { IntegrationRegistryService } from './integration-registry.service';

@Controller('integrations/registry')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class IntegrationRegistryController {
  constructor(private readonly registry: IntegrationRegistryService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  list(@CurrentTenant() societyId: string) {
    return this.registry.list(societyId);
  }
}
