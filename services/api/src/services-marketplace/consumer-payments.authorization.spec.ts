import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ServicesPlatformController } from './services-platform.controller';

describe('consumer payment authorization', () => {
  it('requires dedicated platform read permission for consumer payment audit visibility', () => {
    for (const handler of ['listConsumerPayments', 'listConsumerPaymentEvents'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, ServicesPlatformController.prototype[handler])).toEqual([
        AppPermission.PLATFORM_CONSUMER_PAYMENT_READ,
      ]);
    }
  });

  it('requires dedicated platform reconciliation permission for payment state changes', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ServicesPlatformController.prototype.setConsumerPaymentStatus)).toEqual([
      AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE,
    ]);
  });

  it('does not leak consumer payment platform permissions into society, resident, guard or vendor roles', () => {
    for (const role of [
      AppRole.SOCIETY_ADMIN,
      AppRole.COMMITTEE_MEMBER,
      AppRole.FACILITY_MANAGER,
      AppRole.ACCOUNTANT,
      AppRole.OWNER,
      AppRole.TENANT,
      AppRole.FAMILY_MEMBER,
      AppRole.SECURITY_SUPERVISOR,
      AppRole.SECURITY_GUARD,
      AppRole.VENDOR,
    ]) {
      expect(hasPermission([role], AppPermission.PLATFORM_CONSUMER_PAYMENT_READ)).toBe(false);
      expect(hasPermission([role], AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE)).toBe(false);
    }
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.PLATFORM_CONSUMER_PAYMENT_READ)).toBe(true);
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE)).toBe(true);
  });
});
