import { NextRequest, NextResponse } from 'next/server'
import { hostCookieName, hostResponseHeaders, resolveWebHost } from '../../../lib/partner-host-policy'
import { hostCookieOptions, openHostCookie, requireHostCookieKey, sealHostCookie, type HostCredentials } from '../../../lib/partner-host-cookie'
import { hostApi, validatedHostContext } from '../../../lib/partner-host-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  try {
    const host = resolveWebHost(request.headers, request.method, process.env)
    if (host.kind !== 'PARTNER') throw new Error('Unavailable')
    requireHostCookieKey(process.env.AARAGATE_HOST_WEB_COOKIE_KEY)
    // Bound input, including chunked bodies; reject before parsing or upstream I/O.
    const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body')
    const chunks: Uint8Array[] = []; let size = 0
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length
      if (size > 2048) { await reader.cancel(); throw new Error('Body too large') }; chunks.push(part.value) }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid input')
    const existing = openHostCookie(request.cookies.get(hostCookieName)?.value, host.hostname, process.env.AARAGATE_HOST_WEB_COOKIE_KEY)
    let credentials: HostCredentials | undefined
    if (input.action === 'request') {
      if (typeof input.phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(input.phone)) throw new Error('Invalid phone')
      const reply = await hostApi(host.hostname, '/auth/otp/request', { method: 'POST', body: { phone: input.phone } }) as { challengeId?: string }
      if (!reply.challengeId || !/^[0-9a-f-]{36}$/i.test(reply.challengeId)) throw new Error('Invalid challenge')
      return NextResponse.json({ challengeId: reply.challengeId }, { headers: hostResponseHeaders })
    } else if (input.action === 'verify') {
      if (typeof input.challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.challengeId) || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new Error('Invalid verification')
      const reply = await hostApi(host.hostname, '/auth/partner/host/otp/verify', { method: 'POST', body: { challengeId: input.challengeId, code: input.code } }) as { verified?: boolean; contextType?: string; hostContext?: { hostname?: string; partnerId?: string }; session?: Omit<HostCredentials, 'hostname' | 'partnerId'> }
      if (reply.verified !== true || reply.contextType !== 'PARTNER' || reply.hostContext?.hostname !== host.hostname || !reply.hostContext.partnerId || !reply.session) throw new Error('Invalid host session')
      credentials = { ...reply.session, hostname: host.hostname, partnerId: reply.hostContext.partnerId }
    } else if (input.action === 'refresh') {
      if (!existing) throw new Error('Missing session')
      const session = await hostApi(host.hostname, '/auth/refresh', { method: 'POST', body: { sessionId: existing.sessionId, refreshToken: existing.refreshToken } }) as Partial<HostCredentials>
      credentials = { ...existing, ...session, hostname: existing.hostname, partnerId: existing.partnerId, sessionId: existing.sessionId }
    } else if (input.action === 'logout') {
      if (existing) await hostApi(host.hostname, '/auth/logout', { method: 'POST', body: { sessionId: existing.sessionId, refreshToken: existing.refreshToken } })
      const response = NextResponse.json({ success: true }, { headers: hostResponseHeaders })
      response.cookies.set(hostCookieName, '', { ...hostCookieOptions(new Date(0).toISOString()), maxAge: 0 })
      return response
    } else throw new Error('Unknown action')
    await validatedHostContext(credentials)
    const response = NextResponse.json({ success: true }, { headers: hostResponseHeaders })
    response.cookies.set(hostCookieName, sealHostCookie(credentials, process.env.AARAGATE_HOST_WEB_COOKIE_KEY), hostCookieOptions(credentials.refreshExpiresAt))
    return response
  } catch { return NextResponse.json({ error: 'Partner access unavailable. Sign in again or contact your administrator.' }, { status: 401, headers: hostResponseHeaders }) }
}
