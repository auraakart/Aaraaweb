import {normalizePartnerDomainHostname,resolveVerifiedPartnerDomainHost} from './partner-domain-contract.mjs';

/**
 * Pure preflight for FUTURE trusted partner Host routing. No I/O, no cookies,
 * no session issuing, no actual Next.js routing, no database or TLS.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const originMatches=(origin,host)=>{
 if(typeof origin!=='string'||origin.length>512||/[^\x20-\x7e]/.test(origin))return false;
 let url;
 try{url=new URL(origin)}catch{return false}
 return url.origin===origin&&url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&url.hostname===host;
};
export const testHostResponseHeaders=Object.freeze({
 'Cache-Control':'no-store, private',
 'Vary':'Host, Origin',
 'Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff',
});
export function resolveLocalPartnerHostContext({rawHost,origin,forwardedHost,registry,platformHostnames,nowUtc}={}){
 if(typeof rawHost!=='string'||typeof forwardedHost==='string'&&forwardedHost.length>0||
    !Array.isArray(platformHostnames)||platformHostnames.length<1||platformHostnames.length>20||
    !Array.isArray(registry)||registry.length>50||typeof nowUtc!=='string')return null;
 let hostname,platform;
 try{hostname=normalizePartnerDomainHostname(rawHost);
     platform=platformHostnames.map(x=>normalizePartnerDomainHostname(x));
 }catch{return null}
 if(new Set(platform).size!==platform.length||!originMatches(origin,hostname))return null;
 if(platform.includes(hostname))return Object.freeze({
  kind:'PLATFORM',hostname,routingActivated:false,sessionBound:false,
 });
 const candidate=resolveVerifiedPartnerDomainHost(rawHost,registry,nowUtc,{reservedHostnames:platform});
 if(!candidate||!uuid.test(candidate.partnerId)||!uuid.test(candidate.brandId))return null;
 return Object.freeze({
  kind:'PARTNER_PREVIEW',hostname:candidate.hostname,
  partnerId:candidate.partnerId,brandId:candidate.brandId,
  routingActivated:false,sessionBound:false,
 });
}
/** Existing bearer sessions are deliberately not host-bound. */
export function previewSessionHostMatch(session,hostContext){
 return Boolean(session&&hostContext?.kind==='PARTNER_PREVIEW'&&
   uuid.test(session.sessionId??'')&&session.audience==='PARTNER_HOST_BOUND'&&
   session.originHost===hostContext.hostname&&session.partnerId===hostContext.partnerId&&
   session.hostBindingVerified===true);
}
