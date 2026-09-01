import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { GatesController } from './gates.controller';

describe('gate discovery authorization', () => {
  it('requires the dedicated gate read permission', () => {
    const metadata = Reflect.getMetadata(PERMISSIONS_KEY, GatesController.prototype.list) as AppPermission[] | undefined;
    expect(metadata).toEqual([AppPermission.GATE_READ]);
  });

  it('allows security and society operations roles to read gates', () => {
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.GATE_READ)).toBe(true);
    expect(hasPermission([AppRole.SECURITY_SUPERVISOR], AppPermission.GATE_READ)).toBe(true);
    expect(hasPermission([AppRole.SOCIETY_ADMIN], AppPermission.GATE_READ)).toBe(true);
    expect(hasPermission([AppRole.COMMITTEE_MEMBER], AppPermission.GATE_READ)).toBe(true);
    expect(hasPermission([AppRole.FACILITY_MANAGER], AppPermission.GATE_READ)).toBe(true);
  });

  it('denies ordinary resident and unrelated workforce roles from gate discovery', () => {
    expect(hasPermission([AppRole.OWNER], AppPermission.GATE_READ)).toBe(false);
    expect(hasPermission([AppRole.TENANT], AppPermission.GATE_READ)).toBe(false);
    expect(hasPermission([AppRole.FAMILY_MEMBER], AppPermission.GATE_READ)).toBe(false);
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.GATE_READ)).toBe(false);
    expect(hasPermission([AppRole.STAFF], AppPermission.GATE_READ)).toBe(false);
    expect(hasPermission([AppRole.VENDOR], AppPermission.GATE_READ)).toBe(false);
  });
});
