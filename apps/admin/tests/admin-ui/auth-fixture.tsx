import {createRoot} from 'react-dom/client'
import {AdminConsole} from '../../app/admin-console'
import AuditorWorkspace from '../../app/audit/page'
import type {Session} from '../../lib/admin-client'
import '../../app/globals.css'
import '../../app/admin-shell.css'

const mode=new URLSearchParams(location.search).get('mode')??'console'
const initial:Session={sessionId:'original',accessToken:'original-access',refreshToken:'original-refresh',societyId:'society-one',societyName:'Original society',role:mode==='audit'?'AUDITOR':'SECURITY_SUPERVISOR'}
const storageKey='aaraagate.admin.session'
sessionStorage.setItem(storageKey,JSON.stringify(initial))
type Pending={path:string;body:unknown;replied:boolean;reply:(value:unknown,status:number)=>void}
const requests:Pending[]=[]
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
const summary={access:{visitorEntries:0,workforceEntries:0},maintenance:{billedPaise:0,outstandingPaise:0},helpdesk:{open:0},audit:{eventCount:0}}
Object.assign(window,{auth:{requests,
  replace(notify=false){sessionStorage.setItem(storageKey,JSON.stringify({...initial,sessionId:'replacement',accessToken:'replacement-access',refreshToken:'replacement-refresh',societyName:'Replacement society'}));if(notify)window.dispatchEvent(new Event('storage'))},
  reply(path:string,value:unknown,status=200){const item=requests.find(item=>item.path===path&&!item.replied);if(!item)throw Error(`No pending ${path}`);item.replied=true;item.reply(value,status)},
  ready(){this.reply('/api/v1/auth/refresh',{sessionId:'rotated',accessToken:'rotated-access',refreshToken:'rotated-refresh'})},
}})
window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),path=url.pathname
  if(path.endsWith('/auth/refresh')||path.endsWith('/auth/logout'))return new Promise<Response>(resolve=>requests.push({path,body:init.body?JSON.parse(String(init.body)):null,replied:false,reply:(value,status)=>resolve(json(value,status))}))
  if(path.endsWith('/reports/summary/comparison'))return json({current:summary,previous:summary})
  if(path.endsWith('/reports/audit')||path.endsWith('/reports/maintenance'))return json({page:1,pageSize:30,total:0,items:[]})
  if(path.includes('branding'))return json(null)
  return json([])
}
createRoot(document.getElementById('root')!).render(mode==='audit'?<AuditorWorkspace/>:<AdminConsole/>)
