import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type HostCredentials = {
  hostname: string; partnerId: string; sessionId: string; accessToken: string; refreshToken: string
  expiresAt: string; refreshExpiresAt: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function key(secret: string | undefined) {
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('Cookie key unavailable')
  return Buffer.from(secret, 'hex')
}
export function requireHostCookieKey(secret: string | undefined): void { key(secret) }
function validate(value: unknown, host: string, now: number): HostCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credentials')
  const item = value as HostCredentials
  if (item.hostname !== host || !uuid.test(item.partnerId ?? '') || !uuid.test(item.sessionId ?? '') ||
      !/^[a-f0-9]{64}$/.test(item.accessToken ?? '') || !/^[a-f0-9]{96}$/.test(item.refreshToken ?? '') ||
      typeof item.expiresAt !== 'string' || typeof item.refreshExpiresAt !== 'string' ||
      !Number.isFinite(Date.parse(item.expiresAt)) || !Number.isFinite(Date.parse(item.refreshExpiresAt)) ||
      Date.parse(item.refreshExpiresAt) <= now || Date.parse(item.expiresAt) > Date.parse(item.refreshExpiresAt)) throw new Error('Invalid credentials')
  return item
}
/** Authenticated encryption binds even a manually copied cookie to its hostname. */
export function sealHostCookie(credentials: HostCredentials, secret: string | undefined, now = Date.now()): string {
  validate(credentials, credentials.hostname, now)
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  cipher.setAAD(Buffer.from(`aaraagate:partner-host:v1:${credentials.hostname}`))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}
export function openHostCookie(value: string | undefined, host: string, secret: string | undefined, now = Date.now()): HostCredentials | null {
  try {
    if (!value || value.length > 3000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
    const bytes = Buffer.from(value, 'base64url')
    if (bytes.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12))
    decipher.setAAD(Buffer.from(`aaraagate:partner-host:v1:${host}`)); decipher.setAuthTag(bytes.subarray(12, 28))
    const clear = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    return validate(JSON.parse(clear), host, now)
  } catch { return null }
}
export const hostCookieOptions = (expires: string) => ({ httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/', expires: new Date(expires) })
