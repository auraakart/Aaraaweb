import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AppRole } from './auth.types';
import { AppPermission } from './permission.types';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

function contextFor(permission: AppPermission, roles: AppRole[]): ExecutionContext {
  class TestController {}
  const handler = () => undefined;
  Reflect.defineMetadata(PERMISSIONS_KEY, [permission], handler);

  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({
        auth: { userId: 'user-1', societyId: 'society-1', roles },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard operational separation of duties', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('allows security guards to execute gate processing operations', () => {
    expect(guard.canActivate(contextFor(AppPermission.GATE_ACCESS_PROCESS, [AppRole.SECURITY_GUARD]))).toBe(true);
  });

  it('allows security supervisors to execute gate processing operations', () => {
    expect(guard.canActivate(contextFor(AppPermission.GATE_VISITOR_CHECK_IN_OUT, [AppRole.SECURITY_SUPERVISOR]))).toBe(true);
  });

  it('blocks super admin from operational gate actions even though the generic permission is inherited', () => {
    expect(() => guard.canActivate(contextFor(AppPermission.GATE_ACCESS_PROCESS, [AppRole.SUPER_ADMIN]))).toThrow(
      'Gate security role required',
    );
  });

  it('keeps super admin access to non-operational platform permissions unchanged', () => {
    expect(guard.canActivate(contextFor(AppPermission.REPORTS_READ, [AppRole.SUPER_ADMIN]))).toBe(true);
  });

  it('still rejects roles that do not hold the requested permission', () => {
    expect(() => guard.canActivate(contextFor(AppPermission.GATE_ACCESS_PROCESS, [AppRole.OWNER]))).toThrow(
      'Insufficient permissions',
    );
  });
});
