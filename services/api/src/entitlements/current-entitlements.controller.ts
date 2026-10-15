import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { EntitlementService } from './entitlement.service';

@Controller('entitlements')
@UseGuards(BearerGuard, TenantGuard)
export class CurrentEntitlementsController {
  constructor(private readonly entitlements: EntitlementService) {}

  @Get('current')
  async current(@CurrentTenant() societyId: string) {
    const current = await this.entitlements.current(societyId);
    if (!current) throw new ForbiddenException('Society entitlement context is unavailable');
    return current;
  }
}
