import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ReportsController } from './reports.controller';

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
});
