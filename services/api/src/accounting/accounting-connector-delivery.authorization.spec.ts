import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { AccountingConnectorDeliveryController } from './accounting-connector-delivery.controller';

describe('AccountingConnectorDeliveryController authorization',()=>{
  it('requires accounting entitlement and finance-read permission',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,AccountingConnectorDeliveryController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AccountingConnectorDeliveryController.prototype.list)).toEqual([AppPermission.FINANCE_READ]);
  });
});
