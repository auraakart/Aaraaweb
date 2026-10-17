import assert from 'node:assert/strict'
import { canManagePartnerDomains, domainHostname, domainProofLabel, parseDomainChallenge, parseDomainClaims } from '../lib/admin-partner-domain.ts'
const id = '11111111-1111-4111-8111-111111111111'
const claim = { id, hostname: 'portal.partner.in', status: 'PENDING', version: 1, createdAt: '2026-10-14T00:00:00Z', verifiedUntil: null }
assert.deepEqual(parseDomainClaims({ claims: [claim], hasMore: false }).claims, [claim])
for (const edit of [x => x.id = 'bad', x => x.version = 0, x => x.version = 1.2, x => x.hostname = 'https://portal.partner.in', x => x.status = 'ACTIVE', x => x.verifiedUntil = 'bad', x => x.status = 'VERIFIED']) {
  const row = structuredClone(claim); edit(row); assert.throws(() => parseDomainClaims({ claims: [row], hasMore: false }))
}
assert.throws(() => parseDomainClaims({ claims: [claim, claim], hasMore: false }))
assert.throws(() => parseDomainClaims({ claims: Array(51).fill(claim), hasMore: true }))
assert.throws(() => parseDomainClaims({ claims: [], hasMore: 'false' }))
for (const roles of [['BRAND_MANAGER'], ['COMMERCIAL_ADMIN'], []]) assert.equal(canManagePartnerDomains({ id, name: 'Partner', roles }), false)
assert.equal(canManagePartnerDomains({ id, name: 'Partner', roles: ['OWNER'] }), true)
for (const host of ['127.0.0.1', 'localhost', 'portal.example.com', 'portal.partner.in:443', '*.partner.in', 'portal.partner.in/path']) assert.equal(domainHostname(host), false)
const proof = 'a'.repeat(64)
assert.deepEqual(parseDomainChallenge({ id, status: 'PENDING', challenge: proof, replayed: false }), { id, challenge: proof })
assert.equal(parseDomainChallenge({ id, status: 'PENDING', challenge: null, replayed: true }).challenge, null)
assert.throws(() => parseDomainChallenge({ id, status: 'PENDING', challenge: proof, replayed: false }, '22222222-2222-4222-8222-222222222222'))
assert.throws(() => parseDomainChallenge({ id, status: 'PENDING', challenge: 'bad', replayed: false }))
assert.throws(() => parseDomainChallenge({ id, status: 'PENDING', challenge: proof, replayed: true }))
assert.equal(domainProofLabel({ ...claim, status: 'VERIFIED', verifiedUntil: '2026-10-14T01:00:00Z' }, Date.parse('2026-10-14T02:00:00Z')), 'DNS proof expired')
console.log('V5.4.19 owner-only domain response, proof, expiry and hostname contracts: PASS')
