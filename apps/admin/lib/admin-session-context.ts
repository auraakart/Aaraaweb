import type { Session } from './admin-client'

export function currentAdminSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem('aaraagate.admin.session') ?? 'null') as Session | null
    if (!value || value.audience === 'PARTNER') return null
    for (const key of ['sessionId', 'societyId', 'role', 'accessToken', 'refreshToken'] as const) {
      if (typeof value[key] !== 'string' || !value[key].trim()) return null
    }
    return value
  } catch { return null }
}

export function sameAdminContext(a: Session | null, b: Session | null): boolean {
  return !!a && !!b && a.sessionId === b.sessionId && a.societyId === b.societyId && a.role === b.role && a.audience === b.audience
}
