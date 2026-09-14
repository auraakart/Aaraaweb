import { describe, expect, it } from 'vitest';
import { AppPermission, ROLE_PERMISSIONS } from '../auth/permission.types';
import { AppRole } from '../auth/auth.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ParkingController } from './parking.controller';

describe('Parking v2 authorization', () => {
  it('uses parking-specific capability permissions on all operations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ParkingController.prototype.list)).toEqual([AppPermission.PARKING_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ParkingController.prototype.history)).toEqual([AppPermission.PARKING_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ParkingController.prototype.createSlot)).toEqual([AppPermission.PARKING_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ParkingController.prototype.allocate)).toEqual([AppPermission.PARKING_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ParkingController.prototype.release)).toEqual([AppPermission.PARKING_MANAGE]);
  });

  it('keeps mutation authority with society operations roles and read-only committee/supervisor access', () => {
    expect(ROLE_PERMISSIONS[AppRole.SOCIETY_ADMIN]).toContain(AppPermission.PARKING_MANAGE);
    expect(ROLE_PERMISSIONS[AppRole.FACILITY_MANAGER]).toContain(AppPermission.PARKING_MANAGE);
    expect(ROLE_PERMISSIONS[AppRole.COMMITTEE_MEMBER]).toContain(AppPermission.PARKING_READ);
    expect(ROLE_PERMISSIONS[AppRole.COMMITTEE_MEMBER]).not.toContain(AppPermission.PARKING_MANAGE);
    expect(ROLE_PERMISSIONS[AppRole.SECURITY_SUPERVISOR]).toContain(AppPermission.PARKING_READ);
    expect(ROLE_PERMISSIONS[AppRole.SECURITY_SUPERVISOR]).not.toContain(AppPermission.PARKING_MANAGE);
    expect(ROLE_PERMISSIONS[AppRole.SECURITY_GUARD]).not.toContain(AppPermission.PARKING_READ);
  });
});
