import { Controller, ForbiddenException, Get, ParseIntPipe, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';

type CsvResponse = {
  setHeader(name: string, value: string): void;
  send(body: string): void;
};

@Controller('reports')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.ADVANCED_REPORTS)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ReportsExportService,
  ) {}

  @Get('summary')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  summary(
    @CurrentTenant() societyId: string,
    @Req() request: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const roles = request.auth?.roles as AppRole[] | undefined;
    const includeFinancialAmounts = !!roles && hasPermission(roles, AppPermission.FINANCE_READ);
    return this.reports.summary(societyId, from, to, includeFinancialAmounts);
  }

  @Get('summary/comparison')
  @RequiresPermissions(AppPermission.REPORTS_READ)
  summaryComparison(
    @CurrentTenant() societyId: string,
    @Req() request: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const roles = request.auth?.roles as AppRole[] | undefined;
    const includeFinancialAmounts = !!roles && hasPermission(roles, AppPermission.FINANCE_READ);
    return this.reports.summaryComparison(societyId, from, to, includeFinancialAmounts);
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
  @RequiresPermissions(AppPermission.REPORTS_READ, AppPermission.FINANCE_READ)
  maintenance(
    @CurrentTenant() societyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.reports.maintenanceFeed(societyId, from, to, page ?? 1, pageSize ?? 25);
  }

  @Get('maintenance/export.csv')
  @RequiresPermissions(AppPermission.REPORTS_READ, AppPermission.FINANCE_READ)
  async maintenanceExport(
    @CurrentTenant() societyId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: CsvResponse,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const actorUserId = request.auth?.userId;
    if (!actorUserId) throw new ForbiddenException('Authenticated user is required');
    const result = await this.exports.maintenanceCsv(societyId, actorUserId, from, to);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    response.setHeader('X-Aaraagate-Export-Rows', String(result.rowCount));
    response.send(result.csv);
  }

  @Get('audit/export.csv')
  @RequiresPermissions(AppPermission.AUDIT_READ)
  async auditExport(
    @CurrentTenant() societyId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: CsvResponse,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('event') event?: string,
  ) {
    const actorUserId = request.auth?.userId;
    if (!actorUserId) throw new ForbiddenException('Authenticated user is required');
    const result = await this.exports.auditCsv(societyId, actorUserId, from, to, event);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    response.setHeader('X-Aaraagate-Export-Rows', String(result.rowCount));
    response.send(result.csv);
  }

  @Get('security-events')
  @RequiresPermissions(AppPermission.AUDIT_READ)
  securityEvents(
    @CurrentTenant() societyId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query('eventType') eventType?: string,
  ) {
    return this.reports.securityEventFeed(societyId, page ?? 1, pageSize ?? 50, eventType);
  }

  @Get('audit')
  @RequiresPermissions(AppPermission.AUDIT_READ)
  audit(
    @CurrentTenant() societyId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query('event') event?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.auditFeed(societyId, page ?? 1, pageSize ?? 50, event, from, to);
  }
}
