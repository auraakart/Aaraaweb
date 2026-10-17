// Real Next middleware, route handler and SSR acceptance against a fixed local API double.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sealHostCookie } from '../lib/partner-host-cookie.ts'

const host = 'portal.partner.in', key = randomBytes(32).toString('hex'), id = '11111111-1111-4111-8111-111111111111'
const session = { sessionId: '22222222-2222-4222-8222-222222222222', accessToken: randomBytes(32).toString('hex'), refreshToken: randomBytes(48).toString('hex'),
  expiresAt: new Date(Date.now() + 600000).toISOString(), refreshExpiresAt: new Date(Date.now() + 1200000).toISOString() }
let revoked = false, calls = 0
const api = createServer(async (request, response) => {
  calls++
  assert.equal(request.headers.host, host)
  assert.equal(request.headers.origin, `https://${host}`)
  assert.equal(request.headers['x-forwarded-host'], undefined)
  response.setHeader('Content-Type', 'application/json')
  if (revoked) { response.statusCode = 401; response.end('{}'); return }
  if (request.url === '/api/v1/auth/partner/host/session') {
    assert.equal(request.headers.authorization, `Bearer ${session.accessToken}`)
    response.end(JSON.stringify({ contextType: 'PARTNER_HOST', hostname: host, partnerId: id }))
  } else if (request.url === `/api/v1/partners/${id}/portfolio`) {
    response.end(JSON.stringify({ partner: { id, displayName: 'Partner One' }, societies: [{ id, name: 'Society One', status: 'ACTIVE' }], hasMore: false }))
  } else if (request.url === '/api/v1/auth/partner/host/otp/verify') {
    response.end(JSON.stringify({ verified: true, contextType: 'PARTNER', hostContext: { hostname: host, partnerId: id }, session }))
  } else if (request.url === '/api/v1/auth/refresh') {
    response.end(JSON.stringify(session))
  } else if (request.url === '/api/v1/auth/logout') {
    response.end('{"success":true}')
  } else { response.statusCode = 404; response.end('{}') }
})
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
const portProbe = createServer()
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
const port = portProbe.address().port
await new Promise(resolve => portProbe.close(resolve))
const admin = fileURLToPath(new URL('../', import.meta.url))
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: admin, env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    AARAGATE_ENABLE_TEST_HOST_WEB: 'true', AARAGATE_PLATFORM_HOSTNAMES: '["admin.aaraagate.in"]', AARAGATE_HOST_WEB_COOKIE_KEY: key,
    AARAGATE_HOST_WEB_API_BASE_URL: `http://127.0.0.1:${api.address().port}` }, stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
const request = (path, headers = {}, body) => new Promise((resolve, reject) => {
  const req = httpRequest(`http://127.0.0.1:${port}${path}`, { method: body ? 'POST' : 'GET', headers: { host, ...headers }, signal: AbortSignal.timeout(60000) }, res => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject)
    res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })))
  }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined)
})
try {
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Next startup timeout')), 30000)
    child.once('exit', code => { clearTimeout(deadline); reject(new Error(`Next exited ${code}`)) })
    child.stdout.on('data', chunk => { if (String(chunk).includes('Ready in')) { clearTimeout(deadline); resolve() } })
  })
  const cookie = sealHostCookie({ ...session, hostname: host, partnerId: id }, key)
  const landing = await request('/')
  assert.equal(landing.status, 307); assert.equal(landing.headers.get('location'), `https://${host}/partner-host`)
  const authenticated = await request('/partner-host', { cookie: `__Host-aaraagate-partner=${cookie}` })
  assert.equal(authenticated.status, 200, 'Authenticated raw Host SSR must succeed')
  const html = await authenticated.text()
  assert.match(html, /Society One/); assert.match(html, /Partner One/)
  assert.equal(html.includes(session.accessToken), false); assert.equal(html.includes(session.refreshToken), false)
  assert.match(authenticated.headers.get('cache-control'), /no-store/)
  for (const path of ['/partners', '/finance', '/_next/data/fake/finance.json']) assert.equal((await request(path)).status, 404)
  const before = calls
  for (const headers of [{ 'x-forwarded-host': 'other.partner.in' }, { forwarded: `host=${host}` }, { origin: 'https://other.partner.in' }]) assert.equal((await request('/', headers)).status, 404)
  assert.equal(calls, before, 'Spoofed headers must fail before upstream I/O')
  const foreign = await request('/partner-host', { host: 'other.partner.in', cookie: `__Host-aaraagate-partner=${cookie}` })
  assert.equal((await foreign.text()).includes('Society One'), false); assert.equal(calls, before)
  const platform = await request('/partner-host', { host: 'admin.aaraagate.in' }); assert.equal(platform.status, 404)
  const denied = await request('/partner-host/session', {}, { action: 'refresh' }); assert.equal(denied.status, 404)
  const verified = await request('/partner-host/session', { origin: `https://${host}`, 'content-type': 'application/json' }, { action: 'verify', challengeId: id, code: '123456' })
  assert.equal(verified.status, 200)
  const issued = verified.headers.get('set-cookie')
  for (const pattern of [/__Host-aaraagate-partner=/, /HttpOnly/i, /Secure/i, /SameSite=strict/i, /Path=\//]) assert.match(issued, pattern)
  assert.equal(/Domain=/i.test(issued), false); assert.deepEqual(await verified.json(), { success: true })
  const browserHeaders = { origin: `https://${host}`, 'content-type': 'application/json', cookie: `__Host-aaraagate-partner=${cookie}` }
  assert.equal((await request('/partner-host/session', browserHeaders, { action: 'refresh' })).status, 200)
  const logout = await request('/partner-host/session', browserHeaders, { action: 'logout' }); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i)
  revoked = true
  const rejected = await request('/partner-host', { cookie: `__Host-aaraagate-partner=${cookie}` }); assert.equal((await rejected.text()).includes('Society One'), false)
  console.log('V5.4.18 actual Next SSR, cookie issuance/refresh/logout, proxy/origin rejection, cross-host and revoked access: PASS')
} catch (error) { console.error(logs.slice(-5000)); throw error }
finally { child.kill('SIGTERM'); api.closeAllConnections(); await new Promise(resolve => api.close(resolve)) }
