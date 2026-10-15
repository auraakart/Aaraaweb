import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { AppPermission, ROLE_PERMISSIONS } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PrivacyPlatformController } from './privacy-platform.controller';

describe('PrivacyPlatformController authorization', () => {
  it('uses platform-only permissions for society-less privacy cases', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PrivacyPlatformController.prototype.listCases)).toEqual([
      AppPermission.PLATFORM_PRIVACY_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PrivacyPlatformController.prototype.history)).toEqual([
      AppPermission.PLATFORM_PRIVACY_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PrivacyPlatformController.prototype.setStatus)).toEqual([
      AppPermission.PLATFORM_PRIVACY_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PrivacyPlatformController.prototype.setLegalHold)).toEqual([
      AppPermission.PLATFORM_PRIVACY_MANAGE,
    ]);
  });

  it('does not grant the platform privacy queue to society operators', () => {
    for (const role of [AppRole.SOCIETY_ADMIN, AppRole.COMMITTEE_MEMBER, AppRole.AUDITOR]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(AppPermission.PLATFORM_PRIVACY_READ);
      expect(ROLE_PERMISSIONS[role]).not.toContain(AppPermission.PLATFORM_PRIVACY_MANAGE);
    }
    expect(ROLE_PERMISSIONS[AppRole.SUPER_ADMIN]).toContain(AppPermission.PLATFORM_PRIVACY_READ);
    expect(ROLE_PERMISSIONS[AppRole.SUPER_ADMIN]).toContain(AppPermission.PLATFORM_PRIVACY_MANAGE);
  });
});
