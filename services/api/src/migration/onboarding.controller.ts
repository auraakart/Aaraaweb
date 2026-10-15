import { Controller, Get, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { OnboardingReadinessService } from './onboarding-readiness.service';

@Controller('onboarding')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class OnboardingController{
  constructor(private readonly onboarding:OnboardingReadinessService){}

  @Get('readiness')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  readiness(@CurrentTenant() societyId:string){
    return this.onboarding.readiness(societyId);
  }
}
