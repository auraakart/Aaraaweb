import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ReportsAnalyticsService } from './reports-analytics.service';

@Controller('platform/analytics')
@UseGuards(BearerGuard,PermissionsGuard)
export class ReportsPlatformAnalyticsController{
  constructor(private readonly analytics:ReportsAnalyticsService){}

  @Get('outcomes')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_BOOKING_READ)
  outcomes(@Query('from') from?:string,@Query('to') to?:string){
    return this.analytics.platformOutcomes(from,to);
  }
}
