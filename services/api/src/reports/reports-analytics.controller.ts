import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { BearerGuard } from '../auth/bearer.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ReportsAnalyticsService } from './reports-analytics.service';

@Controller('reports/analytics')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.ADVANCED_REPORTS)
export class ReportsAnalyticsController{
  constructor(private readonly analytics:ReportsAnalyticsService){}

  @Get('outcomes')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  outcomes(@CurrentTenant() societyId:string,@Req() request:AuthenticatedRequest,@Query('from') from?:string,@Query('to') to?:string){
    const roles=(request.auth?.roles??[]) as AppRole[];
    return this.analytics.outcomes(societyId,from,to,hasPermission(roles,AppPermission.FINANCE_READ));
  }

  @Get('journeys')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  journeys(@CurrentTenant() societyId:string,@Query('from') from?:string,@Query('to') to?:string){
    return this.analytics.journeyFunnel(societyId,from,to);
  }

  @Get('operations')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  operations(@CurrentTenant() societyId:string,@Query('from') from?:string,@Query('to') to?:string){
    return this.analytics.operationsDashboard(societyId,from,to);
  }
}
