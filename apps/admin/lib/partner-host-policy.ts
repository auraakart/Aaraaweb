/** Direct-host development boundary. Forwarded headers never establish trust. */
export type HostEnvironment = Record<string, string | undefined>
export const hostCookieName = '__Host-aaraagate-partner'
export const hostResponseHeaders = {
  'Cache-Control': 'no-store, private',
  'Vary': 'Host, Origin, Cookie',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}
function hostname(value: string | null): string {
  // Accept only canonical ASCII DNS names; the registry supports broader IDNA.
  if (!value || value.length > 253 || value !== value.toLowerCase() ||
      !value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      value.split('.').length < 2 || /^\d+$/.test(value.split('.').at(-1)!)) throw new Error('Invalid host')
  return value
}
export function hostWebEnabled(env: HostEnvironment): boolean {
  return ['development', 'test'].includes(env.NODE_ENV ?? '') && env.AARAGATE_ENABLE_TEST_HOST_WEB === 'true'
}
export function resolveWebHost(headers: Headers, method: string, env: HostEnvironment): { kind: 'PLATFORM' | 'PARTNER'; hostname: string } {
  if (!hostWebEnabled(env)) throw new Error('Host web unavailable')
  const reserved: unknown = JSON.parse(env.AARAGATE_PLATFORM_HOSTNAMES ?? '[]')
  if (!Array.isArray(reserved) || reserved.length < 1 || reserved.length > 50 ||
      reserved.some(value => typeof value !== 'string' || hostname(value) !== value) ||
      new Set(reserved).size !== reserved.length) throw new Error('Invalid platform hosts')
  const host = hostname(headers.get('host'))
  // Next synthesizes X-Forwarded-Host on direct requests. It may only repeat
  // raw Host exactly; it is never a source of routing or authentication identity.
  const forwardedHost = headers.get('x-forwarded-host')
  if (headers.has('forwarded') || forwardedHost !== null && forwardedHost !== host) throw new Error('Untrusted proxy')
  if (reserved.includes(host)) return { kind: 'PLATFORM', hostname: host }
  if (reserved.some(value => host.endsWith('.' + value)) ||
      /\.(localhost|local|internal|test|invalid|example)$/.test(host) ||
      /(^|\.)example\.(com|net|org)$/.test(host)) throw new Error('Reserved host')
  const origin = headers.get('origin')
  if ((method !== 'GET' && method !== 'HEAD' || origin !== null) && origin !== `https://${host}`) throw new Error('Origin mismatch')
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') throw new Error('Cross-site request')
  return { kind: 'PARTNER', hostname: host }
}
