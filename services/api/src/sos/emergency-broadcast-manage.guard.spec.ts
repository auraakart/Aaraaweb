import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { EmergencyBroadcastManageGuard } from './emergency-broadcast-manage.guard';

const contextFor = (roles: AppRole[]) => ({
  switchToHttp: () => ({ getRequest: () => ({ auth: { userId: 'user-1', roles } }) }),
}) as never;

describe('EmergencyBroadcastManageGuard', () => {
  const guard = new EmergencyBroadcastManageGuard();

  it('allows society admin and security supervisor', () => {
    expect(guard.canActivate(contextFor([AppRole.SOCIETY_ADMIN]))).toBe(true);
    expect(guard.canActivate(contextFor([AppRole.SECURITY_SUPERVISOR]))).toBe(true);
  });

  it('denies guard, committee, facility manager and platform super admin operational broadcast authority', () => {
    for (const role of [AppRole.SECURITY_GUARD, AppRole.COMMITTEE_MEMBER, AppRole.FACILITY_MANAGER, AppRole.SUPER_ADMIN]) {
      expect(() => guard.canActivate(contextFor([role]))).toThrow(ForbiddenException);
    }
  });
});
