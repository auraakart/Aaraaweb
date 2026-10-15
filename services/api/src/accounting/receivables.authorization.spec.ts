import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { ReceivablesController } from './receivables.controller';

describe('ReceivablesController authorization', () => {
  it('requires society accounting entitlement', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, ReceivablesController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });

  it('separates finance read and finance manage operations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReceivablesController.prototype.listChargeRules)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReceivablesController.prototype.preview)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReceivablesController.prototype.list)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReceivablesController.prototype.ageing)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReceivablesController.prototype.createChargeRule)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReceivablesController.prototype.issue)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ReceivablesController.prototype.addAdjustment)).toEqual([AppPermission.FINANCE_MANAGE]);
  });
});
