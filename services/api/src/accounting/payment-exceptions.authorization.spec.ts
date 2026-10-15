import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { PaymentExceptionsController } from './payment-exceptions.controller';

describe('PaymentExceptionsController authorization',()=>{
  const read=['snapshot','reversals','refunds'] as const;
  const manage=['reverse','refund'] as const;
  it('requires society accounting entitlement',()=>expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,PaymentExceptionsController)).toBe(ProductFeature.SOCIETY_ACCOUNTING));
  for(const method of read)it(`${method} requires FINANCE_READ`,()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,PaymentExceptionsController.prototype[method])).toEqual([AppPermission.FINANCE_READ]));
  for(const method of manage)it(`${method} requires FINANCE_MANAGE`,()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,PaymentExceptionsController.prototype[method])).toEqual([AppPermission.FINANCE_MANAGE]));
});
