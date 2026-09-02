import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { NoticesController } from './notices.controller';

describe('NoticesController authorization', () => {
  it('requires the notices entitlement', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, NoticesController)).toBe(ProductFeature.NOTICES);
  });

  it('allows resident reads through NOTICE_READ', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, NoticesController.prototype.listPublished)).toEqual([
      AppPermission.NOTICE_READ,
    ]);
  });

  it('requires NOTICE_MANAGE for society operations', () => {
    for (const handler of ['listManage', 'create', 'publish', 'archive', 'history'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, NoticesController.prototype[handler])).toEqual([
        AppPermission.NOTICE_MANAGE,
      ]);
    }
  });
});
