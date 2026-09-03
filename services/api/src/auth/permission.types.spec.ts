import { describe, expect, it } from 'vitest';
import { AppRole } from './auth.types';
import { AppPermission, hasPermission } from './permission.types';

describe('permission matrix', () => {
  it('allows residents to manage their own visitors', () => {
    expect(hasPermission([AppRole.OWNER], AppPermission.VISITOR_MANAGE_OWN)).toBe(true);
    expect(hasPermission([AppRole.TENANT], AppPermission.VISITOR_MANAGE_OWN)).toBe(true);
  });

  it('does not allow a vendor to manage resident visitors', () => {
    expect(hasPermission([AppRole.VENDOR], AppPermission.VISITOR_MANAGE_OWN)).toBe(false);
  });

  it('keeps property finance owner-only while allowing tenants to pay occupied-unit dues', () => {
    expect(hasPermission([AppRole.OWNER], AppPermission.PROPERTY_FINANCE_READ)).toBe(true);
    expect(hasPermission([AppRole.TENANT], AppPermission.PROPERTY_FINANCE_READ)).toBe(false);
    expect(hasPermission([AppRole.TENANT], AppPermission.PAYMENT_CREATE_OWN)).toBe(true);
    expect(hasPermission([AppRole.FAMILY_MEMBER], AppPermission.PAYMENT_CREATE_OWN)).toBe(false);
  });

  it('allows guards to perform gate visitor operations', () => {
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.GATE_VISITOR_VERIFY)).toBe(true);
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.GATE_VISITOR_CHECK_IN_OUT)).toBe(true);
  });

  it('does not grant guard permissions to residents', () => {
    expect(hasPermission([AppRole.OWNER], AppPermission.GATE_VISITOR_VERIFY)).toBe(false);
  });

  it('keeps unmapped operational permissions denied by default', () => {
    expect(hasPermission([AppRole.STAFF], AppPermission.SOCIETY_CONFIGURATION_MANAGE)).toBe(false);
  });
});
