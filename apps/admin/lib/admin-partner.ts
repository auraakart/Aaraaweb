import type { Session } from './admin-client'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type PartnerRole='OWNER'|'BRAND_MANAGER'|'COMMERCIAL_ADMIN'
export type Workspace={id:string;name:string;roles:PartnerRole[]}
export type Portfolio={partner:{id:string;name:string};societies:{id:string;name:string;status:string}[];hasMore:boolean}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid partner response');return v as Record<string,unknown>}
const id=(v:unknown)=>{if(typeof v!=='string'||!uuid.test(v))throw new Error('Invalid partner identity');return v}
const text=(v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.length>200||/[\x00-\x1f\x7f<>]/.test(v))throw new Error('Invalid partner display text');return v}
const flag=(v:unknown)=>{if(typeof v!=='boolean')throw new Error('Invalid partner pagination');return v}
const list=(v:unknown)=>{if(!Array.isArray(v)||v.length>50)throw new Error('Invalid partner list');return v}
const role=(v:unknown):PartnerRole=>{if(v!=='OWNER'&&v!=='BRAND_MANAGER'&&v!=='COMMERCIAL_ADMIN')throw new Error('Invalid workspace role');return v}
export function partnerSessionKey(s:Session|null){return s?`${s.sessionId}:${s.societyId}:${s.role}`:''}
export function readPartnerSession():Session|null{
 try{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw)return null;const s=object(JSON.parse(raw));id(s.sessionId);id(s.societyId)
 if(typeof s.accessToken!=='string'||!s.accessToken||typeof s.refreshToken!=='string'||!s.refreshToken||typeof s.role!=='string'||!s.role)return null
 return s as unknown as Session}catch{return null}
}
export function parseWorkspaces(value:unknown){
 const root=object(value),result=new Map<string,Workspace>(),seen=new Set<string>()
 for(const raw of list(root.memberships)){const m=object(raw),p=object(m.partner),membershipId=id(m.id),partnerId=id(p.id),name=text(p.displayName),r=role(m.role)
 if(seen.has(membershipId))throw new Error('Duplicate partner membership');seen.add(membershipId)
 const old=result.get(partnerId);if(old){if(old.name!==name||old.roles.includes(r))throw new Error('Inconsistent partner workspace');old.roles.push(r)}else result.set(partnerId,{id:partnerId,name,roles:[r]})}
 return {workspaces:[...result.values()],hasMore:flag(root.hasMore)}
}
export function canReadMembers(w:Workspace){return w.roles.includes('OWNER')||w.roles.includes('COMMERCIAL_ADMIN')}
export function parsePortfolio(value:unknown,partnerId:string):Portfolio{
 const root=object(value),p=object(root.partner);if(id(p.id)!==partnerId)throw new Error('Partner scope changed')
 const seen=new Set<string>(),societies=list(root.societies).map(raw=>{const s=object(raw),societyId=id(s.id);if(seen.has(societyId))throw new Error('Duplicate society');seen.add(societyId)
 if(s.status!=='ACTIVE'&&s.status!=='SUSPENDED')throw new Error('Unknown society status')
 return {id:societyId,name:text(s.name),status:s.status}})
 return {partner:{id:partnerId,name:text(p.displayName)},societies,hasMore:flag(root.hasMore)}
}
export function parsePartnerMembers(value:unknown){
 const seen=new Set<string>();return list(value).map(raw=>{const m=object(raw),membershipId=id(m.id);if(seen.has(membershipId))throw new Error('Duplicate member');seen.add(membershipId)
 if(m.role!=='OWNER'&&m.role!=='BRAND_MANAGER'&&m.role!=='COMMERCIAL_ADMIN'&&m.role!=='SUPPORT')throw new Error('Unknown member role')
 if(typeof m.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(m.createdAt)||!Number.isFinite(Date.parse(m.createdAt)))throw new Error('Invalid membership date')
 return {id:membershipId,role:m.role,createdAt:m.createdAt}})
}
