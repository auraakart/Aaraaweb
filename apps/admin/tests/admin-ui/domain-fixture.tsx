import React from 'react'
import { createRoot } from 'react-dom/client'
import DomainsPage from '../../app/partners/domains/page'
const params = new URLSearchParams(location.search), a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333', d = '44444444-4444-4444-8444-444444444444'
sessionStorage.setItem('aaraagate.partner.session', JSON.stringify({ sessionId: d, societyId: '', role: 'PARTNER', audience: 'PARTNER', accessToken: 'access', refreshToken: 'refresh', societyName: 'Partner' }))
const requests: { path: string; body: unknown }[] = []; Object.assign(window, { domainRequests: requests })
const rows = new Map([[a, [{ id: c, hostname: 'portal.alpha.in', status: 'PENDING', version: 1, createdAt: '2026-10-14T00:00:00Z', verifiedUntil: null as string | null }]], [b, [{ id: d, hostname: 'portal.beta.in', status: 'PENDING', version: 1, createdAt: '2026-10-14T00:00:00Z', verifiedUntil: null as string | null }]]])
let failed = false
window.fetch = async (input, init) => {
  const path = String(input), body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
  requests.push({ path, body })
  if (path.endsWith('/workspaces')) return Response.json({ memberships: [{ id: c, role: params.get('role') ?? 'OWNER', partner: { id: a, displayName: 'Partner Alpha' } }, { id: d, role: params.get('role') ?? 'OWNER', partner: { id: b, displayName: 'Partner Beta' } }], hasMore: false })
  if (params.has('stale') && !body) await new Promise(resolve => setTimeout(resolve, 300))
  const partner = path.includes(a) ? a : b, list = rows.get(partner)!, row = list[0]
  if (!body) return params.has('denied') ? Response.json({ message: 'Partner resource unavailable' }, { status: 403 }) : Response.json({ claims: list, hasMore: false })
  if (params.has('retry') && !failed) { failed = true; throw new Error('Connection lost') }
  if (path.endsWith('/revoke')) { row.status = 'REVOKED'; row.version++; return Response.json({ id: row.id, status: 'REVOKED', replayed: false }) }
  if (path.endsWith('/verify')) { row.status = 'VERIFIED'; row.version++; row.verifiedUntil = '2030-01-01T00:00:00Z'; return Response.json({ id: row.id, status: 'VERIFIED', routingActivated: false }) }
  if (path.endsWith('/reissue')) { row.status = 'PENDING'; row.version++; return Response.json({ id: row.id, status: 'PENDING', challenge: 'a'.repeat(64), replayed: false }) }
  list.push({ id: '55555555-5555-4555-8555-555555555555', hostname: String(body.hostname), status: 'PENDING', version: 1, createdAt: '2026-10-14T00:00:00Z', verifiedUntil: null })
  return Response.json({ id: list.at(-1)!.id, status: 'PENDING', challenge: 'a'.repeat(64), replayed: false })
}
createRoot(document.getElementById('root')!).render(<DomainsPage />)
