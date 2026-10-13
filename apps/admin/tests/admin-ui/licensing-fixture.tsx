import { createRoot } from 'react-dom/client'
import LicensingPage from '../../app/licensing/page'
import '../../app/globals.css'
import '../../app/brand-tokens.css'
const options=new URLSearchParams(window.location.search),mode=options.get('mode')??'pending',role=options.get('role')??'SUPER_ADMIN'
const societyId='11111111-1111-4111-8111-111111111111',otherSociety='66666666-6666-4666-8666-666666666666',partnerId='22222222-2222-4222-8222-222222222222',grantId='33333333-3333-4333-8333-333333333333',consentId='55555555-5555-4555-8555-555555555555'
let session={sessionId:'44444444-4444-4444-8444-444444444444',societyId,role,accessToken:'fixture-token',refreshToken:'fixture-refresh',societyName:'First society'}
sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(session))
const requests:Array<{path:string;body:Record<string,unknown>}>=[];Object.assign(window,{licensingRequests:requests})
let approved=mode!=='pending',consented=mode==='response-lost',allocated=false,lost=false,count=0
function overview(captured= session){return {society:{id:captured.societyId,name:captured.societyName,ownershipVersion:1,productTier:'STARTER',enabledFeatures:['VISITOR_MANAGEMENT','NOTICES','SOS']},partner:{id:partnerId,name:'Configured partner',status:'ACTIVE'},licenses:[{grantId,grantVersion:1,planCode:'COMMUNITY_PLAN',planVersion:1,startsAt:'2026-01-01T00:00:00Z',endsAt:'2030-01-01T00:00:00Z',graceUntil:null,phase:'ACTIVE',approvalState:approved?'APPROVED':'PENDING',maximumSocieties:5,maximumDomains:1,used:captured.role==='SUPER_ADMIN'?(allocated?1:0):null,consent:consented?{id:consentId,decision:'OPT_IN'}:null,allocation:allocated?{id:'77777777-7777-4777-8777-777777777777',active:true}:null,snapshotMatches:consented,capabilities:{canApprove:!approved&&captured.role==='SUPER_ADMIN',canOptIn:approved&&!consented,canWithdraw:consented,canActivate:approved&&consented&&!allocated&&captured.role==='SUPER_ADMIN',canRevoke:approved&&captured.role==='SUPER_ADMIN'}}],hasMore:false,domainPreviewEnabled:false}}
const json=(data:unknown)=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})
Object.assign(window,{changeLicensingContext:()=>{session={...session,sessionId:'88888888-8888-4888-8888-888888888888',societyId:otherSociety,societyName:'Second society'};sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(session));window.dispatchEvent(new Event('focus'))}})
window.fetch=async(input,init={})=>{
 const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url,url=new URL(raw,window.location.origin),path=url.pathname,method=(init.method??'GET').toUpperCase()
 if(path.endsWith('/overview')){
  const captured={...session};count++
  if(mode==='stale'&&count===1)return new Promise<Response>(resolve=>Object.assign(window,{resolveFirstLicensingOverview:()=>resolve(json(overview(captured)))}))
  return json(overview(captured))
 }
 if(method==='POST'){
  const body=JSON.parse(String(init.body)) as Record<string,unknown>;requests.push({path,body})
  if(path.endsWith('/approvals'))approved=true
  if(path.endsWith('/consents'))consented=body.decision==='OPT_IN'
  if(path.endsWith('/allocations')){allocated=true;if(mode==='response-lost'&&!lost){lost=true;throw new TypeError('Response lost after commit')}}
  return json({id:'77777777-7777-4777-8777-777777777777',status:'RECORDED'})
 }
 return json({})
}
createRoot(document.getElementById('root')!).render(<LicensingPage/>)
