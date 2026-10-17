import React from 'react'
import { createRoot } from 'react-dom/client'
import PartnerPage from '../../app/partners/page'
const params=new URLSearchParams(location.search),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',d='44444444-4444-4444-8444-444444444444'
const session={sessionId:d,societyId:c,role:'SOCIETY_ADMIN',societyName:'Society',accessToken:'token',refreshToken:'refresh'}
sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(session))
const requests:string[]=[];Object.assign(window,{partnerRequests:requests})
window.fetch=async(input)=>{const path=String(input);requests.push(path)
 const role=params.get('role')??'OWNER'
 if(path.endsWith('/workspaces'))return Response.json({memberships:params.has('revoked')?[]:[{id:c,role,partner:{id:a,displayName:'Partner A'}},{id:d,role,partner:{id:b,displayName:'Partner B'}}],hasMore:false})
 if(path.endsWith('/members'))return Response.json([{id:c,role:'SUPPORT',createdAt:'2026-10-13T00:00:00.000Z'}])
 if(params.has('stale')&&path.includes(a))await new Promise(resolve=>setTimeout(resolve,300))
 return Response.json({partner:{id:path.includes(a)?a:b,displayName:path.includes(a)?'Partner A':'Partner B'},societies:[{id:c,name:path.includes(a)?'Society A':'Society B',status:'ACTIVE'}],hasMore:false})
}
createRoot(document.getElementById('root')!).render(<PartnerPage/> )
