import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { ReportsAnalyticsController } from './reports-analytics.controller';

describe('V3.9 reports analytics authorization',()=>{
  it('keeps analytics inside Advanced Reports entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,ReportsAnalyticsController)).toBe(ProductFeature.ADVANCED_REPORTS);
  });

  for(const method of ['journeys','operations'] as const){
    it(`${method} requires reports read permission`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,ReportsAnalyticsController.prototype[method])).toEqual([AppPermission.REPORTS_READ]);
    });
  }
});
