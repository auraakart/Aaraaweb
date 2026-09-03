import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { ServicesMarketplaceController } from './services-marketplace.controller';

describe('services marketplace admin authorization', () => {
  it('protects society catalog, booking and lifecycle operations with provider management', () => {
    for (const handler of ['adminCatalog', 'adminBookings', 'approveProvider', 'createOffering', 'confirm', 'complete'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, ServicesMarketplaceController.prototype[handler])).toEqual([AppPermission.SERVICES_PROVIDER_MANAGE]);
    }
  });

  it('keeps platform verification separate from society operations', () => {
    expect(hasPermission([AppRole.SOCIETY_ADMIN], AppPermission.SERVICES_PROVIDER_MANAGE)).toBe(true);
    expect(hasPermission([AppRole.FACILITY_MANAGER], AppPermission.SERVICES_PROVIDER_MANAGE)).toBe(true);
    expect(hasPermission([AppRole.SOCIETY_ADMIN], AppPermission.PLATFORM_PROVIDER_VERIFY)).toBe(false);
    expect(hasPermission([AppRole.FACILITY_MANAGER], AppPermission.PLATFORM_PROVIDER_VERIFY)).toBe(false);
  });
});
