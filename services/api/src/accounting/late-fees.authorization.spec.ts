import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { LateFeesController } from './late-fees.controller';

describe('LateFeesController authorization', () => {
  it('requires society accounting entitlement', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, LateFeesController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });

  it('keeps preview and reporting read-only while apply requires finance manage', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, LateFeesController.prototype.preview)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, LateFeesController.prototype.listBatches)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, LateFeesController.prototype.unappliedCash)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, LateFeesController.prototype.apply)).toEqual([AppPermission.FINANCE_MANAGE]);
  });
});
