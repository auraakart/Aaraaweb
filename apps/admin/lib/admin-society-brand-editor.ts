/** Untrusted management response is presentation-only and cannot grant any permissions. */
export type SocietyBrandRevision = Readonly<{
  id: string
  version: number
  config: { displayName?: string; colors?: { primary: string; primaryDeep: string }; support?: {email?:string;phone?:string}; logoAssetId?: string }
  publishedAt: string | null
}>

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hex = /^#[a-fA-F0-9]{6}$/
const supportEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const supportPhone = /^\+[1-9][0-9]{7,14}$/

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

export function parseSocietyBrandRevisions(payload: unknown): SocietyBrandRevision[] {
  if (!Array.isArray(payload)) throw new Error('Invalid society branding revision response')
  return payload.map(item => {
    const row = object(item), rawConfig = object(row?.config), colors = object(rawConfig?.colors), support = object(rawConfig?.support)
    if (!row || typeof row.id !== 'string' || !uuid.test(row.id) ||
        !Number.isSafeInteger(row.version) || (row.version as number) < 1 ||
        !rawConfig || !Object.keys(rawConfig).length ||
        Object.keys(rawConfig).some(k => k !== 'displayName' && k !== 'colors' && k !== 'support' && k !== 'logoAssetId') ||
        (rawConfig.displayName !== undefined && (typeof rawConfig.displayName !== 'string' ||
          !rawConfig.displayName.trim() || rawConfig.displayName.length > 80)) ||
        (colors !== null && (!hex.test(String(colors.primary)) || !hex.test(String(colors.primaryDeep)))) ||
        (rawConfig.colors !== undefined && colors === null) ||
        (rawConfig.logoAssetId !== undefined && (typeof rawConfig.logoAssetId !== 'string' || !uuid.test(rawConfig.logoAssetId))) ||
        (rawConfig.support !== undefined &&
          (!support || !Object.keys(support).length ||
            Object.keys(support).some(k=>k!=='email'&&k!=='phone') ||
            (support.email!==undefined && (typeof support.email!=='string' ||
              support.email.length>254 || !supportEmail.test(support.email) || support.email.includes('..') || support.email!==support.email.toLowerCase())) ||
            (support.phone!==undefined && (typeof support.phone!=='string' || !supportPhone.test(support.phone))))) ||
        (row.publishedAt !== null && (typeof row.publishedAt !== 'string' ||
          !Number.isFinite(Date.parse(row.publishedAt))))) {
      throw new Error('Invalid society branding revision response')
    }
    const config: SocietyBrandRevision['config'] = {}
    if (typeof rawConfig.displayName === 'string') config.displayName = rawConfig.displayName
    if (colors) config.colors = {primary:String(colors.primary),primaryDeep:String(colors.primaryDeep)}
    if (typeof rawConfig.logoAssetId === 'string') config.logoAssetId=rawConfig.logoAssetId.toLowerCase()
    if (support) config.support = { ...(typeof support.email==='string'?{email:support.email}:{}), ...(typeof support.phone==='string'?{phone:support.phone}:{}) }
    return {id:row.id,version:row.version as number,config,publishedAt:row.publishedAt as string|null}
  }).sort((a,b)=>b.version-a.version)
}

/** The current published revision is the latest publication, not the last draft version. */
export function currentPublishedBrand(revisions: readonly SocietyBrandRevision[]): SocietyBrandRevision | null {
  return [...revisions].filter(r=>r.publishedAt!==null)
    .sort((a,b)=>Date.parse(b.publishedAt!)-Date.parse(a.publishedAt!) || b.version-a.version)[0]??null
}

export function draftBrandConfig(displayName: string, primary: string, primaryDeep: string, emailInput='', phoneInput='') {
  const name = displayName.trim(), a=primary.trim().toUpperCase(), b=primaryDeep.trim().toUpperCase()
  if (!name || name.length>80 || /[<>\x00-\x1f\x7f]/.test(name)) {
    throw new Error('Display name must contain 1–80 safe characters')
  }
  if (!hex.test(a) || !hex.test(b)) throw new Error('Brand colors must be six-digit hex values')
  const email=emailInput.trim().toLowerCase(),phone=phoneInput.trim()
  if (email && (email.length>254 || !supportEmail.test(email) || email.includes('..')))
    throw new Error('Support email must be a valid address')
  if (phone && !supportPhone.test(phone))
    throw new Error('Support phone must use international +countrycode format')
  return {displayName:name,colors:{primary:a,primaryDeep:b},
    ...((email||phone)?{support:{...(email?{email}:{}),...(phone?{phone}:{})}}:{})}

}

/** Restore publishes a new immutable version. Never update a historical revision. */
export function planBrandRestore(revisions: readonly SocietyBrandRevision[], revisionId: string) {
  const current=currentPublishedBrand(revisions)
  const previous=revisions.find(item=>item.id===revisionId)
  if (!current || !previous || !previous.publishedAt ||
      previous.id===current.id || previous.version>=current.version) {
    throw new Error('Only an earlier published revision can be restored')
  }
  return {
    expectedVersion:Math.max(...revisions.map(item=>item.version)),
    expectedPublishedVersion:current.version,
    config:{
      ...(previous.config.displayName!==undefined?{displayName:previous.config.displayName}:{}),
      ...(previous.config.colors?{colors:{...previous.config.colors}}:{}),
      ...(previous.config.support?{support:{...previous.config.support}}:{}),
      ...(previous.config.logoAssetId?{logoAssetId:previous.config.logoAssetId}:{}),
    },
  }
}
