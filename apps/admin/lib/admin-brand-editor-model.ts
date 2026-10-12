import {parseAdminSocietyBrand} from './admin-society-brand'

export type BrandRevision = Readonly<{
  id:string
  version:number
  config:{displayName?:string;colors?:{primary:string;primaryDeep:string}}
  publishedAt:string|null
  createdAt:string
}>

const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hexPattern=/^#[0-9a-f]{6}$/i
function object(value:unknown):Record<string,unknown>|null {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null
}

/** Treat history as untrusted transport data; never evaluate arbitrary config as CSS. */
export function parseBrandHistory(payload:unknown):BrandRevision[] {
  if(!Array.isArray(payload)||payload.length>100)throw new Error('Society branding history is invalid')
  const rows:BrandRevision[]=[]
  const versions=new Set<number>()
  for(const raw of payload){
    const row=object(raw),config=object(row?.config),colors=object(config?.colors)
    if(!row||typeof row.id!=='string'||!idPattern.test(row.id)||typeof row.version!=='number'||!Number.isSafeInteger(row.version)||row.version<1||
      versions.has(Number(row.version))||!config||typeof row.createdAt!=='string'||
      !(row.publishedAt===null||typeof row.publishedAt==='string'))throw new Error('Society branding history is invalid')
    if(config.displayName!==undefined&&(typeof config.displayName!=='string'||config.displayName.length>80))throw new Error('Society branding history is invalid')
    if(colors&&(!hexPattern.test(String(colors.primary))||!hexPattern.test(String(colors.primaryDeep))))throw new Error('Society branding history is invalid')
    if(config.colors!==undefined&&!colors)throw new Error('Society branding history is invalid')
    versions.add(Number(row.version))
    rows.push({
      id:row.id,version:Number(row.version),
      config:{
        ...(typeof config.displayName==='string'?{displayName:config.displayName}:{}),
        ...(colors?{colors:{primary:String(colors.primary).toUpperCase(),primaryDeep:String(colors.primaryDeep).toUpperCase()}}:{}),
      },
      publishedAt:row.publishedAt as string|null,createdAt:row.createdAt,
    })
  }
  return rows.sort((a,b)=>b.version-a.version)
}

export function brandHistoryVersions(rows:readonly BrandRevision[]){
  return {
    nextExpectedVersion:rows[0]?.version??0,
    expectedPublishedVersion:rows.find(row=>row.publishedAt!==null)?.version??0,
  }
}

/** Editor uses the same AA white-text safety gate as the authenticated Admin shell. */
export function prepareBrandDraft(input:{displayName:string;primary:string;primaryDeep:string;societyId:string}){
  const displayName=input.displayName.trim()
  if(!displayName||displayName.length>80||/[<>\x00-\x1f\x7f]/.test(displayName))
    throw new Error('Enter a safe display name of 1–80 characters')
  const safe=parseAdminSocietyBrand({
    society:{id:input.societyId},
    branding:{schemaVersion:1,revision:'editor-preview',brand:{
      id:'aaraagate',displayName,colors:{primary:input.primary,primaryDeep:input.primaryDeep},
    }},
  },input.societyId)
  if(!safe)throw new Error('Choose two six-digit hex colors with at least 4.5:1 white-text contrast')
  return {displayName:safe.displayName,colors:{primary:safe.primary,primaryDeep:safe.primaryDeep}}
}

export function isBrandConflict(error:unknown){
  return error instanceof Error&&/modified; reload revisions|Published society branding has changed|conflict/i.test(error.message)
}
