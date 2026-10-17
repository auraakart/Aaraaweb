const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type MemberRole='OWNER'|'BRAND_MANAGER'|'COMMERCIAL_ADMIN'|'SUPPORT'
export type PendingInvitation={id:string;partnerId:string;partnerName:string;role:MemberRole;expiresAt:string}
export const validPartnerUuid=(value:string)=>uuid.test(value)
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid partner invitation');return value as Record<string,unknown>}
const identity=(value:unknown)=>{if(typeof value!=='string'||!validPartnerUuid(value))throw new Error('Invalid invitation identity');return value}
const display=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.length>200||/[\x00-\x1f\x7f<>]/.test(value))throw new Error('Invalid invitation display name');return value}
const role=(value:unknown):MemberRole=>{if(value!=='OWNER'&&value!=='BRAND_MANAGER'&&value!=='COMMERCIAL_ADMIN'&&value!=='SUPPORT')throw new Error('Invalid invitation role');return value}
export function parsePendingInvitations(input:unknown):PendingInvitation[]{
 if(!Array.isArray(input)||input.length>50)throw new Error('Invalid invitation list')
 const seen=new Set<string>()
 return input.map(raw=>{const item=record(raw),partner=record(item.partner),id=identity(item.id),partnerId=identity(item.partnerId)
  if(seen.has(id))throw new Error('Duplicate partner invitation');seen.add(id)
  const expiresAt=item.expiresAt
  if(typeof expiresAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(expiresAt)||!Number.isFinite(Date.parse(expiresAt)))throw new Error('Invalid invitation expiry')
  return {id,partnerId,partnerName:display(partner.displayName),role:role(item.role),expiresAt}
 })
}
export function isCurrentMemberOperator(roles:readonly string[]){return roles.includes('OWNER')}
