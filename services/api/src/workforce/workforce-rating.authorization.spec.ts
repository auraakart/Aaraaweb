import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { WorkforceRatingController } from './workforce-rating.controller';

describe('WorkforceRatingController authorization', () => {
  it('requires domestic-help entitlement at controller scope', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, WorkforceRatingController)).toBe(ProductFeature.DOMESTIC_HELP);
  });

  it('uses own-workforce permissions for resident ratings', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceRatingController.prototype.mine)).toEqual([
      AppPermission.WORKFORCE_READ_OWN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceRatingController.prototype.rate)).toEqual([
      AppPermission.WORKFORCE_MANAGE_OWN,
    ]);
  });

  it('requires workforce review permission for society rating summary', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceRatingController.prototype.summary)).toEqual([
      AppPermission.WORKFORCE_REVIEW,
    ]);
  });
});
