import { describe, expect, it } from 'vitest';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AppRole } from '../auth/auth.types';
import { ServicesPlatformController } from './services-platform.controller';

describe('consumer fulfilment authorization', () => {
  it('requires platform read permission for consumer booking visibility', () => {
    for (const handler of ['listConsumerBookings', 'getConsumerBooking', 'listConsumerBookingEvents'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, ServicesPlatformController.prototype[handler])).toEqual([
        AppPermission.PLATFORM_CONSUMER_BOOKING_READ,
      ]);
    }
  });

  it('requires the dedicated platform fulfilment permission for state changes', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ServicesPlatformController.prototype.setConsumerBookingStatus)).toEqual([
      AppPermission.PLATFORM_CONSUMER_BOOKING_FULFIL,
    ]);
  });

  it('does not grant consumer fulfilment permissions to society or resident roles', () => {
    for (const role of [
      AppRole.SOCIETY_ADMIN,
      AppRole.FACILITY_MANAGER,
      AppRole.OWNER,
      AppRole.TENANT,
      AppRole.FAMILY_MEMBER,
      AppRole.SECURITY_SUPERVISOR,
      AppRole.SECURITY_GUARD,
      AppRole.VENDOR,
    ]) {
      expect(hasPermission([role], AppPermission.PLATFORM_CONSUMER_BOOKING_READ)).toBe(false);
      expect(hasPermission([role], AppPermission.PLATFORM_CONSUMER_BOOKING_FULFIL)).toBe(false);
    }
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.PLATFORM_CONSUMER_BOOKING_READ)).toBe(true);
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.PLATFORM_CONSUMER_BOOKING_FULFIL)).toBe(true);
  });
});
