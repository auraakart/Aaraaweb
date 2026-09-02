import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { BillingController } from './billing.controller';

describe('BillingController authorization', () => {
  it('separates resident and administrator invoice permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BillingController.prototype.mine)).toEqual([AppPermission.PROPERTY_FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BillingController.prototype.issue)).toEqual([AppPermission.BILLING_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BillingController.prototype.units)).toEqual([AppPermission.BILLING_MANAGE]);
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, BillingController.prototype.issue)).toBe(ProductFeature.MAINTENANCE_BILLING);
  });

  it('requires payment entitlement and scoped permissions', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BillingController.prototype.pay)).toEqual([
      AppPermission.PROPERTY_FINANCE_READ,
      AppPermission.PAYMENT_CREATE_OWN,
    ]);
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, BillingController.prototype.pay)).toBe(ProductFeature.PAYMENTS);
  });
});
