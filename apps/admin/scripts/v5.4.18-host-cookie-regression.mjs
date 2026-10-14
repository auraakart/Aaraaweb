import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { hostCookieOptions, openHostCookie, sealHostCookie } from '../lib/partner-host-cookie.ts'
import { hostWebEnabled, resolveWebHost } from '../lib/partner-host-policy.ts'

const now = Date.now(), secret = randomBytes(32).toString('hex'), host = 'portal.partner.in'
const env = { NODE_ENV: 'test', AARAGATE_ENABLE_TEST_HOST_WEB: 'true', AARAGATE_PLATFORM_HOSTNAMES: '["admin.aaraagate.in"]' }
const credentials = { hostname: host, partnerId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222',
  accessToken: randomBytes(32).toString('hex'), refreshToken: randomBytes(48).toString('hex'), expiresAt: new Date(now + 60000).toISOString(), refreshExpiresAt: new Date(now + 120000).toISOString() }
const cookie = sealHostCookie(credentials, secret, now)
assert.deepEqual(openHostCookie(cookie, host, secret, now), credentials)
assert.equal(cookie.includes(credentials.accessToken), false)
for (const [value, hostname, key, at] of [
  [cookie, 'other.partner.in', secret, now], [cookie, host, randomBytes(32).toString('hex'), now],
  [cookie.slice(0, 20) + '!' + cookie.slice(21), host, secret, now],
  [cookie, host, secret, now + 120000], [cookie, host, undefined, now], ['garbage', host, secret, now],
]) assert.equal(openHostCookie(value, hostname, key, at), null)
const bytes = Buffer.from(cookie, 'base64url'); bytes[bytes.length - 2] ^= 1
assert.equal(openHostCookie(bytes.toString('base64url'), host, secret, now), null)
assert.throws(() => sealHostCookie({ ...credentials, hostname: '', accessToken: 'bad' }, secret, now))
assert.throws(() => sealHostCookie(credentials, undefined, now))
assert.deepEqual(hostCookieOptions(credentials.refreshExpiresAt), { httpOnly: true, secure: true, sameSite: 'strict', path: '/', expires: new Date(credentials.refreshExpiresAt) })
assert.equal('domain' in hostCookieOptions(credentials.refreshExpiresAt), false)
assert.equal(hostWebEnabled({ ...env, NODE_ENV: 'production' }), false)
const request = (values = {}) => new Headers({ host, ...values })
assert.deepEqual(resolveWebHost(request(), 'GET', env), { kind: 'PARTNER', hostname: host })
assert.equal(resolveWebHost(request({ 'x-forwarded-host': host }), 'GET', env).hostname, host)
assert.equal(resolveWebHost(request({ host: 'admin.aaraagate.in' }), 'GET', env).kind, 'PLATFORM')
for (const values of [{ host: host + ':443' }, { host: 'PORTAL.partner.in' }, { host: '127.0.0.1' }, { host: 'evil.admin.aaraagate.in' },
  { host: 'portal.example.com' }, { host: 'portal.local' }, { forwarded: `host=${host}` }, { 'x-forwarded-host': 'other.partner.in' },
  { origin: 'https://other.partner.in' }, { 'sec-fetch-site': 'cross-site' }]) assert.throws(() => resolveWebHost(request(values), 'GET', env))
assert.throws(() => resolveWebHost(request(), 'POST', env))
assert.equal(resolveWebHost(request({ origin: `https://${host}` }), 'POST', env).hostname, host)
for (const reserved of ['[]', 'null', '["admin.aaraagate.in","admin.aaraagate.in"]', '[3]', 'invalid']) assert.throws(() => resolveWebHost(request(), 'GET', { ...env, AARAGATE_PLATFORM_HOSTNAMES: reserved }))
console.log('V5.4.18 encrypted host-only cookie and direct Host/Origin policy: PASS')
