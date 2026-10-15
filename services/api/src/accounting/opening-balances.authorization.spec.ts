import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { OpeningBalancesController } from './opening-balances.controller';

describe('OpeningBalancesController authorization', () => {
  it('requires finance read for opening-balance history', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, OpeningBalancesController.prototype.list)).toEqual([AppPermission.FINANCE_READ]);
  });

  it('requires finance manage for cutover posting', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, OpeningBalancesController.prototype.apply)).toEqual([AppPermission.FINANCE_MANAGE]);
  });

  it('requires the society accounting entitlement', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, OpeningBalancesController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });
});
