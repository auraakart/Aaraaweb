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

  it('keeps accountant access limited to reports and billing operations', () => {
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.REPORTS_READ)).toBe(true);
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.BILLING_MANAGE)).toBe(true);
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.PAYMENT_RECONCILE)).toBe(true);
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.AUDIT_READ)).toBe(false);
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.SOCIETY_CONFIGURATION_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.ACCOUNTANT], AppPermission.GATE_ACCESS_PROCESS)).toBe(false);
  });

  it('keeps security supervisors on gate and audit operations without society administration', () => {
    expect(hasPermission([AppRole.SECURITY_SUPERVISOR], AppPermission.GATE_ACCESS_PROCESS)).toBe(true);
    expect(hasPermission([AppRole.SECURITY_SUPERVISOR], AppPermission.AUDIT_READ)).toBe(true);
    expect(hasPermission([AppRole.SECURITY_SUPERVISOR], AppPermission.SOCIETY_CONFIGURATION_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.SECURITY_SUPERVISOR], AppPermission.BILLING_MANAGE)).toBe(false);
    expect(hasPermission([AppRole.SECURITY_SUPERVISOR], AppPermission.PROPERTY_FINANCE_READ)).toBe(false);
  });

  it('keeps tenant and family-member property capabilities separated', () => {
    expect(hasPermission([AppRole.TENANT], AppPermission.PROPERTY_DOCUMENT_READ)).toBe(false);
    expect(hasPermission([AppRole.TENANT], AppPermission.PROPERTY_VOTE)).toBe(false);
    expect(hasPermission([AppRole.FAMILY_MEMBER], AppPermission.PROPERTY_FINANCE_READ)).toBe(false);
    expect(hasPermission([AppRole.FAMILY_MEMBER], AppPermission.HOUSEHOLD_MANAGE_OWN)).toBe(false);
  });

  it('allows guards to perform gate visitor operations', () => {
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.GATE_VISITOR_VERIFY)).toBe(true);
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.GATE_VISITOR_CHECK_IN_OUT)).toBe(true);
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.GATE_ACCESS_PROCESS)).toBe(true);
  });

  it('keeps guards away from audit and society administration', () => {
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.AUDIT_READ)).toBe(false);
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.SOCIETY_CONFIGURATION_READ)).toBe(false);
    expect(hasPermission([AppRole.SECURITY_GUARD], AppPermission.NOTICE_MANAGE)).toBe(false);
  });

  it('does not grant guard permissions to residents', () => {
    expect(hasPermission([AppRole.OWNER], AppPermission.GATE_VISITOR_VERIFY)).toBe(false);
  });

  it('keeps unmapped operational permissions denied by default', () => {
    expect(hasPermission([AppRole.STAFF], AppPermission.SOCIETY_CONFIGURATION_MANAGE)).toBe(false);
  });
});
