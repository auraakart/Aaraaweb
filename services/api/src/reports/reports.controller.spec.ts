import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ReportsController } from './reports.controller';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';

describe('ReportsController entitlement and permission boundaries', () => {
  it('requires the advanced reports product feature', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, ReportsController)).toBe(ProductFeature.ADVANCED_REPORTS);
  });

  it('enforces feature metadata through FeatureGuard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, ReportsController) ?? []) as unknown[];
    expect(guards).toContain(FeatureGuard);
  });

  it('requires finance read, not legacy billing mutation authority, for maintenance reports', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.maintenance)).toEqual([
      AppPermission.REPORTS_READ,
      AppPermission.FINANCE_READ,
    ]);
  });

  it('requires the same finance-read boundary for maintenance CSV exports', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.maintenanceExport)).toEqual([
      AppPermission.REPORTS_READ,
      AppPermission.FINANCE_READ,
    ]);
  });

  it('requires audit-read for audit CSV exports', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.auditExport)).toEqual([
      AppPermission.AUDIT_READ,
    ]);
  });

  it('keeps comparison dashboards behind the reports-read boundary', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReportsController.prototype.summaryComparison)).toEqual([
      AppPermission.REPORTS_READ,
    ]);
  });

  it('includes financial summary amounts for a finance-read committee member', () => {
    const summary = vi.fn();
    const controller = new ReportsController(
      { summary } as unknown as ReportsService,
      {} as ReportsExportService,
    );
    const request = { auth: { roles: [AppRole.COMMITTEE_MEMBER] } } as unknown as AuthenticatedRequest;

    controller.summary('society-1', request);

    expect(summary).toHaveBeenCalledWith('society-1', undefined, undefined, true);
  });

  it('redacts financial summary amounts from reports readers without finance read', () => {
    const summary = vi.fn();
    const controller = new ReportsController(
      { summary } as unknown as ReportsService,
      {} as ReportsExportService,
    );
    const request = { auth: { roles: [AppRole.FACILITY_MANAGER] } } as unknown as AuthenticatedRequest;

    controller.summary('society-1', request);

    expect(summary).toHaveBeenCalledWith('society-1', undefined, undefined, false);
  });
});
