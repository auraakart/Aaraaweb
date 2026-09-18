import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { AmenitiesController } from './amenities.controller';

describe('AmenitiesController reliability authorization', () => {
  it('keeps resident booking and administrator revocation permissions separated', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AmenitiesController.prototype.createBooking)).toEqual([
      AppPermission.AMENITY_BOOK_OWN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AmenitiesController.prototype.revoke)).toEqual([
      AppPermission.AMENITY_MANAGE,
    ]);
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, AmenitiesController)).toBe(ProductFeature.AMENITIES);
  });
});
