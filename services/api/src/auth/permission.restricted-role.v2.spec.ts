import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AppRole } from './auth.types';
import { AppPermission, hasPermission } from './permission.types';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

const SENSITIVE_V2_MANAGE_PERMISSIONS = [
  AppPermission.FINANCE_MANAGE,
  AppPermission.GOVERNANCE_MANAGE,
  AppPermission.FACILITIES_MANAGE,
  AppPermission.SOCIETY_VENDORS_MANAGE,
  AppPermission.DOCUMENTS_MANAGE,
  AppPermission.PRIVACY_OPERATIONS_MANAGE,
  AppPermission.OCCUPANCY_LIFECYCLE_MANAGE,
  AppPermission.PARKING_MANAGE,
] as const;

const AUDITOR_READ_PERMISSIONS = [
  AppPermission.SOCIETY_CONFIGURATION_READ,
  AppPermission.REPORTS_READ,
  AppPermission.AUDIT_READ,
  AppPermission.FINANCE_READ,
  AppPermission.GOVERNANCE_READ,
  AppPermission.FACILITIES_READ,
  AppPermission.SOCIETY_VENDORS_READ,
  AppPermission.DOCUMENTS_READ,
  AppPermission.PRIVACY_OPERATIONS_READ,
  AppPermission.OCCUPANCY_LIFECYCLE_READ,
  AppPermission.PARKING_READ,
] as const;

function contextFor(permission: AppPermission, roles: AppRole[]): ExecutionContext {
  class TestController {}
  const handler = () => undefined;
  Reflect.defineMetadata(PERMISSIONS_KEY, [permission], handler);

  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({
        auth: { userId: 'restricted-user', societyId: 'society-a', roles },
      }),
    }),
  } as unknown as ExecutionContext;
}

function expectOnlyManagePermissions(role: AppRole, allowed: readonly AppPermission[]) {
  for (const permission of SENSITIVE_V2_MANAGE_PERMISSIONS) {
    expect(hasPermission([role], permission), `${role} -> ${permission}`).toBe(allowed.includes(permission));
  }
}

describe('Aaraagate v2 restricted-role authorization contract', () => {
  it('keeps Accountant mutation authority confined to finance', () => {
    expectOnlyManagePermissions(AppRole.ACCOUNTANT, [AppPermission.FINANCE_MANAGE]);
  });

  it('keeps Committee Member mutation authority confined to governance', () => {
    expectOnlyManagePermissions(AppRole.COMMITTEE_MEMBER, [AppPermission.GOVERNANCE_MANAGE]);
  });

  it('keeps Facility Manager mutation authority within operations domains', () => {
    expectOnlyManagePermissions(AppRole.FACILITY_MANAGER, [
      AppPermission.FACILITIES_MANAGE,
      AppPermission.SOCIETY_VENDORS_MANAGE,
      AppPermission.OCCUPANCY_LIFECYCLE_MANAGE,
      AppPermission.PARKING_MANAGE,
    ]);
  });

  it('keeps Society Admin out of finance and privacy mutation while retaining delegated society operations', () => {
    expectOnlyManagePermissions(AppRole.SOCIETY_ADMIN, [
      AppPermission.GOVERNANCE_MANAGE,
      AppPermission.FACILITIES_MANAGE,
      AppPermission.SOCIETY_VENDORS_MANAGE,
      AppPermission.DOCUMENTS_MANAGE,
      AppPermission.OCCUPANCY_LIFECYCLE_MANAGE,
      AppPermission.PARKING_MANAGE,
    ]);
  });

  it('gives Auditor cross-domain read evidence without any sensitive mutation authority', () => {
    for (const permission of AUDITOR_READ_PERMISSIONS) {
      expect(hasPermission([AppRole.AUDITOR], permission), `AUDITOR -> ${permission}`).toBe(true);
    }
    expectOnlyManagePermissions(AppRole.AUDITOR, []);
    expect(hasPermission([AppRole.AUDITOR], AppPermission.BILLING_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.AUDITOR], AppPermission.PAYMENT_RECONCILE)).toBe(false);
    expect(hasPermission([AppRole.AUDITOR], AppPermission.NOTICE_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.AUDITOR], AppPermission.SOS_RESPOND)).toBe(false);
    expect(hasPermission([AppRole.AUDITOR], AppPermission.GATE_ACCESS_PROCESS)).toBe(false);
  });

  it('denies all sensitive v2 mutation permissions to security, resident, staff and vendor roles', () => {
    const restrictedRoles = [
      AppRole.SECURITY_SUPERVISOR,
      AppRole.SECURITY_GUARD,
      AppRole.OWNER,
      AppRole.TENANT,
      AppRole.FAMILY_MEMBER,
      AppRole.STAFF,
      AppRole.VENDOR,
    ];

    for (const role of restrictedRoles) {
      expectOnlyManagePermissions(role, []);
    }
  });

  it('enforces the same restricted matrix through PermissionsGuard, not only the helper', () => {
    const guard = new PermissionsGuard(new Reflector());

    expect(guard.canActivate(contextFor(AppPermission.FINANCE_MANAGE, [AppRole.ACCOUNTANT]))).toBe(true);
    expect(() => guard.canActivate(contextFor(AppPermission.GOVERNANCE_MANAGE, [AppRole.ACCOUNTANT]))).toThrow(
      'Insufficient permissions',
    );
    expect(guard.canActivate(contextFor(AppPermission.GOVERNANCE_MANAGE, [AppRole.COMMITTEE_MEMBER]))).toBe(true);
    expect(() => guard.canActivate(contextFor(AppPermission.FINANCE_MANAGE, [AppRole.COMMITTEE_MEMBER]))).toThrow(
      'Insufficient permissions',
    );
    expect(guard.canActivate(contextFor(AppPermission.FACILITIES_MANAGE, [AppRole.FACILITY_MANAGER]))).toBe(true);
    expect(() => guard.canActivate(contextFor(AppPermission.DOCUMENTS_MANAGE, [AppRole.FACILITY_MANAGER]))).toThrow(
      'Insufficient permissions',
    );
    expect(() => guard.canActivate(contextFor(AppPermission.PRIVACY_OPERATIONS_MANAGE, [AppRole.SOCIETY_ADMIN]))).toThrow(
      'Insufficient permissions',
    );
    expect(guard.canActivate(contextFor(AppPermission.AUDIT_READ, [AppRole.AUDITOR]))).toBe(true);
    expect(guard.canActivate(contextFor(AppPermission.FINANCE_READ, [AppRole.AUDITOR]))).toBe(true);
    expect(() => guard.canActivate(contextFor(AppPermission.FINANCE_MANAGE, [AppRole.AUDITOR]))).toThrow(
      'Insufficient permissions',
    );
    expect(() => guard.canActivate(contextFor(AppPermission.PARKING_MANAGE, [AppRole.SECURITY_SUPERVISOR]))).toThrow(
      'Insufficient permissions',
    );
  });
});
