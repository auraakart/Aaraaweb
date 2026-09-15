import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { AccountingConnectorDeliveryController } from './accounting-connector-delivery.controller';

describe('AccountingConnectorDeliveryController authorization',()=>{
  it('requires accounting entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,AccountingConnectorDeliveryController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });
  it('keeps delivery visibility, health, readiness, evidence and action history read-only',()=>{
    for(const method of ['list','metrics','actions','readiness','evidence'] as const){
      expect(Reflect.getMetadata(PERMISSIONS_KEY,AccountingConnectorDeliveryController.prototype[method])).toEqual([AppPermission.FINANCE_READ]);
    }
  });
  it('requires finance-manage permission for manual retries',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AccountingConnectorDeliveryController.prototype.retry)).toEqual([AppPermission.FINANCE_MANAGE]);
  });
});
