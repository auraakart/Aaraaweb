import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { HelpdeskController } from './helpdesk.controller';

describe('HelpdeskController authorization', () => {
  it('requires the helpdesk entitlement', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, HelpdeskController)).toBe(ProductFeature.HELPDESK);
  });

  it('uses resident-owned permissions for resident ticket operations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, HelpdeskController.prototype.mine)).toEqual([
      AppPermission.HELPDESK_READ_OWN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, HelpdeskController.prototype.create)).toEqual([
      AppPermission.HELPDESK_MANAGE_OWN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, HelpdeskController.prototype.activities)).toEqual([
      AppPermission.HELPDESK_READ_OWN,
    ]);
  });

  it('uses reviewer permission for society operations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, HelpdeskController.prototype.queue)).toEqual([
      AppPermission.HELPDESK_REVIEW,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, HelpdeskController.prototype.status)).toEqual([
      AppPermission.HELPDESK_REVIEW,
    ]);
  });
});
