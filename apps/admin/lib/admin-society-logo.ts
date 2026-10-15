/** Society logo upload is a quarantined admin-only workflow, never a public brand URL. */
export type SocietyLogoAsset = Readonly<{
  id: string
  status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  contentType: 'image/png'
  contentLengthBytes: number
  sha256: string | null
  createdAt: string
  verifiedAt: string | null
}>

export type SocietyLogoUploadIntent = Readonly<{
  asset: SocietyLogoAsset
  upload: Readonly<{method: 'PUT'; url: string; headers: Readonly<Record<string, string>>; expiresAt: string}>
}>

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const digest = /^[a-f0-9]{64}$/
const sizeLimit = 512 * 1024

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function iso(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
}
function only(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every(k => keys.includes(k))
}

export function validateSocietyLogoFile(file: {type: string; size: number}) {
  if (file.type !== 'image/png' || !Number.isSafeInteger(file.size) ||
    file.size < 57 || file.size > sizeLimit) {
    throw new Error('Select a PNG logo no larger than 512 KiB (64–1024 pixels).')
  }
  return {contentType: 'image/png', contentLengthBytes: file.size}
}

function parseAsset(value: unknown): SocietyLogoAsset {
  const row = object(value)
  if (!row || !only(row,['id','status','contentType','contentLengthBytes','sha256','createdAt','verifiedAt']) ||
    typeof row.id !== 'string' || !uuid.test(row.id) ||
    !['PENDING','VERIFIED','REJECTED'].includes(String(row.status)) ||
    row.contentType !== 'image/png' ||
    !Number.isSafeInteger(row.contentLengthBytes) || (row.contentLengthBytes as number) < 57 ||
    (row.contentLengthBytes as number) > sizeLimit ||
    !iso(row.createdAt) ||
    (row.verifiedAt !== null && !iso(row.verifiedAt)) ||
    (row.status === 'VERIFIED'
      ? typeof row.sha256 !== 'string' || !digest.test(row.sha256) || !iso(row.verifiedAt)
      : row.sha256 !== null || row.verifiedAt !== null)) {
    throw new Error('Invalid private society logo metadata')
  }
  return {
    id: row.id, status: row.status as SocietyLogoAsset['status'],
    contentType: 'image/png', contentLengthBytes: row.contentLengthBytes as number,
    sha256: row.sha256 as string | null, createdAt: row.createdAt as string,
    verifiedAt: row.verifiedAt as string | null,
  }
}

export function parseSocietyLogoAssets(value: unknown): SocietyLogoAsset[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error('Invalid society logo list')
  return value.map(parseAsset)
}

export function parseSocietyLogoUploadIntent(value: unknown): SocietyLogoUploadIntent {
  const root = object(value), intent = object(root?.upload)
  const headers = object(intent?.headers)
  if (!root || !only(root,['asset','upload']) || !intent ||
    !only(intent,['method','url','headers','expiresAt']) ||
    intent.method !== 'PUT' || typeof intent.url !== 'string' || !iso(intent.expiresAt) ||
    !headers || !only(headers,['Content-Type']) || headers['Content-Type'] !== 'image/png') {
    throw new Error('Invalid society logo upload authorization')
  }
  let url: URL
  try { url = new URL(intent.url) }
  catch { throw new Error('Invalid society logo upload destination') }
  // Browser sends only the PNG bytes, never a society token, and rejects redirects.
  if (url.protocol !== 'https:' || url.username || url.password ||
    url.hash || Date.parse(intent.expiresAt as string) <= Date.now()) {
    throw new Error('Society logo upload destination is not secure')
  }
  return {
    asset: parseAsset(root.asset),
    upload: {
      method: 'PUT', url: intent.url, headers: {'Content-Type':'image/png'},
      expiresAt: intent.expiresAt as string,
    },
  }
}
