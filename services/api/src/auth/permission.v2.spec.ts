import { AppRole } from './auth.types';
import { AppPermission, hasPermission } from './permission.types';

describe('Aaraagate v2 society operations permissions', () => {
  it('keeps finance mutation authority with accountant and platform super admin', () => {
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.FINANCE_MANAGE)).toBe(true);
    expect(hasPermission([AppRole.COMMITTEE_MEMBER], AppPermission.FINANCE_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.FACILITY_MANAGER], AppPermission.FINANCE_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.FINANCE_MANAGE)).toBe(true);
  });

  it('lets committee govern without receiving facility or vendor mutation authority', () => {
    expect(hasPermission([AppRole.COMMITTEE_MEMBER], AppPermission.GOVERNANCE_MANAGE)).toBe(true);
    expect(hasPermission([AppRole.COMMITTEE_MEMBER], AppPermission.FACILITIES_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.COMMITTEE_MEMBER], AppPermission.SOCIETY_VENDORS_MANAGE)).toBe(false);
  });

  it('lets facility operations manage facilities and society vendors without finance authority', () => {
    expect(hasPermission([AppRole.FACILITY_MANAGER], AppPermission.FACILITIES_MANAGE)).toBe(true);
    expect(hasPermission([AppRole.FACILITY_MANAGER], AppPermission.SOCIETY_VENDORS_MANAGE)).toBe(true);
    expect(hasPermission([AppRole.FACILITY_MANAGER], AppPermission.FINANCE_MANAGE)).toBe(false);
  });

  it('does not expose v2 society-operations permissions to guards or relationship roles', () => {
    for (const role of [AppRole.SECURITY_GUARD, AppRole.SECURITY_SUPERVISOR, AppRole.TENANT, AppRole.FAMILY_MEMBER]) {
      expect(hasPermission([role], AppPermission.FINANCE_READ)).toBe(false);
      expect(hasPermission([role], AppPermission.GOVERNANCE_MANAGE)).toBe(false);
      expect(hasPermission([role], AppPermission.FACILITIES_MANAGE)).toBe(false);
      expect(hasPermission([role], AppPermission.DOCUMENTS_MANAGE)).toBe(false);
      expect(hasPermission([role], AppPermission.PRIVACY_OPERATIONS_READ)).toBe(false);
    }
  });

  it('keeps privacy mutation authority platform-only until the v2 workflow defines scoped delegation', () => {
    expect(hasPermission([AppRole.SOCIETY_ADMIN], AppPermission.PRIVACY_OPERATIONS_READ)).toBe(true);
    expect(hasPermission([AppRole.SOCIETY_ADMIN], AppPermission.PRIVACY_OPERATIONS_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.SUPER_ADMIN], AppPermission.PRIVACY_OPERATIONS_MANAGE)).toBe(true);
  });
});
