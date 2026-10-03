import { AppRole } from './auth.types';
import { AppPermission, hasPermission } from './permission.types';

/**
 * Property finance intentionally separates owner accounting visibility from
 * resident payment authority. Current tenants may see dues they are eligible
 * to pay without inheriting owner-only accounting permissions.
 */
export function canReadPropertyPayables(roles: readonly AppRole[]) {
  return hasPermission(roles, AppPermission.PROPERTY_FINANCE_READ)
    || hasPermission(roles, AppPermission.PAYMENT_CREATE_OWN);
}

export function canReadPropertyAccounting(roles: readonly AppRole[]) {
  return hasPermission(roles, AppPermission.PROPERTY_FINANCE_READ);
}
