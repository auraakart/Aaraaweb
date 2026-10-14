import type { Workspace } from './admin-partner'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid domain response')
  return value as Record<string, unknown>
}
export type DomainClaim = { id: string; hostname: string; status: 'PENDING' | 'VERIFIED' | 'REVOKED'; version: number; createdAt: string; verifiedUntil: string | null }
export function domainHostname(value: string): boolean {
  return value.length <= 253 && value === value.toLowerCase() && value.split('.').length >= 2 &&
    value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    !/^\d+$/.test(value.split('.').at(-1) ?? '') && !/\.(localhost|local|internal|test|invalid|example)$/.test(value) &&
    !/(^|\.)example\.(com|net|org)$/.test(value)
}
export const canManagePartnerDomains = (workspace: Workspace | undefined) => Boolean(workspace?.roles.includes('OWNER'))
export const validDomainChallenge = (value: string) => /^[a-f0-9]{64}$/.test(value)
export function parseDomainClaims(value: unknown): { claims: DomainClaim[]; hasMore: boolean } {
  const root = object(value)
  if (!Array.isArray(root.claims) || root.claims.length > 50 || typeof root.hasMore !== 'boolean') throw new Error('Invalid domain list')
  const seen = new Set<string>()
  const claims = root.claims.map(raw => {
    const row = object(raw)
    if (typeof row.id !== 'string' || !uuid.test(row.id) || seen.has(row.id) || typeof row.hostname !== 'string' || !domainHostname(row.hostname) ||
        !['PENDING', 'VERIFIED', 'REVOKED'].includes(String(row.status)) || !Number.isSafeInteger(row.version) || Number(row.version) < 1 ||
        typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) ||
        row.verifiedUntil !== null && (typeof row.verifiedUntil !== 'string' || !Number.isFinite(Date.parse(row.verifiedUntil)))) throw new Error('Invalid domain claim')
    seen.add(row.id)
    if (row.status === 'VERIFIED' && row.verifiedUntil === null) throw new Error('Missing proof expiry')
    return row as DomainClaim
  })
  return { claims, hasMore: root.hasMore }
}
export function parseDomainChallenge(value: unknown, expectedId?: string): { id: string; challenge: string | null } {
  const root = object(value)
  if (typeof root.id !== 'string' || !uuid.test(root.id) || expectedId && root.id !== expectedId ||
      root.status !== 'PENDING' || typeof root.replayed !== 'boolean' || root.replayed !== (root.challenge === null) ||
      root.challenge !== null && (typeof root.challenge !== 'string' || !validDomainChallenge(root.challenge))) throw new Error('Invalid domain proof response')
  return { id: root.id, challenge: root.challenge as string | null }
}
export const domainProofLabel = (claim: DomainClaim, now = Date.now()) => claim.status === 'VERIFIED' ?
  (Date.parse(claim.verifiedUntil ?? '') > now ? 'DNS proof verified' : 'DNS proof expired') : claim.status === 'REVOKED' ? 'Revoked' : 'Awaiting DNS proof'
