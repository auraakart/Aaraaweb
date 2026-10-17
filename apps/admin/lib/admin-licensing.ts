import type { Session } from './admin-client'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const knownFeatures=new Set(['VISITOR_MANAGEMENT','DELIVERY_MANAGEMENT','DOMESTIC_HELP','NOTICES','HELPDESK','SOS','HOUSEHOLD_SERVICES','MAINTENANCE_BILLING','PAYMENTS','SOCIETY_ACCOUNTING','AMENITIES','GOVERNANCE_POLLS','ADVANCED_REPORTS','WHATSAPP_AUTOMATION','AI_ASSISTANT','CUSTOM_INTEGRATIONS'])
export type LicenseView={grantId:string;grantVersion:number;planCode:string;planVersion:number;startsAt:string;endsAt:string;graceUntil:string|null;phase:'ACTIVE'|'NOT_STARTED'|'GRACE'|'EXPIRED';approvalState:'PENDING'|'APPROVED'|'REVOKED';maximumSocieties:number;maximumDomains:number;used:number|null;consent:{id:string;decision:'OPT_IN'|'WITHDRAW'}|null;allocation:{id:string;active:boolean}|null;snapshotMatches:boolean;capabilities:{canApprove:boolean;canOptIn:boolean;canWithdraw:boolean;canActivate:boolean;canRevoke:boolean}}
export type LicensingOverview={society:{id:string;name:string;ownershipVersion:number;productTier:string;enabledFeatures:string[]};partner:{id:string;name:string;status:string};licenses:LicenseView[];hasMore:boolean;domainPreviewEnabled:boolean}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid licensing response');return v as Record<string,unknown>}
const text=(v:unknown,max=160)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f<>]/.test(v))throw new Error('Invalid licensing text');return v}
const id=(v:unknown)=>{const s=text(v,36);if(!uuid.test(s))throw new Error('Invalid licensing identity');return s}
const integer=(v:unknown,min=0)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>2147483647)throw new Error('Invalid licensing version or capacity');return v}
const bool=(v:unknown)=>{if(typeof v!=='boolean')throw new Error('Invalid licensing capability');return v}
const choice=<T extends string>(v:unknown,values:readonly T[]):T=>{if(typeof v!=='string'||!values.includes(v as T))throw new Error('Unknown licensing state');return v as T}
const timestamp=(v:unknown)=>{const s=text(v,30);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,19)!==s.slice(0,19))throw new Error('Invalid licensing date');return s}
export function licensingSessionKey(session:Session|null){return session?`${session.sessionId}:${session.societyId}:${session.role}`:''}
export function readLicensingSession():Session|null{
 try{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw)return null;const s=object(JSON.parse(raw));
  if(!['SUPER_ADMIN','SOCIETY_ADMIN'].includes(String(s.role))||!uuid.test(String(s.sessionId))||!uuid.test(String(s.societyId))||typeof s.accessToken!=='string'||!s.accessToken||typeof s.refreshToken!=='string'||!s.refreshToken)return null;
  return s as unknown as Session
 }catch{return null}
}
export function parseLicensingOverview(value:unknown,societyId:string):LicensingOverview{
 const root=object(value),s=object(root.society),p=object(root.partner)
 if(id(s.id)!==societyId)throw new Error('Licensing response belongs to another society')
 if(!Array.isArray(s.enabledFeatures)||new Set(s.enabledFeatures).size!==s.enabledFeatures.length||s.enabledFeatures.some(f=>typeof f!=='string'||!knownFeatures.has(f)))throw new Error('Invalid legacy feature snapshot')
 if(!Array.isArray(root.licenses)||root.licenses.length>20)throw new Error('Invalid license list')
 const ids=new Set<string>()
 const licenses=root.licenses.map(raw=>{const l=object(raw),cap=object(l.capabilities),grantId=id(l.grantId)
  if(ids.has(grantId))throw new Error('Duplicate license identity');ids.add(grantId)
  const startsAt=timestamp(l.startsAt),endsAt=timestamp(l.endsAt),graceUntil=l.graceUntil===null?null:timestamp(l.graceUntil)
  if(Date.parse(endsAt)<=Date.parse(startsAt)||(graceUntil&&Date.parse(graceUntil)<Date.parse(endsAt)))throw new Error('Invalid license period')
  const code=text(l.planCode,40);if(!/^[A-Z][A-Z0-9_]{2,39}$/.test(code))throw new Error('Invalid license plan')
  const consent=l.consent===null?null:object(l.consent),allocation=l.allocation===null?null:object(l.allocation)
  return {grantId,grantVersion:integer(l.grantVersion,1),planCode:code,planVersion:integer(l.planVersion,1),startsAt,endsAt,graceUntil,
   phase:choice(l.phase,['ACTIVE','NOT_STARTED','GRACE','EXPIRED'] as const),approvalState:choice(l.approvalState,['PENDING','APPROVED','REVOKED'] as const),
   maximumSocieties:integer(l.maximumSocieties),maximumDomains:integer(l.maximumDomains),used:l.used===null?null:integer(l.used),
   consent:consent?{id:id(consent.id),decision:choice(consent.decision,['OPT_IN','WITHDRAW'] as const)}:null,allocation:allocation?{id:id(allocation.id),active:bool(allocation.active)}:null,
   snapshotMatches:bool(l.snapshotMatches),capabilities:{canApprove:bool(cap.canApprove),canOptIn:bool(cap.canOptIn),canWithdraw:bool(cap.canWithdraw),canActivate:bool(cap.canActivate),canRevoke:bool(cap.canRevoke)}}
 })
 return {society:{id:societyId,name:text(s.name),ownershipVersion:integer(s.ownershipVersion,1),productTier:choice(s.productTier,['STARTER','PROFESSIONAL','PREMIUM','ENTERPRISE'] as const),enabledFeatures:s.enabledFeatures as string[]},partner:{id:id(p.id),name:text(p.name),status:choice(p.status,['DRAFT','ACTIVE','RESTRICTED','TERMINATED'] as const)},licenses,hasMore:bool(root.hasMore),domainPreviewEnabled:bool(root.domainPreviewEnabled)}
}
export function licensingRequestKey(session:Session,overview:LicensingOverview,license:LicenseView,action:string){return `${licensingSessionKey(session)}:${overview.society.ownershipVersion}:${license.grantId}:${license.grantVersion}:${license.consent?.id??''}:${action}`}
export function parseDomainPreview(value:unknown,overview:LicensingOverview){
 const r=object(value)
 if(r.testOnly!==true||r.candidateOnly!==true||r.routingActivated!==false||r.societyId!==overview.society.id||r.partnerId!==overview.partner.id)throw new Error('Invalid domain preview scope')
 const hostname=text(r.hostname,253)
 if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(hostname))throw new Error('Invalid preview hostname')
 return {hostname,testOnly:true as const}
}
