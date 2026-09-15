import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { AccountingExportController } from './accounting-export.controller';

describe('AccountingExportController authorization', () => {
  it('requires accounting entitlement and finance-read for every export operation', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, AccountingExportController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
    for (const method of ['create','list','get','artifact'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingExportController.prototype[method])).toEqual([AppPermission.FINANCE_READ]);
    }
  });
});
