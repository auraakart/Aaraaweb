import PartnerBranding from '../../app/partners/branding/page'
import React from 'react'
import { createRoot } from 'react-dom/client'
import PartnerOperations from '../../app/partners/operations/page'
import PartnerPage from '../../app/partners/page'
const params=new URLSearchParams(location.search),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',d='44444444-4444-4444-8444-444444444444'
const session={sessionId:d,societyId:c,role:'SOCIETY_ADMIN',societyName:'Society',accessToken:'token',refreshToken:'refresh'}
sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(session))
const requests:string[]=[];Object.assign(window,{partnerRequests:requests})
let brandVersion=0,publishedVersion=0
window.fetch=async(input)=>{const path=String(input);requests.push(path)
 const role=params.get('role')??'OWNER'
 if(path.endsWith('/readiness'))return Response.json({partnerId:path.includes(a)?a:b,branding:{published:publishedVersion>0,version:publishedVersion||null},domains:{verified:1,expiringSoon:0},licensing:{approvedActiveGrant:true,ambiguous:false},hasMoreApplications:false,applications:[],scopes:{pending:1,approved:0},dispatchAllowed:false,productionReady:false})
 if(path.endsWith('/branding'))return Response.json({latestVersion:brandVersion,revisions:brandVersion?[{id:c,version:brandVersion,publishedAt:publishedVersion?'2026-10-23T00:00:00Z':null}]:[],published:publishedVersion?{id:c,version:publishedVersion}:null})
 if(path.endsWith('/branding/drafts')){brandVersion++;return Response.json({id:c,version:brandVersion})}
 if(path.endsWith('/publish')){publishedVersion=brandVersion;return Response.json({published:true})}
 if(path.endsWith('/workspaces'))return Response.json({memberships:params.has('revoked')?[]:[{id:c,role,partner:{id:a,displayName:'Partner A'}},{id:d,role,partner:{id:b,displayName:'Partner B'}}],hasMore:false})
 if(path.endsWith('/operations'))return Response.json({partnerId:path.includes(a)?a:b,societies:params.has('noSocietyAccess')?[]:[{societyId:c,societyName:path.includes(a)?'Society A':'Society B',finance:null,helpdesk:null,facilities:{openWorkOrders:2,overdueWorkOrders:1}}],hasMore:false,generatedAt:'2026-10-21T12:00:00Z'})
 if(path.endsWith('/members'))return Response.json([{id:c,role:'SUPPORT',createdAt:'2026-10-13T00:00:00.000Z'}])
 if(params.has('stale')&&path.includes(a))await new Promise(resolve=>setTimeout(resolve,300))
 return Response.json({partner:{id:path.includes(a)?a:b,displayName:path.includes(a)?'Partner A':'Partner B'},societies:[{id:c,name:path.includes(a)?'Society A':'Society B',status:'ACTIVE'}],hasMore:false})
}
createRoot(document.getElementById('root')!).render(params.has('branding')?<PartnerBranding/>:params.has('operations')?<PartnerOperations/>:<PartnerPage/> )
