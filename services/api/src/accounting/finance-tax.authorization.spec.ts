import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { FinanceTaxController } from './finance-tax.controller';

describe('FinanceTaxController authorization',()=>{
  it('requires society accounting entitlement',()=>expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,FinanceTaxController)).toBe(ProductFeature.SOCIETY_ACCOUNTING));
  for(const method of ['configuration','listMetadata'] as const)it(`${method} requires FINANCE_READ`,()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,FinanceTaxController.prototype[method])).toEqual([AppPermission.FINANCE_READ]));
  for(const method of ['updateConfiguration','upsertMetadata'] as const)it(`${method} requires FINANCE_MANAGE`,()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,FinanceTaxController.prototype[method])).toEqual([AppPermission.FINANCE_MANAGE]));
});
