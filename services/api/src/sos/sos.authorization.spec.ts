import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';

describe('SOS authorization', () => {
  it('allows residents to trigger and read their own SOS incidents', () => {
    for (const role of [AppRole.OWNER, AppRole.TENANT, AppRole.FAMILY_MEMBER]) {
      expect(hasPermission([role], AppPermission.SOS_TRIGGER)).toBe(true);
      expect(hasPermission([role], AppPermission.SOS_READ_OWN)).toBe(true);
      expect(hasPermission([role], AppPermission.SOS_RESPOND)).toBe(false);
    }
  });

  it('allows society operations and security to respond without resident trigger rights', () => {
    for (const role of [
      AppRole.SOCIETY_ADMIN,
      AppRole.COMMITTEE_MEMBER,
      AppRole.FACILITY_MANAGER,
      AppRole.SECURITY_SUPERVISOR,
      AppRole.SECURITY_GUARD,
    ]) {
      expect(hasPermission([role], AppPermission.SOS_RESPOND)).toBe(true);
    }
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.SOS_TRIGGER)).toBe(false);
  });

  it('keeps unrelated staff and vendors denied by default', () => {
    for (const role of [AppRole.STAFF, AppRole.VENDOR, AppRole.ACCOUNTANT]) {
      expect(hasPermission([role], AppPermission.SOS_TRIGGER)).toBe(false);
      expect(hasPermission([role], AppPermission.SOS_READ_OWN)).toBe(false);
      expect(hasPermission([role], AppPermission.SOS_RESPOND)).toBe(false);
    }
  });
});
