import {createRoot} from 'react-dom/client'
import {AdminConsole} from '../../app/admin-console'
import AuditorWorkspace from '../../app/audit/page'
import ProviderPage from '../../app/provider/page'
import PartnerLoginPage from '../../app/partners/login/page'
import '../../app/globals.css'
import '../../app/admin-shell.css'

const options=new URLSearchParams(location.search),mode=options.get('mode')??'console'
const storageKey=mode==='provider'?'aaraagate.provider.session':mode==='partner'?'aaraagate.partner.session':'aaraagate.admin.session'
const initial={sessionId:'original',accessToken:'original-access',refreshToken:'original-refresh'}
sessionStorage.removeItem(storageKey)
if(options.has('restore'))sessionStorage.setItem(storageKey,JSON.stringify(initial))
type Pending={path:string;body:unknown;reply:(value:unknown,status:number)=>void}
const requests:Pending[]=[]
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
const summary={access:{visitorEntries:0,workforceEntries:0},maintenance:{billedPaise:0,outstandingPaise:0},helpdesk:{open:0},audit:{eventCount:0}}
const role=mode==='audit'?'AUDITOR':mode==='provider'?'OWNER':'SECURITY_SUPERVISOR'
const credentials={sessionId:'accepted',accessToken:'accepted-access',refreshToken:'accepted-refresh'}
const root=createRoot(document.getElementById('root')!)
Object.assign(window,{login:{requests,storageKey,
  replace(notify=false){sessionStorage.setItem(storageKey,JSON.stringify({sessionId:'replacement',accessToken:'replacement-access',refreshToken:'replacement-refresh'}));if(notify)window.dispatchEvent(new Event('storage'))},
  unmount(){root.unmount()},
  reply(index:number,value:unknown,status=200){requests[index].reply(value,status)},
  verified(choice=false){
    if(mode==='partner')return{contextType:'PARTNER',verified:true,session:{sessionId:'11111111-1111-4111-8111-111111111111',accessToken:'a'.repeat(64),refreshToken:'b'.repeat(96)}}
    const memberships=[{societyId:'society-one',role,society:{name:'First society'}},...(choice?[{societyId:'society-two',role,society:{name:'Second society'}}]:[])]
    return{userId:'user-one',memberships,selectionToken:'selection-token',...(choice?{}:{session:credentials})}
  },
  selected(){return{session:credentials}},
}})
window.fetch=async(input,init={})=>{
  const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname
  if(path.includes('/auth/'))return new Promise<Response>(resolve=>requests.push({path,body:init.body?JSON.parse(String(init.body)):null,reply:(value,status)=>resolve(json(value,status))}))
  if(path.endsWith('/provider/services/me'))return json({message:'Provider profile not registered'},403)
  if(path.endsWith('/provider-onboarding/me'))return json(null)
  if(path.endsWith('/reports/summary/comparison'))return json({current:summary,previous:summary})
  if(path.endsWith('/reports/audit')||path.endsWith('/reports/maintenance'))return json({page:1,pageSize:30,total:0,items:[]})
  if(path.includes('branding'))return json(null)
  return json([])
}
root.render(mode==='audit'?<AuditorWorkspace/>:mode==='provider'?<ProviderPage/>:mode==='partner'?<PartnerLoginPage/>:<AdminConsole/>)
