export type AdminView =
  | 'overview'
  | 'residents'
  | 'gates'
  | 'workforce'
  | 'marketplace'
  | 'sos'
  | 'helpdesk'
  | 'notices'
  | 'billing'

const roleViews: Readonly<Record<string, readonly AdminView[]>> = {
  SUPER_ADMIN: ['overview', 'residents', 'gates', 'workforce', 'marketplace', 'sos', 'helpdesk', 'notices', 'billing'],
  SOCIETY_ADMIN: ['overview', 'residents', 'gates', 'workforce', 'marketplace', 'sos', 'helpdesk', 'notices', 'billing'],
  COMMITTEE_MEMBER: ['overview', 'gates', 'sos', 'helpdesk', 'notices'],
  FACILITY_MANAGER: ['overview', 'gates', 'workforce', 'marketplace', 'sos', 'helpdesk', 'notices'],
  ACCOUNTANT: ['billing'],
  AUDITOR: ['overview'],
  SECURITY_SUPERVISOR: ['gates', 'sos'],
}

export const adminRoles = new Set(Object.keys(roleViews))

export function viewsForRole(role: string): AdminView[] {
  return [...(roleViews[role] ?? [])]
}
