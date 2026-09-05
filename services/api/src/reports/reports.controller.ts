import { Controller, Get, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  summary(
    @CurrentTenant() societyId: string,
    @Req() request: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const roles = request.auth?.roles as AppRole[] | undefined;
    const includeFinancialAmounts = !!roles && hasPermission(roles, AppPermission.BILLING_MANAGE);
    return this.reports.summary(societyId, from, to, includeFinancialAmounts);
  }

  @Get('access')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  access(
    @CurrentTenant() societyId: string,
    @Query('subjectType') subjectType: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.reports.accessFeed(societyId, subjectType, from, to, page ?? 1, pageSize ?? 25);
  }

  @Get('helpdesk')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  helpdesk(
    @CurrentTenant() societyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.reports.helpdeskFeed(societyId, from, to, page ?? 1, pageSize ?? 25);
  }

  @Get('maintenance')
  @RequiresPermissions(AppPermission.REPORTS_READ, AppPermission.BILLING_MANAGE)
  maintenance(
    @CurrentTenant() societyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.reports.maintenanceFeed(societyId, from, to, page ?? 1, pageSize ?? 25);
  }

  @Get('audit')
  @RequiresPermissions(AppPermission.AUDIT_READ)
  audit(
    @CurrentTenant() societyId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.reports.auditFeed(societyId, page ?? 1, pageSize ?? 50);
  }
}
