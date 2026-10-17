import { cookies, headers } from 'next/headers'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { hostCookieName, resolveWebHost } from './partner-host-policy'
import { openHostCookie, type HostCredentials } from './partner-host-cookie'

export function partnerApiBase() {
  const url = new URL(process.env.AARAGATE_HOST_WEB_API_BASE_URL ?? '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid API origin')
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('HTTP upstream must be loopback')
  return url.origin
}
/** Fixed server-configured upstream, never the incoming Host or a browser URL. */
export async function hostApi(host: string, path: string, options: { method?: string; body?: unknown; accessToken?: string } = {}) {
  const method = options.method ?? 'GET'
  const url = new URL(`/api/v1${path}`, partnerApiBase())
  // Node transport preserves raw Host; browser fetch/proxy normalization must
  // not replace the hostname that the API revalidates. Never forward cookies.
  return await new Promise<unknown>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method, signal: AbortSignal.timeout(10000),
      headers: { Host: host, Origin: `https://${host}`, Accept: 'application/json', 'Content-Type': 'application/json',
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}) },
    }, response => {
      const chunks: Buffer[] = []; let size = 0
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 1024 * 1024) response.destroy(new Error('API response too large')); else chunks.push(chunk) })
      response.on('error', reject)
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) { reject(new Error('Partner access unavailable')); return }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('Invalid API response')) }
      })
    })
    request.on('error', reject)
    request.end(options.body !== undefined ? JSON.stringify(options.body) : undefined)
  })
}
export async function currentHostCredentials(): Promise<HostCredentials | null> {
  const requestHeaders = await headers()
  const host = resolveWebHost(new Headers(requestHeaders), 'GET', process.env)
  if (host.kind !== 'PARTNER') return null
  return openHostCookie((await cookies()).get(hostCookieName)?.value, host.hostname, process.env.AARAGATE_HOST_WEB_COOKIE_KEY)
}
export async function validatedHostContext(credentials: HostCredentials) {
  const context = await hostApi(credentials.hostname, '/auth/partner/host/session', { accessToken: credentials.accessToken }) as { partnerId?: string; hostname?: string; contextType?: string }
  if (context.contextType !== 'PARTNER_HOST' || context.partnerId !== credentials.partnerId || context.hostname !== credentials.hostname) throw new Error('Host scope changed')
  return context
}
