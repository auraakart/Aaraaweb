import { AppRole } from './auth.types';

export enum AppPermission {
  VISITOR_READ_OWN = 'VISITOR_READ_OWN',
  VISITOR_MANAGE_OWN = 'VISITOR_MANAGE_OWN',
  GATE_VISITOR_VERIFY = 'GATE_VISITOR_VERIFY',
  GATE_VISITOR_CHECK_IN_OUT = 'GATE_VISITOR_CHECK_IN_OUT',
  HOUSEHOLD_READ_OWN = 'HOUSEHOLD_READ_OWN',
  HOUSEHOLD_MANAGE_OWN = 'HOUSEHOLD_MANAGE_OWN',
  SOCIETY_CONFIGURATION_READ = 'SOCIETY_CONFIGURATION_READ',
  SOCIETY_CONFIGURATION_MANAGE = 'SOCIETY_CONFIGURATION_MANAGE',
  SERVICES_MARKETPLACE_USE = 'SERVICES_MARKETPLACE_USE',
  SERVICES_PROVIDER_MANAGE = 'SERVICES_PROVIDER_MANAGE',
  REPORTS_READ = 'REPORTS_READ',
  AUDIT_READ = 'AUDIT_READ',
}

export const ROLE_PERMISSIONS: Readonly<Record<AppRole, readonly AppPermission[]>> = {
  [AppRole.SUPER_ADMIN]: Object.values(AppPermission),
  [AppRole.SOCIETY_ADMIN]: [
    AppPermission.SOCIETY_CONFIGURATION_READ,
    AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    AppPermission.REPORTS_READ,
    AppPermission.AUDIT_READ,
    AppPermission.SERVICES_PROVIDER_MANAGE,
  ],
  [AppRole.COMMITTEE_MEMBER]: [
    AppPermission.SOCIETY_CONFIGURATION_READ,
    AppPermission.REPORTS_READ,
    AppPermission.AUDIT_READ,
  ],
  [AppRole.FACILITY_MANAGER]: [
    AppPermission.SOCIETY_CONFIGURATION_READ,
    AppPermission.REPORTS_READ,
    AppPermission.SERVICES_PROVIDER_MANAGE,
  ],
  [AppRole.ACCOUNTANT]: [AppPermission.REPORTS_READ],
  [AppRole.OWNER]: [
    AppPermission.VISITOR_READ_OWN,
    AppPermission.VISITOR_MANAGE_OWN,
    AppPermission.HOUSEHOLD_READ_OWN,
    AppPermission.HOUSEHOLD_MANAGE_OWN,
    AppPermission.SERVICES_MARKETPLACE_USE,
  ],
  [AppRole.TENANT]: [
    AppPermission.VISITOR_READ_OWN,
    AppPermission.VISITOR_MANAGE_OWN,
    AppPermission.HOUSEHOLD_READ_OWN,
    AppPermission.HOUSEHOLD_MANAGE_OWN,
    AppPermission.SERVICES_MARKETPLACE_USE,
  ],
  [AppRole.FAMILY_MEMBER]: [
    AppPermission.VISITOR_READ_OWN,
    AppPermission.VISITOR_MANAGE_OWN,
    AppPermission.HOUSEHOLD_READ_OWN,
    AppPermission.SERVICES_MARKETPLACE_USE,
  ],
  [AppRole.SECURITY_SUPERVISOR]: [
    AppPermission.GATE_VISITOR_VERIFY,
    AppPermission.GATE_VISITOR_CHECK_IN_OUT,
    AppPermission.AUDIT_READ,
  ],
  [AppRole.SECURITY_GUARD]: [
    AppPermission.GATE_VISITOR_VERIFY,
    AppPermission.GATE_VISITOR_CHECK_IN_OUT,
  ],
  [AppRole.STAFF]: [],
  [AppRole.VENDOR]: [],
};

export function hasPermission(roles: readonly AppRole[], permission: AppPermission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}
