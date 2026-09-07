import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';

const nonPlatformRoles = [
  AppRole.SOCIETY_ADMIN,
  AppRole.COMMITTEE_MEMBER,
  AppRole.FACILITY_MANAGER,
  AppRole.ACCOUNTANT,
  AppRole.OWNER,
  AppRole.TENANT,
  AppRole.FAMILY_MEMBER,
  AppRole.SECURITY_SUPERVISOR,
  AppRole.SECURITY_GUARD,
  AppRole.STAFF,
  AppRole.VENDOR,
];

describe('consumer dispatch authorization', () => {
  it('grants platform dispatch permissions to SUPER_ADMIN', () => {
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.PLATFORM_CONSUMER_DISPATCH_READ)).toBe(true);
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.PLATFORM_CONSUMER_DISPATCH_MANAGE)).toBe(true);
  });

  it('does not leak consumer dispatch platform permissions to society, resident, guard or vendor roles', () => {
    for (const role of nonPlatformRoles) {
      expect(hasPermission([role], AppPermission.PLATFORM_CONSUMER_DISPATCH_READ)).toBe(false);
      expect(hasPermission([role], AppPermission.PLATFORM_CONSUMER_DISPATCH_MANAGE)).toBe(false);
    }
  });
});
